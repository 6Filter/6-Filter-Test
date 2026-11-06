/**
 * Part 138 F (D56) — Filter 4 web-checked assessments, one per dimension.
 * researchFindings.f4.assessments.<dimension> = { status, searchUsed, raw: { rating, supported, source_url, quote }, returnedSources }
 *
 * - `searchUsed` is set by CODE from the LLM request (see searchUsedFromRequest) — never from model JSON.
 * - A rating earns its point only when a stored ok assessment with searchUsed:true says it is supported
 *   AND that assessment was made for the rating that is on the form now.
 * Browser-safe: no I/O, no LLM.
 */
import {
  failedAssessment,
  isFailedAssessment,
  isOkAssessment,
  okAssessment,
  searchUsedFromRequest,
} from "./assessmentResult.js";
import { TECH_SHIFT_DIMENSIONS, normalizeRiskLevel } from "./techShiftRisk.js";

function trimStr(v, max = 400) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function urlsOf(returnedSources) {
  return (Array.isArray(returnedSources) ? returnedSources : [])
    .map((s) => (typeof s === "string" ? s : s?.url))
    .map((u) => String(u || "").trim())
    .filter(Boolean);
}

/**
 * Build one F4 dimension assessment.
 * `source_url` survives only when it is a URL the web search actually returned.
 * @param {{ rating: string, supported: boolean, source_url?: string, quote?: string,
 *           returnedSources?: Array<string|{url:string}>, webSearchEnabled?: boolean, searchesUsed?: number }} args
 */
export function buildF4Assessment({
  rating,
  supported,
  source_url = "",
  quote = "",
  returnedSources = [],
  webSearchEnabled = false,
  searchesUsed = 0,
} = {}) {
  const urls = urlsOf(returnedSources);
  const cited = trimStr(source_url, 600);
  const searchUsed = searchUsedFromRequest({ webSearchEnabled, searchesUsed });
  return okAssessment(
    {
      rating: normalizeRiskLevel(rating) || "",
      supported: supported === true,
      source_url: cited && urls.includes(cited) ? cited : "",
      quote: trimStr(quote),
    },
    returnedSources,
    { searchUsed }
  );
}

export function failedF4Assessment(error, { returnedSources = [], webSearchEnabled = false, searchesUsed = 0 } = {}) {
  return failedAssessment(error, {
    returnedSources,
    searchUsed: searchUsedFromRequest({ webSearchEnabled, searchesUsed }),
  });
}

/**
 * Assessments for an AI Filter 4 run. The rating IS the web research output, so a run whose
 * request had web search on is `supported`; a run without search is stored ok but searchUsed:false
 * and therefore earns nothing.
 * @param {{ dimensions: object, sources?: Array, webSearchEnabled: boolean, searchesUsed?: number,
 *           cited?: Record<string, {source_url?: string, quote?: string}> }} args
 */
export function f4AssessmentsFromResearch({
  dimensions = {},
  sources = [],
  webSearchEnabled = false,
  searchesUsed = 0,
  cited = {},
} = {}) {
  const urls = urlsOf(sources);
  const out = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const d = dimensions?.[key];
    if (!d || !normalizeRiskLevel(d.risk)) continue;
    const c = cited?.[key] && typeof cited[key] === "object" ? cited[key] : {};
    const own = trimStr(c.source_url, 600);
    out[key] = buildF4Assessment({
      rating: d.risk,
      supported: true,
      source_url: own && urls.includes(own) ? own : urls[0] || "",
      quote: c.quote || "",
      returnedSources: sources,
      webSearchEnabled,
      searchesUsed,
    });
  }
  return out;
}

export function failedF4Assessments(error, { sources = [], webSearchEnabled = false, searchesUsed = 0 } = {}) {
  const out = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    out[key] = failedF4Assessment(error, { returnedSources: sources, webSearchEnabled, searchesUsed });
  }
  return out;
}

/**
 * How one dimension is credited by Filter 4.
 * @returns {{ state: "supported"|"contradicted"|"unchecked"|"failed"|"stale"|"not-web-checked", credit: 0|1, assessment: object|null }}
 *   credit is 1 only for `supported`.
 */
export function f4DimensionVerification(dimension, assessment) {
  const rated = normalizeRiskLevel(dimension?.risk);
  if (!assessment || typeof assessment !== "object") return { state: "unchecked", credit: 0, assessment: null };
  if (isFailedAssessment(assessment)) return { state: "failed", credit: 0, assessment };
  if (!isOkAssessment(assessment) || assessment.status !== "ok") return { state: "unchecked", credit: 0, assessment };
  if (assessment.searchUsed !== true) return { state: "not-web-checked", credit: 0, assessment };
  const checked = normalizeRiskLevel(assessment.raw?.rating);
  if (!rated || !checked || checked !== rated) return { state: "stale", credit: 0, assessment };
  if (assessment.raw?.supported === true) return { state: "supported", credit: 1, assessment };
  if (assessment.raw?.supported === false) return { state: "contradicted", credit: 0, assessment };
  return { state: "unchecked", credit: 0, assessment };
}

/**
 * A fresh AI run must not throw away a person's already-verified hand rating.
 * Per dimension: keep the fresh assessment when it settles the CURRENT rating (supported/contradicted);
 * otherwise keep the prior one if it settles the current rating; otherwise take the fresh one.
 * @param {{ fresh?: object, prior?: object, dimensions?: object }} args dimensions = the form's current ratings
 */
export function reconcileF4Assessments({ fresh = {}, prior = {}, dimensions = {} } = {}) {
  const settled = (a, rating) => {
    const s = f4DimensionVerification({ risk: rating }, a).state;
    return s === "supported" || s === "contradicted";
  };
  const out = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const f = fresh?.[key];
    const p = prior?.[key];
    const current = normalizeRiskLevel(dimensions?.[key]?.risk) || normalizeRiskLevel(f?.raw?.rating);
    if (f && settled(f, current)) out[key] = f;
    else if (p && settled(p, current)) out[key] = p;
    else if (f) out[key] = f;
    else if (p) out[key] = p;
  }
  return out;
}
/** Pure: put verified assessments into researchFindings.f4.assessments (other findings untouched). */
export function mergeF4Assessments(researchFindings, assessments = {}) {
  const base = researchFindings && typeof researchFindings === "object" ? researchFindings : {};
  const f4 = base.f4 && typeof base.f4 === "object" ? base.f4 : {};
  return {
    ...base,
    f4: {
      ...f4,
      assessments: { ...(f4.assessments && typeof f4.assessments === "object" ? f4.assessments : {}), ...assessments },
    },
  };
}

