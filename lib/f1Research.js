/**
 * Part 133 — three Filter 1 AI calls (benchmark relevance, claim check, route check).
 * Cached on input hash + F1_PROMPT_VERSION; first writer wins via research_cache.
 */
import { createHash } from "node:crypto";
import { callLlm } from "./callLlm.js";
import { F1_PROMPT_VERSION, AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION } from "./lockedConstants.js";
import { getResearchCache, saveResearchCache } from "./db.js";
import {
  sanitizeBenchmarkCheck,
  sanitizeClaimChecks,
  sanitizeRouteCheck,
} from "./f1ResearchSafeguards.js";
import { isExplicitFirstMoverClaim, textConfirmedByPerson } from "./filter1Check.js";
import { researchDisplayValue } from "./inputReview.js";

export const F1_BENCHMARK_PROMPT_TOKEN = "PRIMUS_F1_BENCHMARK_CHECK";
export const F1_CLAIM_PROMPT_TOKEN = "PRIMUS_F1_CLAIM_CHECK";
export const F1_ROUTE_PROMPT_TOKEN = "PRIMUS_F1_ROUTE_CHECK";

function hashPayload(kind, payload) {
  return createHash("sha256")
    .update(`F1:${F1_PROMPT_VERSION}:${kind}:${JSON.stringify(payload)}`)
    .digest("hex");
}

async function cacheGet(hash) {
  try {
    const hit = await getResearchCache(hash);
    return hit?.researchFindings?.f1Step || null;
  } catch {
    return null;
  }
}

async function cacheSet(hash, step, provider) {
  try {
    await saveResearchCache(hash, {
      researchFindings: { f1Step: step },
      suggestions: null,
      sources: [],
      notCovered: [],
      division: "",
      providerUsed: provider,
    });
  } catch (e) {
    console.warn(`[primus/f1-research] cache write failed: ${e?.message || e}`);
  }
}

function extractSourcesFromLlm(result) {
  const fromUsage = Array.isArray(result?.sources) ? result.sources : [];
  const fromMeta = Array.isArray(result?.webSearchSources) ? result.webSearchSources : [];
  const fromCitations = Array.isArray(result?.citations) ? result.citations : [];
  return [...fromUsage, ...fromMeta, ...fromCitations];
}

function parseJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export function shouldRunBenchmarkCheck(f1 = {}) {
  return Boolean(String(f1.benchmark || "").trim()) && !isExplicitFirstMoverClaim(f1);
}

export function confirmedTextsForClaimCheck(f1 = {}, autofillStatus = {}) {
  const out = {};
  if (
    String(f1.gapDerivation || "").trim() &&
    textConfirmedByPerson("f1.gapDerivation", f1.gapDerivation, autofillStatus)
  ) {
    out.gapDerivation = String(f1.gapDerivation).trim();
  }
  if (
    String(f1.parityExceptions || "").trim() &&
    textConfirmedByPerson("f1.parityExceptions", f1.parityExceptions, autofillStatus)
  ) {
    out.parityExceptions = String(f1.parityExceptions).trim();
  }
  if (
    String(f1.growthArgument || "").trim() &&
    textConfirmedByPerson("f1.growthArgument", f1.growthArgument, autofillStatus)
  ) {
    out.growthArgument = String(f1.growthArgument).trim();
  }
  return out;
}

export function shouldRunClaimCheck(f1 = {}, autofillStatus = {}) {
  return Object.keys(confirmedTextsForClaimCheck(f1, autofillStatus)).length > 0;
}

export function shouldRunRouteCheck(f1 = {}, autofillStatus = {}) {
  const route = String(f1.growthRoute || "").trim();
  if (!route) return false;
  if (!AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION) return true;
  return textConfirmedByPerson("f1.growthRoute", f1.growthRoute, autofillStatus);
}

