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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(betas.length ? { "anthropic-beta": betas.join(",") } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    // Never echo secrets that might appear in provider errors
    const safe = errBody.replace(/sk-ant-[A-Za-z0-9\-_]+/g, "[redacted]").slice(0, 220);
    if (isAnthropicCreditFailure(res.status, errBody)) {
      throw billingCreditExhaustedError(resolved.billingDepartment, new Error(safe));
    }
    const err = new Error(`Claude API failed (${res.status}). ${safe}`);
    err.status = res.status;
    throw err;
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
