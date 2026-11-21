/**
 * Shared Anthropic Claude caller (server-side only).
 * Key never goes to the browser.
 *
 * Billing key comes from the verified session department (ALS / options.department),
 * never from the Proposition Form's "Your department" dropdown.
 */

import { sanitizeImageBase64, sniffImageMediaType } from "./mediaType.js";
import { currentBillingDepartment, currentLlmUserEmail } from "./llmContext.js";
import { modelForTier } from "./modelTier.js";
import { recordLlmUsage } from "./llmUsage.js";
import {
  ensureDepartmentApiKeysBootstrapped,
  isAnthropicCreditFailure,
  billingCreditExhaustedError,
  resolveBillingApiKey,
} from "./departmentApiKeys.js";
import { researchTrace, summarizeTools } from "./researchTrace.js";
import { anthropicSystemBlocks, cachedPrefixHash, isCachedSkillSystem } from "./skills/loadSkill.js";
import { replayActive } from "./replayGuard.js";
import { currentSubmissionCost } from "./submissionCost.js";

/** Sonnet 5 / Opus 5 / Fable 5 reject temperature, top_p, top_k. */
function rejectsSamplingParams(model) {
  const id = String(model || "");
  return /claude-(sonnet-5|opus-5|fable-5|opus-4-[789]|sonnet-4-6)/.test(id);
}

function extractWebSearchSources(content) {
  const sources = [];
  const seen = new Set();
  const push = (title, url) => {
    const href = String(url || "").trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    sources.push({ title: String(title || href).trim() || href, url: href });
  };

  for (const block of content || []) {
    if (block?.type === "web_search_tool_result") {
      const items = Array.isArray(block.content) ? block.content : [];
      for (const item of items) {
        if (item?.url) push(item.title, item.url);
      }
    }
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url) push(c.title, c.url);
      }
    }
  }
  return sources.slice(0, 8);
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_ATTEMPTS = 4;
const WAIT_BUDGET_MS = 90_000;
export const DEFAULT_ANTHROPIC_CONCURRENCY = 4;
export const DEFAULT_CALL_TIMEOUT_MS = 90_000;
export const DEFAULT_WEBSEARCH_TIMEOUT_MS = 240_000;
export const DEFAULT_QUEUE_WAIT_MS = 120_000;

function envMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactProviderBody(text) {
  return String(text || "").replace(/sk-ant-[A-Za-z0-9\-_]+/g, "[redacted]").slice(0, 220);
}

function parseRetryAfterMs(res) {
  const raw = res?.headers?.get?.("retry-after") || res?.headers?.get?.("Retry-After");
  if (raw == null || raw === "") return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return asNum < 100 ? asNum * 1000 : asNum;
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

function isRetryableStatus(status) {
  const s = Number(status);
  return s === 429 || s === 529 || (s >= 500 && s <= 503);
}

function isImmediateFailureStatus(status) {
  const s = Number(status);
  return s === 400 || s === 401 || s === 403 || s === 404 || s === 409 || s === 413 || s === 422;
}

function isNetworkError(error) {
  const code = String(error?.code || error?.cause?.code || "");
  const msg = String(error?.message || error || "");
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket|network/i.test(
    `${code} ${msg}`
  );
}

function isTimeoutError(error) {
  return error?.name === "AbortError" || error?.code === "ANTHROPIC_TIMEOUT" || /aborted|timeout/i.test(String(error?.message || ""));
}

function backoffMs(attemptIndex, retryAfterMs, remainingBudget) {
  if (remainingBudget <= 0) return 0;
  if (retryAfterMs != null && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(0, retryAfterMs), remainingBudget);
  }
  const base = Math.min(16_000, 400 * 2 ** attemptIndex);
  const wait = Math.floor(base * (0.5 + Math.random()));
  return Math.min(wait, remainingBudget);
}

