/**
 * Part 133 (relevance) — Filter 1 / plan AI assessments stored as DATA.
 * Scoring reads only researchFindings.f1.assessments / f2.assessments — never trusts the model for a level.
 */
import { createHash } from "node:crypto";
import { callLlm } from "./callLlm.js";
import { F1_PROMPT_VERSION, AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION } from "./lockedConstants.js";
import { getResearchCache, saveResearchCache } from "./db.js";
import {
  sanitizeBenchmarkAssessment,
  sanitizeClaimAssessment,
  sanitizePlanAssessment,
} from "./f1ResearchSafeguards.js";
import { isExplicitFirstMoverClaim, textConfirmedByPerson } from "./filter1Check.js";
import { researchDisplayValue } from "./inputReview.js";
import { extractReturnedSourcesFromLlmResult, returnedSourceUrls } from "./returnedSources.js";
import { isTooShort, hasEnteredText } from "./relevanceGrade.js";

export const F1_BENCHMARK_PROMPT_TOKEN = "PRIMUS_F1_BENCHMARK_CHECK";
export const F1_CLAIM_PROMPT_TOKEN = "PRIMUS_F1_CLAIM_CHECK";
export const F1_ROUTE_PROMPT_TOKEN = "PRIMUS_F1_ROUTE_CHECK"; // legacy alias
export const F1_PLAN_PROMPT_TOKEN = "PRIMUS_PLAN_CHECK";

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
  const b = String(f1.benchmark || "").trim();
  if (!b || isTooShort(b)) return false;
  return !isExplicitFirstMoverClaim(f1);
}

export function confirmedTextsForClaimCheck(f1 = {}, autofillStatus = {}) {
  const out = {};
  if (
    hasEnteredText(f1.gapDerivation) &&
    !isTooShort(f1.gapDerivation) &&
    textConfirmedByPerson("f1.gapDerivation", f1.gapDerivation, autofillStatus)
  ) {
    out.gapDerivation = String(f1.gapDerivation).trim();
  }
  if (
    hasEnteredText(f1.parityExceptions) &&
    !isTooShort(f1.parityExceptions) &&
    textConfirmedByPerson("f1.parityExceptions", f1.parityExceptions, autofillStatus)
  ) {
    out.parityExceptions = String(f1.parityExceptions).trim();
  }
  if (
    hasEnteredText(f1.growthArgument) &&
    !isTooShort(f1.growthArgument) &&
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
  return shouldRunPlanCheck(f1, {}, autofillStatus);
}

export function shouldRunPlanCheck(f1 = {}, f2 = {}, autofillStatus = {}) {
  const route = String(f1.growthRoute || "").trim();
  const routeOk =
    route &&
    (!AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION ||
      textConfirmedByPerson("f1.growthRoute", f1.growthRoute, autofillStatus));
  const attrOk =
    hasEnteredText(f1.declaredAttribute) &&
    !isTooShort(f1.declaredAttribute) &&
    textConfirmedByPerson("f1.declaredAttribute", f1.declaredAttribute, autofillStatus);
  const qcomOk =
    hasEnteredText(f2.qcomTrajectory) &&
    !isTooShort(f2.qcomTrajectory) &&
    textConfirmedByPerson("f2.qcomTrajectory", f2.qcomTrajectory, autofillStatus);
  return Boolean(routeOk || attrOk || qcomOk);
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
  if (cached?.assessment) {
    return { assessment: cached.assessment, cached: true, cacheKey: hash };
  }

  const system = [
    F1_BENCHMARK_PROMPT_TOKEN,
    "You assess whether a named FMCG competitor benchmark is relevant. Use web search.",
    "Rubric: strong = real product on sale in India now, same category/segment, among the leaders;",
    "adequate = real and in the category but not among leaders, or a different price tier;",
    "weak = real but adjacent category; none = not found or unrelated.",
    'Reply ONLY JSON: {"relevance":"strong"|"adequate"|"weak"|"none","found?":"...","reason?":"...","source_url?":"https://...","stronger_competitors?":[]}',
    "Do not invent a source_url that was not returned by your own web search.",
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
    return {
      assessment: {
        raw: { relevance: "none", reason: String(e?.message || e).slice(0, 160) },
        returnedSources: [],
      },
      cacheKey: hash,
    };
  }

  const parsed = parseJsonText(result?.text || result?.content) || {};
  // Ignore any sources the model listed in JSON — only tool-result URLs count.
  delete parsed.returnedSources;
  delete parsed.sources;
  const returnedSources = extractReturnedSourcesFromLlmResult(result);
  const raw = sanitizeBenchmarkAssessment(parsed, returnedSourceUrls(returnedSources));
  const assessment = { raw, returnedSources: returnedSourceUrls(returnedSources) };
  await cacheSet(hash, { assessment }, provider);
  return { assessment, cached: false, cacheKey: hash };
}

export async function runF1ClaimCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  const texts = confirmedTextsForClaimCheck(f1, statusMap);
  if (!Object.keys(texts).length) return null;

  const derivationText = [texts.gapDerivation, texts.parityExceptions].filter(Boolean).join("\n---\n");
  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    derivation: derivationText || undefined,
    argument: texts.growthArgument || undefined,
  };
  const hash = hashPayload("claims", payload);
  const cached = await cacheGet(hash);
  if (cached?.derivation || cached?.argument) {
    return {
      derivation: cached.derivation,
      argument: cached.argument,
      cached: true,
      cacheKey: hash,
    };
  }

  const system = [
    F1_CLAIM_PROMPT_TOKEN,
    "Fact-check FMCG NPD texts with web search. Claims about the NEW product (no public data) are never contradicted.",
    "Rubric: strong = specific, differentiating, supported by cited public facts;",
    "adequate = specific and plausible but not verifiable; weak = generic; none = irrelevant or contradicted.",
    'Reply ONLY JSON: {"derivation":{"relevance","specific":true|false,"supported":true|false,"contradicted?":true|false,"source_url?","quote?"},"argument":{...}}',
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
    return { error: String(e?.message || e).slice(0, 160), cacheKey: hash };
  }

  const parsed = parseJsonText(result?.text || result?.content) || {};
  delete parsed.returnedSources;
  delete parsed.sources;
  const returnedSources = extractReturnedSourcesFromLlmResult(result);
  const urls = returnedSourceUrls(returnedSources);
  const derivation = payload.derivation
    ? { raw: sanitizeClaimAssessment(parsed.derivation || {}, urls), returnedSources: urls }
    : undefined;
  const argument = payload.argument
    ? { raw: sanitizeClaimAssessment(parsed.argument || {}, urls), returnedSources: urls }
    : undefined;
  await cacheSet(hash, { derivation, argument }, provider);
  return { derivation, argument, cached: false, cacheKey: hash };
}