export async function runF1BenchmarkCheck(doc = {}, { provider = "claude" } = {}) {
  const f1 = doc.f1 || {};
  if (!shouldRunBenchmarkCheck(f1)) return null;
  const benchmark = researchDisplayValue("benchmark", f1.benchmark);
  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    benchmark,
  };
  const hash = hashPayload("benchmark", payload);
  const cached = await cacheGet(hash);
  if (cached?.benchmarkCheck) return { ...cached.benchmarkCheck, cached: true, cacheKey: hash };

  const system = [
    F1_BENCHMARK_PROMPT_TOKEN,
    "You check whether a named FMCG competitor benchmark is a real product on sale in India now,",
    "in the same category and segment as the idea. Use web search.",
    'Reply ONLY JSON: {"status":"relevant"|"not-found"|"not-relevant","found?":"...","reason?":"...","sold_in_india?":true|false,"category_match?":true|false,"stronger_competitors?":[],"source_url?":"https://..."}',
    "Relevant = real product, sold in India now, same category/segment. Stronger competitors or price-tier notes are never a mark-down by themselves.",
  ].join("\n");

  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: true,
      maxTokens: 900,
      temperature: 0,
      tier: "heavy",
      label: "f1-benchmark-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-benchmark] failed: ${e?.message || e}`);
    return { status: "not-found", reason: String(e?.message || e).slice(0, 160), cacheKey: hash };
  }

  const parsed = parseJsonText(result?.text || result?.content);
  const sources = extractSourcesFromLlm(result);
  const sanitized = sanitizeBenchmarkCheck(parsed || {}, sources);
  await cacheSet(hash, { benchmarkCheck: sanitized }, provider);
  return { ...sanitized, cached: false, cacheKey: hash };
}

export async function runF1ClaimCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  const texts = confirmedTextsForClaimCheck(f1, statusMap);
  if (!Object.keys(texts).length) return null;

  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    texts,
  };
  const hash = hashPayload("claims", payload);
  const cached = await cacheGet(hash);
  if (cached?.claimChecks) return { claimChecks: cached.claimChecks, cached: true, cacheKey: hash };

  const system = [
    F1_CLAIM_PROMPT_TOKEN,
    "Fact-check FMCG NPD claims with web search. Claims about the NEW product (no public data) must be unverifiable.",
    "For each text, list up to 6 checkable factual claims.",
    'Reply ONLY JSON: {"gapDerivation?:":{"claims":[{"claim","verdict":"supported"|"contradicted"|"unverifiable","source_url?","quote?"}]},"parityExceptions?:":{...},"growthArgument?:":{...}}',
    "A text with no checkable claim is unverified (empty claims array).",
  ].join("\n");

  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: true,
      maxTokens: 1400,
      temperature: 0,
      tier: "heavy",
      label: "f1-claim-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-claims] failed: ${e?.message || e}`);
    return { claimChecks: {}, error: String(e?.message || e).slice(0, 160), cacheKey: hash };
  }

  const parsed = parseJsonText(result?.text || result?.content) || {};
  const sources = extractSourcesFromLlm(result);
  const claimChecks = sanitizeClaimChecks(parsed, sources);
  await cacheSet(hash, { claimChecks }, provider);
  return { claimChecks, cached: false, cacheKey: hash };
}

export async function runF1RouteCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  if (!shouldRunRouteCheck(f1, statusMap)) return null;

  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    targetConsumer: String(f1.targetConsumer || "").trim(),
    growthRoute: String(f1.growthRoute || "").trim(),
    growthArgument: String(f1.growthArgument || "").trim(),
  };
  const hash = hashPayload("route", payload);
  const cached = await cacheGet(hash);
  if (cached?.routeCheck) return { ...cached.routeCheck, cached: true, cacheKey: hash };

  const system = [
    F1_ROUTE_PROMPT_TOKEN,
    "No web search. Classify the growth route.",
    "Definitions word for word:",
    "New market = the target audience is new to the brand's current buyers.",
    "Frequency = the goal is to make current buyers buy or use it more often.",
    "Penetration = the goal is to make it accessible to more people in the current audience.",
    'Reply ONLY JSON: {"expected":"penetration"|"frequency"|"new-market","confidence":"high"|"medium"|"low","reason":"..."}',
  ].join("\n");

  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: false,
      maxTokens: 400,
      temperature: 0,
      tier: "light",
      label: "f1-route-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-route] failed: ${e?.message || e}`);
    return { expected: "", confidence: "low", reason: String(e?.message || e).slice(0, 160), cacheKey: hash };
  }

  const parsed = parseJsonText(result?.text || result?.content) || {};
  const sanitized = sanitizeRouteCheck(parsed);
  await cacheSet(hash, { routeCheck: sanitized }, provider);
  return { ...sanitized, cached: false, cacheKey: hash };
}

/**
 * Run applicable F1 research steps and merge into findings.f1.
 */
export async function runFilter1ExtraChecks(doc = {}, { provider = "claude" } = {}) {
  const autofillStatus = doc.researchFindings?.autofillStatus || {};
  const [benchmarkCheck, claimResult, routeCheck] = await Promise.all([
    runF1BenchmarkCheck(doc, { provider }),
    runF1ClaimCheck(doc, { provider, autofillStatus }),
    runF1RouteCheck(doc, { provider, autofillStatus }),
  ]);
  return {
    benchmarkCheck: benchmarkCheck || undefined,
    claimChecks: claimResult?.claimChecks || undefined,
    routeCheck: routeCheck || undefined,
  };
}