class FifoSemaphore {
  constructor(limit) {
    this.limit = Math.max(1, Number(limit) || DEFAULT_ANTHROPIC_CONCURRENCY);
    this.active = 0;
    this.queue = [];
  }
  acquire(timeoutMs) {
    if (this.active < this.limit) {
      this.active += 1;
      anthropicRuntimeStats.inFlight = this.active;
      if (this.active > anthropicRuntimeStats.maxInFlight) {
        anthropicRuntimeStats.maxInFlight = this.active;
      }
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx >= 0) this.queue.splice(idx, 1);
        const err = new Error("Claude API queue wait timed out. Try Screen again in a moment.");
        err.status = 503;
        err.code = "ANTHROPIC_QUEUE_TIMEOUT";
        reject(err);
      }, Math.max(1, Number(timeoutMs) || DEFAULT_QUEUE_WAIT_MS));
      this.queue.push(entry);
    }).then(() => () => this.release());
  }
  release() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      anthropicRuntimeStats.inFlight = this.active;
      next.resolve();
      return;
    }
    this.active = Math.max(0, this.active - 1);
    anthropicRuntimeStats.inFlight = this.active;
  }
}

export const anthropicRuntimeStats = { inFlight: 0, maxInFlight: 0, attempts: 0 };

let gate = null;
let gateLimit = null;

function concurrencyLimit() {
  const n = Number(process.env.ANTHROPIC_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_ANTHROPIC_CONCURRENCY;
}

function getGate() {
  const limit = concurrencyLimit();
  if (!gate || gateLimit !== limit) {
    gate = new FifoSemaphore(limit);
    gateLimit = limit;
  }
  return gate;
}

export function resetAnthropicConcurrencyGateForTests() {
  gate = null;
  gateLimit = null;
  anthropicRuntimeStats.inFlight = 0;
  anthropicRuntimeStats.maxInFlight = 0;
  anthropicRuntimeStats.attempts = 0;
}

async function fetchAnthropicOnce(headers, bodyJson, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const err = new Error("Claude API timed out");
    err.code = "ANTHROPIC_TIMEOUT";
    controller.abort(err);
  }, timeoutMs);
  try {
    return await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers,
      body: bodyJson,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || isTimeoutError(error)) {
      const err = new Error("Claude API timed out");
      err.status = 504;
      err.code = "ANTHROPIC_TIMEOUT";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function throwClaudeFailure(status, errBody, billingDepartment) {
  const safe = redactProviderBody(errBody);
  if (isAnthropicCreditFailure(status, errBody)) {
    throw billingCreditExhaustedError(billingDepartment, new Error(safe));
  }
  const err = new Error(`Claude API failed (${status}). ${safe}`);
  err.status = status;
  throw err;
}

async function postAnthropicWithRetry({ headers, bodyJson, timeoutMs, billingDepartment }) {
  const startedWait = Date.now();
  let timeoutUsed = false;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    anthropicRuntimeStats.attempts += 1;
    try {
      const res = await fetchAnthropicOnce(headers, bodyJson, timeoutMs);
      if (res.ok) return res;
      const errBody = await res.text();
      if (isAnthropicCreditFailure(res.status, errBody) || isImmediateFailureStatus(res.status)) {
        throwClaudeFailure(res.status, errBody, billingDepartment);
      }
      if (!isRetryableStatus(res.status) || attempt === MAX_ATTEMPTS) {
        throwClaudeFailure(res.status, errBody, billingDepartment);
      }
      const remaining = WAIT_BUDGET_MS - (Date.now() - startedWait);
      if (remaining <= 0) throwClaudeFailure(res.status, errBody, billingDepartment);
      const waitMs = backoffMs(attempt - 1, parseRetryAfterMs(res), remaining);
      console.log(`[primus/anthropic] attempt=${attempt}/${MAX_ATTEMPTS} status=${res.status} wait_ms=${waitMs}`);
      await sleep(waitMs);
      lastError = new Error(`Claude API failed (${res.status}). ${redactProviderBody(errBody)}`);
      lastError.status = res.status;
    } catch (error) {
      if (error?.code === "BILLING_CREDIT_EXHAUSTED" || isImmediateFailureStatus(error?.status)) {
        throw error;
      }
      const timeout = error?.code === "ANTHROPIC_TIMEOUT" || isTimeoutError(error);
      const network = isNetworkError(error);
      const retryableHttp = isRetryableStatus(error?.status);
      if (timeout && timeoutUsed) throw error;
      if (timeout) timeoutUsed = true;
      const canRetry = (timeout || network || retryableHttp) && attempt < MAX_ATTEMPTS;
      if (!canRetry) {
        if (error?.status && /Claude API failed/.test(String(error.message || ""))) throw error;
        if (timeout) throw error;
        const err = new Error(`Claude API failed (${error?.status || "network"}). ${redactProviderBody(error?.message || error)}`);
        err.status = error?.status || 503;
        err.cause = error;
        throw err;
      }
      const remaining = WAIT_BUDGET_MS - (Date.now() - startedWait);
      if (remaining <= 0) throw error;
      const waitMs = backoffMs(attempt - 1, null, remaining);
      console.log(
        `[primus/anthropic] attempt=${attempt}/${MAX_ATTEMPTS} status=${timeout ? "timeout" : error?.status || "network"} wait_ms=${waitMs}`
      );
      await sleep(waitMs);
      lastError = error;
    }
  }
  throw lastError || new Error("Claude API failed (retry).");
}

