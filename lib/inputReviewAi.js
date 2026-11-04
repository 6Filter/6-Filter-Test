/**
 * Part 132 D14 — advisory AI input review. Notes only; never changes score/verdict.
 */
import { createHash } from "node:crypto";
import { AI_INPUT_REVIEW, INPUT_REVIEW_AI_MAX_INPUT_TOKENS } from "./lockedConstants.js";
import { researchDisplayValue } from "./inputReview.js";
import { callLlm } from "./callLlm.js";
import { getResearchCache, saveResearchCache } from "./db.js";

export const INPUT_REVIEW_PROMPT_TOKEN = "PRIMUS_INPUT_REVIEW";

/** Process-lifetime cache so twin Submits do not re-spend (also mirrored in research_cache). */
const memoryAiCache = new Map();

export function inputReviewCacheKey(doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    attribute: String(f1.declaredAttribute || "").trim(),
    benchmark: researchDisplayValue("benchmark", f1.benchmark),
    gap: f1.declaredGap,
    gst: f2.gstRatePct,
    margin: f2.netMarginAtScale,
    mrp: f2.mrpInr,
    cogs: f2.cogsAtScale,
    grammage: f2.grammage,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** 64-char hex distinct from researchHashFor (namespaced payload). */
export function inputReviewStorageHash(docOrKey = {}) {
  const key = typeof docOrKey === "string" ? docOrKey : inputReviewCacheKey(docOrKey);
  return createHash("sha256").update(`PRIMUS_INPUT_REVIEW:${key}`).digest("hex");
}

export function buildInputReviewUserPayload(doc = {}) {
  const f1 = doc.f1 || {};
  return {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    declaredAttribute: String(f1.declaredAttribute || "").trim(),
    benchmark: researchDisplayValue("benchmark", f1.benchmark),
  };
}

export function parseInputReviewAiResponse(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { fields: [] };
    }
  }
  const fields = Array.isArray(parsed?.fields) ? parsed.fields : [];
  return {
    fields: fields
      .map((f) => ({
        field: String(f?.field || "").trim(),
        status: f?.status === "suspect" ? "suspect" : "ok",
        issue: f?.issue ? String(f.issue).trim() : undefined,
        suggestion: f?.suggestion ? String(f.suggestion).trim() : undefined,
      }))
      .filter((f) => f.field),
  };
}

/**
 * Merge AI notes onto deterministic review. AI never removes invalid/warn rows.
 */
export function mergeInputReview(deterministic, ai) {
  const base = {
    fields: Array.isArray(deterministic?.fields) ? [...deterministic.fields] : [],
    blocking: Boolean(deterministic?.blocking),
  };
  if (!ai || !Array.isArray(ai.fields) || !ai.fields.length) {
    return { ...base, ai: ai || null };
  }
  return { ...base, ai };
}

export function shouldRunInputReviewAi(deterministic) {
  return AI_INPUT_REVIEW === true && !deterministic?.blocking;
}

export function inputReviewSystemPrompt() {
  return [
    INPUT_REVIEW_PROMPT_TOKEN,
    "You review NPD idea inputs for CavinKare India. No web search.",
    "Reply ONLY with JSON: {\"fields\":[{\"field\":\"name|category|ideaDescription|declaredAttribute|benchmark\",\"status\":\"ok\"|\"suspect\",\"issue?\":\"...\",\"suggestion?\":\"...\"}]}",
    "Check: category fits the idea; attribute is a consumer benefit not an ingredient/brand; benchmark reads like a real consumer product in this category; description is a product concept.",
    "Never invent shelf verification — Filter 1 research decides whether the benchmark exists.",
    `Keep the reply under ${INPUT_REVIEW_AI_MAX_INPUT_TOKENS} input tokens of context.`,
  ].join("\n");
}

/**
 * One cached plain LLM call (no web search). Failures return empty notes — never blocks Submit.
 */
export async function runInputReviewAi(doc = {}, { provider = "claude" } = {}) {
  if (!AI_INPUT_REVIEW) return { fields: [], cacheKey: inputReviewCacheKey(doc), cached: false };
  const cacheKey = inputReviewCacheKey(doc);
  const storageHash = inputReviewStorageHash(cacheKey);

  if (memoryAiCache.has(cacheKey)) {
    return { fields: memoryAiCache.get(cacheKey), cacheKey, cached: true };
  }
  try {
    const hit = await getResearchCache(storageHash);
    const cachedFields = hit?.researchFindings?.inputReviewAi?.fields;
    if (Array.isArray(cachedFields)) {
      memoryAiCache.set(cacheKey, cachedFields);
      return { fields: cachedFields, cacheKey, cached: true };
    }
  } catch {
    /* cache miss is fine */
  }

  const userPayload = buildInputReviewUserPayload(doc);
  let text = "";
  try {
    const result = await callLlm({
      provider,
      system: inputReviewSystemPrompt(),
      userText: JSON.stringify(userPayload),
      useWebSearch: false,
      maxTokens: 600,
      temperature: 0,
      tier: "light",
      label: "input-review",
    });
    text = String(result?.text || result?.content || "").trim();
  } catch (e) {
    console.warn(`[primus/input-review] AI call failed: ${e?.message || e}`);
    return { fields: [], cacheKey, cached: false, error: String(e?.message || e) };
  }

  const parsed = parseInputReviewAiResponse(text);
  memoryAiCache.set(cacheKey, parsed.fields);
  try {
    await saveResearchCache(storageHash, {
      researchFindings: { inputReviewAi: { fields: parsed.fields, cacheKey } },
      suggestions: null,
      sources: [],
      notCovered: [],
      division: "",
      providerUsed: provider,
    });
  } catch (e) {
    console.warn(`[primus/input-review] cache write failed: ${e?.message || e}`);
  }
  return { ...parsed, cacheKey, cached: false };
}