export async function runF1PlanCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  if (!shouldRunPlanCheck(f1, f2, statusMap)) return null;

  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    targetConsumer: String(f1.targetConsumer || "").trim(),
    declaredAttribute: textConfirmedByPerson("f1.declaredAttribute", f1.declaredAttribute, statusMap)
      ? String(f1.declaredAttribute || "").trim()
      : "",
    growthRoute: textConfirmedByPerson("f1.growthRoute", f1.growthRoute, statusMap)
      ? String(f1.growthRoute || "").trim()
      : "",
    growthArgument: String(f1.growthArgument || "").trim(),
    qcomTrajectory: textConfirmedByPerson("f2.qcomTrajectory", f2.qcomTrajectory, statusMap)
      ? String(f2.qcomTrajectory || "").trim()
      : "",
    benchmark: String(f1.benchmark || "").trim(),
  };
  const hash = hashPayload("plan", payload);
  const cached = await cacheGet(hash);
  if (cached?.plan) return { plan: cached.plan, cached: true, cacheKey: hash };

  const system = [
    F1_PLAN_PROMPT_TOKEN,
    "No web search. Assess the team's own plan texts.",
    "Attribute rubric: strong = specific consumer benefit this idea can credibly deliver that differs from the benchmark; weak = generic.",
    "Quick-commerce rubric: strong = specific year-by-year assumptions (listing timeline, cities/share, take rate, commission, delivery-fee trajectory); weak = vague.",
    "Route definitions word for word:",
    "New market = the target audience is new to the brand's current buyers.",
    "Frequency = the goal is to make current buyers buy or use it more often.",
    "Penetration = the goal is to make it accessible to more people in the current audience.",
    'Reply ONLY JSON: {"attributes":{"relevance":"strong"|"adequate"|"weak"|"none","specific":true|false},"qcom":{"relevance":"...","specific":true|false},"route":{"matches":"yes"|"unclear"|"no","confidence":"high"|"medium"|"low","expected?":"...","reason?"}}',
  ].join("\n");

  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: false,
      maxTokens: 700,
      temperature: 0,
      tier: "light",
      label: "f1-plan-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-plan] failed: ${e?.message || e}`);
    return { error: String(e?.message || e).slice(0, 160), cacheKey: hash };
  }

  const parsed = parseJsonText(result?.text || result?.content) || {};
  const plan = sanitizePlanAssessment(parsed);
  await cacheSet(hash, { plan }, provider);
  return { plan, cached: false, cacheKey: hash };
}

/** @deprecated — route is now part of PRIMUS_PLAN_CHECK */
export async function runF1RouteCheck(doc = {}, opts = {}) {
  const out = await runF1PlanCheck(doc, opts);
  if (!out?.plan?.route) return null;
  return { ...out.plan.route, cached: out.cached, cacheKey: out.cacheKey };
}

/**
 * Run applicable F1/plan assessments and return findings patches.
 */
export async function runFilter1ExtraChecks(doc = {}, { provider = "claude" } = {}) {
  const autofillStatus = doc.researchFindings?.autofillStatus || {};
  const [benchmark, claims, plan] = await Promise.all([
    runF1BenchmarkCheck(doc, { provider }),
    runF1ClaimCheck(doc, { provider, autofillStatus }),
    runF1PlanCheck(doc, { provider, autofillStatus }),
  ]);

  const f1Assessments = {
    ...(doc.researchFindings?.f1?.assessments || {}),
  };
  if (benchmark?.assessment) f1Assessments.benchmark = benchmark.assessment;
  if (claims?.derivation) f1Assessments.derivation = claims.derivation;
  if (claims?.argument) f1Assessments.argument = claims.argument;
  if (plan?.plan?.attributes) f1Assessments.attributes = { raw: plan.plan.attributes };
  if (plan?.plan?.route) f1Assessments.route = { raw: plan.plan.route };

  const f2Assessments = {
    ...(doc.researchFindings?.f2?.assessments || {}),
  };
  if (plan?.plan?.qcom) f2Assessments.qcom = { raw: plan.plan.qcom };

  // Legacy mirrors for older code paths / tests
  const legacy = {};
  if (benchmark?.assessment?.raw) {
    const r = benchmark.assessment.raw;
    legacy.benchmarkCheck = {
      status:
        r.relevance === "strong"
          ? "relevant"
          : r.relevance === "none"
            ? "not-found"
            : "not-relevant",
      reason: r.reason,
      source_url: r.source_url,
      sources: benchmark.assessment.returnedSources,
    };
  }
  if (plan?.plan?.route) {
    legacy.routeCheck = plan.plan.route;
  }

  return {
    assessments: f1Assessments,
    f2Assessments,
    ...legacy,
  };
}