export async function callAnthropic({
  userText,
  system,
  image = null,
  useWebSearch = false,
  maxTokens,
  maxUses,
  temperature = 0,
  department = null,
  tier = "heavy",
  label = "unlabeled",
}) {
  if (replayActive()) {
    throw new Error("REPLAY_MAY_NOT_CALL_LLM");
  }
  await ensureDepartmentApiKeysBootstrapped();
  const billingDepartment = department || currentBillingDepartment();
  const resolved = await resolveBillingApiKey(billingDepartment);
  const apiKey = resolved.apiKey;
  const model = modelForTier(tier === "light" ? "light" : "heavy");

  console.log(
    `[primus/billing] department=${resolved.billingDepartment || "(infra)"} source=${resolved.source}`
  );

  if (!apiKey || apiKey.includes("your-key")) {
    const onVercel = Boolean(process.env.VERCEL);
    const err = new Error(
      resolved.billingDepartment
        ? `Claude API key missing for ${resolved.billingDepartment}. Set that team's DEPT_API_KEY_* env var.`
        : onVercel
          ? "Claude API key missing. Set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables (one line, no spaces), then Redeploy."
          : "Claude API key missing. Put your real key in .env.local as ANTHROPIC_API_KEY=sk-ant-... (replace the placeholder), then restart npm run dev."
    );
    err.status = 500;
    throw err;
  }

  if (!apiKey.startsWith("sk-ant-")) {
    const err = new Error(
      "Anthropic API key looks invalid. Paste the key once as a single line (starts with sk-ant-)."
    );
    err.status = 500;
    throw err;
  }

  const rawImageData = image?.data ? sanitizeImageBase64(image.data) : "";
  const imageMediaType = rawImageData
    ? sniffImageMediaType(rawImageData, image.name, image.mediaType)
    : null;

  const userContent = !rawImageData
    ? userText
    : image.kind === "pdf" || image.mediaType === "application/pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: rawImageData,
            },
          },
          { type: "text", text: userText },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMediaType || "image/png",
              data: rawImageData,
            },
          },
          { type: "text", text: userText },
        ];

  // Thinking tokens count toward max_tokens on Sonnet 5 — leave room for the answer.
  const tokens = Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 4096 : 2048;
  const systemBlocks = anthropicSystemBlocks(system);
  const usesPromptCache = isCachedSkillSystem(system);
  const body = {
    model,
    max_tokens: tokens,
    messages: [{ role: "user", content: userContent }],
  };
  if (systemBlocks) body.system = systemBlocks;
  if (!rejectsSamplingParams(model)) {
    body.temperature = temperature ?? 0;
  } else {
    body.output_config = { effort: "low" };
  }

  if (useWebSearch) {
    const uses = Number(maxUses) > 0 ? Math.min(8, Math.floor(Number(maxUses))) : 3;
    body.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: uses,
        user_location: {
          type: "approximate",
          city: "Chennai",
          region: "Tamil Nadu",
          country: "IN",
          timezone: "Asia/Kolkata",
        },
      },
    ];
  }

  researchTrace("research-call", {
    input: { useWebSearch, model, hasSystem: Boolean(system), userChars: String(userText || "").length, promptCache: usesPromptCache },
    toolsAttached: summarizeTools(body.tools),
  });

  const betas = [];
  if (image?.kind === "pdf" || image?.mediaType === "application/pdf") {
    betas.push("pdfs-2024-09-25");
  }
  if (usesPromptCache) betas.push("prompt-caching-2024-07-31");

  const prefixHash = cachedPrefixHash(system);
  const startedAt = new Date().toISOString();
  const timeoutMs = useWebSearch
    ? envMs("ANTHROPIC_WEBSEARCH_TIMEOUT_MS", DEFAULT_WEBSEARCH_TIMEOUT_MS)
    : envMs("ANTHROPIC_TIMEOUT_MS", DEFAULT_CALL_TIMEOUT_MS);
  const queueWaitMs = envMs("ANTHROPIC_QUEUE_WAIT_MS", DEFAULT_QUEUE_WAIT_MS);
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    ...(betas.length ? { "anthropic-beta": betas.join(",") } : {}),
  };
  const bodyJson = JSON.stringify(body);
  const release = await getGate().acquire(queueWaitMs);
  let res;
  try {
    res = await postAnthropicWithRetry({
      headers,
      bodyJson,
      timeoutMs,
      billingDepartment: resolved.billingDepartment,
    });
  } finally {
    release();
  }

  const data = await res.json();
  const usage = data.usage && typeof data.usage === "object" ? data.usage : {};
  const cacheCreation = Number(usage.cache_creation_input_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const webSearchRequests = Number(usage.server_tool_use?.web_search_requests) || 0;
  console.log(
    `[primus/prompt-cache] cache_creation_input_tokens=${cacheCreation} ` +
      `cache_read_input_tokens=${cacheRead} input_tokens=${inputTokens} output_tokens=${outputTokens}`
  );
  console.log(`[primus/web-search-usage] web_search_requests=${webSearchRequests}`);
  recordLlmUsage({
    department: resolved.billingDepartment || "(infra)",
    label,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheCreation,
    webSearches: webSearchRequests,
    prefixHash,
    startedAt,
    endedAt: new Date().toISOString(),
    propositionId: currentSubmissionCost()?.propositionId || "",
    userEmail: String(currentLlmUserEmail() || "").trim().toLowerCase(),
  }).catch((e) => console.warn(`[primus/cost] ledger write failed: ${e.message || e}`));
  const content = Array.isArray(data.content) ? data.content : [];
  const text =
    content.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
  const sources = useWebSearch ? extractWebSearchSources(content) : [];
  if (useWebSearch) {
    researchTrace("research-call RAW RESPONSE", {
      stopReason: data.stop_reason || null,
      contentTypes: content.map((b) => b?.type).filter(Boolean),
      textChars: text.length,
      sources: sources.length,
      content,
    });
  }
  return {
    text,
    sources,
    content,
    stopReason: data.stop_reason || null,
    contentTypes: content.map((b) => b?.type).filter(Boolean),
    webSearchRequests,
    billingDepartment: resolved.billingDepartment,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreation,
      cache_read_input_tokens: cacheRead,
    },
  };
}
