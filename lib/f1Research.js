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
import { reviewInputsGuarded as reviewInputs } from "./answerGuard.js";
import { extractReturnedSourcesFromLlmResult, returnedSourceUrls } from "./returnedSources.js";
import { isTooShort, hasEnteredText } from "./relevanceGrade.js";
import {
  failedAssessment,
  isOkAssessment,
  isWebCheckedOk,
  okAssessment,
  searchUsedFromRequest,
  skippedAssessment,
} from "./assessmentResult.js";

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

/** Part 137 D43 — only status:"ok" results are cached. */
async function cacheSet(hash, step, provider) {
  try {
    const ok =
      (step?.assessment && isOkAssessment(step.assessment)) ||
      (step?.derivation && isOkAssessment(step.derivation)) ||
      (step?.parity && isOkAssessment(step.parity)) ||
      (step?.argument && isOkAssessment(step.argument)) ||
      (step?.plan && step.plan.status !== "failed");
    if (!ok) return;
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

function hasRelevanceField(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const r = parsed.relevance ?? parsed.status;
  return r != null && String(r).trim() !== "";
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

/**
 * Part 141 D73 — invalid free-text fields (field key → review issue) for this doc.
 * Invalid text never goes to the AI and never earns a grade.
 */
export function invalidIssuesForDoc(doc = {}) {
  const review = reviewInputs({
    f1: doc.f1,
    name: doc.name,
    category: doc.category,
    ideaDescription: doc.ideaDescription,
    f2: doc.f2,
  });
  const out = {};
  for (const issue of review.fields) {
    if (issue.status === "invalid" && !out[issue.field]) out[issue.field] = issue;
  }
  return out;
}

function skippedFor(issue) {
  return skippedAssessment(issue?.message || "Input is not valid, so the AI check was skipped");
}

export function shouldRunBenchmarkCheck(f1 = {}) {
  const b = String(f1.benchmark || "").trim();
  if (!b || isTooShort(b)) return false;
  return !isExplicitFirstMoverClaim(f1);
}

export function confirmedTextsForClaimCheck(f1 = {}, autofillStatus = {}, invalidFields = {}) {
  const out = {};
  if (
    hasEnteredText(f1.gapDerivation) &&
    !invalidFields.gapDerivation &&
    !isTooShort(f1.gapDerivation) &&
    textConfirmedByPerson("f1.gapDerivation", f1.gapDerivation, autofillStatus)
  ) {
    out.gapDerivation = String(f1.gapDerivation).trim();
  }
  if (
    hasEnteredText(f1.parityExceptions) &&
    !invalidFields.parityExceptions &&
    !isTooShort(f1.parityExceptions) &&
    textConfirmedByPerson("f1.parityExceptions", f1.parityExceptions, autofillStatus)
  ) {
    out.parityExceptions = String(f1.parityExceptions).trim();
  }
  if (
    hasEnteredText(f1.growthArgument) &&
    !invalidFields.growthArgument &&
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

export function shouldRunPlanCheck(f1 = {}, f2 = {}, autofillStatus = {}, invalidFields = {}) {
  const route = String(f1.growthRoute || "").trim();
  const routeOk =
    route &&
    (!AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION ||
      textConfirmedByPerson("f1.growthRoute", f1.growthRoute, autofillStatus));
  const attrOk =
    hasEnteredText(f1.declaredAttribute) &&
    !invalidFields.declaredAttribute &&
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
  // Part 141 D73 — invalid benchmark text: no AI call, no web search.
  const invalidBenchmark = invalidIssuesForDoc(doc).benchmark;
  if (invalidBenchmark) {
    return { assessment: skippedFor(invalidBenchmark), skipped: true, cached: false };
  }
  const benchmark = researchDisplayValue("benchmark", f1.benchmark);
  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    benchmark,
  };
  const hash = hashPayload("benchmark", payload);
  const cached = await cacheGet(hash);
  // Part 138 G — only a web-checked ok result is reusable (legacy results without searchUsed re-run).
  if (cached?.assessment && isWebCheckedOk(cached.assessment)) {
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

  // Part 138 G — searchUsed comes from this request's flag (and provider-reported searches), never from model JSON.
  const webSearchEnabled = true;
  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: webSearchEnabled,
      maxTokens: 900,
      temperature: 0,
      tier: "heavy",
      label: "f1-benchmark-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-benchmark] failed: ${e?.message || e}`);
    return {
      assessment: failedAssessment(e?.message || "The AI did not answer", { searchUsed: searchUsedFromRequest({ webSearchEnabled }) }),
      cacheKey: hash,
    };
  }

  const searchUsed = searchUsedFromRequest({ webSearchEnabled, searchesUsed: result?.webSearchRequests });
  const text = String(result?.text || result?.content || "").trim();
  if (!text) {
    return { assessment: failedAssessment("The AI did not answer", { searchUsed }), cacheKey: hash };
  }
  const parsed = parseJsonText(text);
  if (!parsed || !hasRelevanceField(parsed)) {
    return {
      assessment: failedAssessment("The AI's answer could not be read", { searchUsed }),
      cacheKey: hash,
    };
  }
  // Ignore any sources the model listed in JSON — only tool-result URLs count.
  delete parsed.returnedSources;
  delete parsed.sources;
  delete parsed.searchUsed;
  const returnedSources = extractReturnedSourcesFromLlmResult(result);
  const urls = returnedSourceUrls(returnedSources);
  const raw = sanitizeBenchmarkAssessment(parsed, urls);
  const assessment = okAssessment(raw, urls, { searchUsed });
  await cacheSet(hash, { assessment }, provider);
  return { assessment, cached: false, cacheKey: hash };
}

export async function runF1ClaimCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  const invalidFields = invalidIssuesForDoc(doc);
  const texts = confirmedTextsForClaimCheck(f1, statusMap, invalidFields);

  // Part 141 D73 — entered-but-invalid claim texts get a skipped assessment and never reach the AI.
  const skipped = {};
  const skipSlots = [
    ["gapDerivation", "derivation"],
    ["parityExceptions", "parity"],
    ["growthArgument", "argument"],
  ];
  for (const [field, slot] of skipSlots) {
    if (invalidFields[field] && hasEnteredText(f1[field]) && !isTooShort(f1[field])) {
      skipped[slot] = skippedFor(invalidFields[field]);
    }
  }
  if (!Object.keys(texts).length) {
    return Object.keys(skipped).length ? { ...skipped, skipped: true, cached: false } : null;
  }

  // Part 138 D51 — gap derivation and parity exceptions are SEPARATE claims with separate assessments.
  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    derivation: texts.gapDerivation || undefined,
    parity: texts.parityExceptions || undefined,
    argument: texts.growthArgument || undefined,
  };
  const hash = hashPayload("claims", payload);
  const cached = await cacheGet(hash);
  // Part 138 G — only web-checked ok results are reusable; each asked slot must be present.
  const askedSlots = ["derivation", "parity", "argument"].filter((k) => payload[k]);
  if (askedSlots.length && askedSlots.every((k) => isWebCheckedOk(cached?.[k]))) {
    return {
      derivation: cached.derivation || skipped.derivation,
      parity: cached.parity || skipped.parity,
      argument: cached.argument || skipped.argument,
      cached: true,
      cacheKey: hash,
    };
  }

  const system = [
    F1_CLAIM_PROMPT_TOKEN,
    "Fact-check FMCG NPD texts with web search. Claims about the NEW product (no public data) are never contradicted.",
    "Assess each key that is present in the input separately — gap derivation, parity exceptions and growth argument are three different claims.",
    "Rubric: strong = specific, differentiating, supported by cited public facts;",
    "adequate = specific and plausible but not verifiable; weak = generic; none = irrelevant or contradicted.",
    'Reply ONLY JSON: {"derivation?":{"relevance","specific":true|false,"supported":true|false,"contradicted?":true|false,"source_url?","quote?"},"parity?":{...},"argument?":{...}}',
  ].join("\n");

  // Part 138 G — searchUsed comes from this request's flag (and provider-reported searches), never from model JSON.
  const webSearchEnabled = true;
  const failAll = (message, searchUsed) => {
    const fail = failedAssessment(message, { searchUsed });
    return {
      error: fail.error,
      derivation: payload.derivation ? fail : skipped.derivation,
      parity: payload.parity ? fail : skipped.parity,
      argument: payload.argument ? fail : skipped.argument,
      cacheKey: hash,
    };
  };

  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: webSearchEnabled,
      maxTokens: 1800,
      temperature: 0,
      tier: "heavy",
      label: "f1-claim-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-claims] failed: ${e?.message || e}`);
    return failAll(e?.message || "The AI did not answer", searchUsedFromRequest({ webSearchEnabled }));
  }

  const searchUsed = searchUsedFromRequest({ webSearchEnabled, searchesUsed: result?.webSearchRequests });
  const text = String(result?.text || result?.content || "").trim();
  if (!text) return failAll("The AI did not answer", searchUsed);
  const parsed = parseJsonText(text);
  if (!parsed) return failAll("The AI's answer could not be read", searchUsed);
  delete parsed.returnedSources;
  delete parsed.sources;
  delete parsed.searchUsed;
  const returnedSources = extractReturnedSourcesFromLlmResult(result);
  const urls = returnedSourceUrls(returnedSources);

  const slotResult = (slot) => {
    if (!payload[slot]) return skipped[slot];
    const block = parsed[slot];
    if (!hasRelevanceField(block)) {
      return failedAssessment("The AI's answer could not be read", { searchUsed });
    }
    return okAssessment(sanitizeClaimAssessment(block || {}, urls), urls, { searchUsed });
  };
  const derivation = slotResult("derivation");
  const parity = slotResult("parity");
  const argument = slotResult("argument");

  const toCache = {
    ...(isOkAssessment(derivation) ? { derivation } : {}),
    ...(isOkAssessment(parity) ? { parity } : {}),
    ...(isOkAssessment(argument) ? { argument } : {}),
  };
  // Cache only when every asked slot is ok — a partial answer must be re-asked next time.
  if (askedSlots.every((k) => toCache[k])) await cacheSet(hash, toCache, provider);
  return { derivation, parity, argument, cached: false, cacheKey: hash };
}

export async function runF1PlanCheck(doc = {}, { provider = "claude", autofillStatus = null } = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const statusMap = autofillStatus || doc.researchFindings?.autofillStatus || {};
  const invalidFields = invalidIssuesForDoc(doc);
  if (!shouldRunPlanCheck(f1, f2, statusMap, invalidFields)) return null;

  const payload = {
    name: String(doc.name || "").trim(),
    category: String(doc.category || "").trim(),
    ideaDescription: String(doc.ideaDescription || "").trim(),
    targetConsumer: String(f1.targetConsumer || "").trim(),
    declaredAttribute:
      !invalidFields.declaredAttribute &&
      textConfirmedByPerson("f1.declaredAttribute", f1.declaredAttribute, statusMap)
        ? String(f1.declaredAttribute || "").trim()
        : "",
    growthRoute: textConfirmedByPerson("f1.growthRoute", f1.growthRoute, statusMap)
      ? String(f1.growthRoute || "").trim()
      : "",
    growthArgument: invalidFields.growthArgument ? "" : String(f1.growthArgument || "").trim(),
    qcomTrajectory: textConfirmedByPerson("f2.qcomTrajectory", f2.qcomTrajectory, statusMap)
      ? String(f2.qcomTrajectory || "").trim()
      : "",
    benchmark: invalidFields.benchmark ? "" : String(f1.benchmark || "").trim(),
  };
  const hash = hashPayload("plan", payload);
  const cached = await cacheGet(hash);
  // Part 138 G — a cached plan is reusable only if its request was web-checked.
  if (cached?.plan && cached.plan.status !== "failed" && cached.plan.searchUsed === true) {
    return { plan: cached.plan, cached: true, cacheKey: hash };
  }

  const system = [
    F1_PLAN_PROMPT_TOKEN,
    "Use web search to check the team's own plan texts (attribute, growth route, quick-commerce plan) against real market facts.",
    "Attribute rubric: strong = specific consumer benefit this idea can credibly deliver that differs from the benchmark; weak = generic.",
    "Quick-commerce rubric: strong = specific year-by-year assumptions (listing timeline, cities/share, take rate, commission, delivery-fee trajectory); weak = vague.",
    "Route definitions word for word:",
    "New market = the target audience is new to the brand's current buyers.",
    "Frequency = the goal is to make current buyers buy or use it more often.",
    "Penetration = the goal is to make it accessible to more people in the current audience.",
    'Reply ONLY JSON: {"attributes":{"relevance":"strong"|"adequate"|"weak"|"none","specific":true|false},"qcom":{"relevance":"...","specific":true|false},"route":{"matches":"yes"|"unclear"|"no","confidence":"high"|"medium"|"low","expected?":"...","reason?"}}',
  ].join("\n");

  // Part 138 G — searchUsed comes from this request's flag (and provider-reported searches), never from model JSON.
  const webSearchEnabled = true;
  let result;
  try {
    result = await callLlm({
      provider,
      system,
      userText: JSON.stringify(payload),
      useWebSearch: webSearchEnabled,
      maxTokens: 900,
      temperature: 0,
      tier: "heavy",
      label: "f1-plan-check",
    });
  } catch (e) {
    console.warn(`[primus/f1-plan] failed: ${e?.message || e}`);
    return {
      error: String(e?.message || e).slice(0, 160),
      plan: {
        status: "failed",
        error: String(e?.message || e).slice(0, 160),
        searchUsed: searchUsedFromRequest({ webSearchEnabled }),
      },
      cacheKey: hash,
    };
  }

  const searchUsed = searchUsedFromRequest({ webSearchEnabled, searchesUsed: result?.webSearchRequests });
  const text = String(result?.text || result?.content || "").trim();
  if (!text) {
    return {
      error: "The AI did not answer",
      plan: { status: "failed", error: "The AI did not answer", searchUsed },
      cacheKey: hash,
    };
  }
  const parsed = parseJsonText(text);
  if (!parsed) {
    return {
      error: "The AI's answer could not be read",
      plan: { status: "failed", error: "The AI's answer could not be read", searchUsed },
      cacheKey: hash,
    };
  }
  delete parsed.searchUsed;
  delete parsed.returnedSources;
  delete parsed.sources;
  const planSources = extractReturnedSourcesFromLlmResult(result);
  const plan = {
    status: "ok",
    ...sanitizePlanAssessment(parsed),
    searchUsed,
    returnedSources: returnedSourceUrls(planSources),
  };
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
 * Part 137 — failed slots are always returned and stored (never only console.warn).
 * @param {{ provider?: string, onlySteps?: string[]|null }} opts
 *   onlySteps: when set, run only those internal/ledger step names.
 */
export async function runFilter1ExtraChecks(doc = {}, { provider = "claude", onlySteps = null } = {}) {
  const autofillStatus = doc.researchFindings?.autofillStatus || {};
  const limited = Array.isArray(onlySteps) && onlySteps.length ? onlySteps : null;
  const want = (name) =>
    !limited ||
    limited.includes(name) ||
    limited.includes(name === "f1Benchmark" ? "f1" : name);

  const [benchmark, claims, plan] = await Promise.all([
    want("f1Benchmark") ? runF1BenchmarkCheck(doc, { provider }) : null,
    want("f1Claims") ? runF1ClaimCheck(doc, { provider, autofillStatus }) : null,
    want("f1Plan") || want("f1Route") ? runF1PlanCheck(doc, { provider, autofillStatus }) : null,
  ]);

  const f1Assessments = {};
  const failedSlots = [];
  if (benchmark?.assessment) {
    f1Assessments.benchmark = benchmark.assessment;
    if (benchmark.assessment.status === "failed") failedSlots.push({ step: "f1Benchmark", error: benchmark.assessment.error });
  }
  if (claims?.derivation) {
    f1Assessments.derivation = claims.derivation;
    if (claims.derivation.status === "failed") failedSlots.push({ step: "f1Claims", slot: "derivation", error: claims.derivation.error });
  }
  if (claims?.parity) {
    f1Assessments.parity = claims.parity;
    if (claims.parity.status === "failed") failedSlots.push({ step: "f1Claims", slot: "parity", error: claims.parity.error });
  }
  if (claims?.argument) {
    f1Assessments.argument = claims.argument;
    if (claims.argument.status === "failed") failedSlots.push({ step: "f1Claims", slot: "argument", error: claims.argument.error });
  }
  if (claims?.error && !claims?.derivation && !claims?.parity && !claims?.argument) {
    failedSlots.push({ step: "f1Claims", error: claims.error });
  }
  if (plan?.plan?.status === "failed") {
    const fail = failedAssessment(plan.plan.error || plan.error || "The AI did not answer", {
      searchUsed: plan.plan.searchUsed === true,
    });
    f1Assessments.attributes = fail;
    f1Assessments.route = fail;
    failedSlots.push({ step: "f1Plan", error: fail.error });
  } else if (plan?.plan) {
    const planOpts = { searchUsed: plan.plan.searchUsed === true };
    const planUrls = Array.isArray(plan.plan.returnedSources) ? plan.plan.returnedSources : [];
    if (plan.plan.attributes) f1Assessments.attributes = okAssessment(plan.plan.attributes, planUrls, planOpts);
    if (plan.plan.route) f1Assessments.route = okAssessment(plan.plan.route, planUrls, planOpts);
  }
  // Part 141 D73 — an invalid attribute never keeps an AI grade, even if the plan call ran for other fields.
  const invalidAttr = invalidIssuesForDoc(doc).declaredAttribute;
  if (invalidAttr && hasEnteredText(doc.f1?.declaredAttribute) && !isTooShort(doc.f1?.declaredAttribute) && (want("f1Plan") || want("f1Route"))) {
    f1Assessments.attributes = skippedFor(invalidAttr);
  }

  const f2Assessments = {};
  if (plan?.plan?.status !== "failed" && plan?.plan?.qcom) {
    f2Assessments.qcom = okAssessment(
      plan.plan.qcom,
      Array.isArray(plan.plan.returnedSources) ? plan.plan.returnedSources : [],
      { searchUsed: plan.plan.searchUsed === true }
    );
  }

  // Legacy mirrors for older code paths / tests — only from ok assessments.
  const legacy = {};
  if (benchmark?.assessment?.status === "ok" && benchmark.assessment.raw) {
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
  if (plan?.plan?.status !== "failed" && plan?.plan?.route) {
    legacy.routeCheck = plan.plan.route;
  }

  return {
    assessments: f1Assessments,
    f2Assessments,
    failedSlots,
    ...legacy,
  };
}
