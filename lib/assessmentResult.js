/**
 * Part 137 — assessment result shape: ok | failed. Never invent a "none" verdict from an error.
 * Part 138 G — `searchUsed` is set by CODE from the LLM request (never from the model's JSON).
 * Browser-safe.
 */

/** Part 138 G — assessment slots that must come from a web-checked request. */
export const WEB_CHECKED_ASSESSMENT_KEYS = Object.freeze([
  "benchmark",
  "attributes",
  "derivation",
  "parity",
  "route",
  "argument",
  "gst",
]);

/**
 * Part 138 G — did the request that produced this assessment actually have web search?
 * `webSearchEnabled` is the flag the code passed to the LLM; `searchesUsed` is the
 * provider-reported number of searches. Both come from code, never from model JSON.
 */
export function searchUsedFromRequest({ webSearchEnabled = false, useWebSearch = false, searchesUsed = 0 } = {}) {
  return Boolean(webSearchEnabled || useWebSearch || Number(searchesUsed) > 0);
}

/** Strip any model-supplied provenance flags before a raw payload is stored. */
function stripModelProvenance(raw) {
  if (!raw || typeof raw !== "object") return {};
  const { searchUsed: _modelSearchUsed, ...rest } = raw;
  return rest;
}

export function okAssessment(raw, returnedSources = [], { searchUsed = false } = {}) {
  return {
    status: "ok",
    searchUsed: searchUsed === true,
    raw: stripModelProvenance(raw),
    returnedSources: Array.isArray(returnedSources) ? returnedSources : [],
  };
}

export function failedAssessment(error, { raw = null, returnedSources = [], searchUsed = false } = {}) {
  return {
    status: "failed",
    searchUsed: searchUsed === true,
    error: String(error || "The AI did not answer").slice(0, 240),
    raw: raw && typeof raw === "object" ? raw : null,
    returnedSources: Array.isArray(returnedSources) ? returnedSources : [],
  };
}

/**
 * Part 141 D73 — the AI call was skipped because the typed input is invalid (gibberish, digits only…).
 * Not a failure, not an "ok" verdict: no raw, no web search, never cached, never credited.
 */
export function skippedAssessment(reason, { guard = "input-invalid" } = {}) {
  return {
    status: "skipped",
    guard,
    searchUsed: false,
    reason: String(reason || "Input is not valid, so the AI check was skipped").slice(0, 240),
    raw: null,
    returnedSources: [],
  };
}

export function isSkippedAssessment(a) {
  return Boolean(a && typeof a === "object" && a.status === "skipped");
}

export function isFailedAssessment(a) {
  return Boolean(a && typeof a === "object" && a.status === "failed");
}

export function isOkAssessment(a) {
  if (!a || typeof a !== "object") return false;
  if (a.status === "failed") return false;
  if (a.status === "ok") return Boolean(a.raw && typeof a.raw === "object");
  // Legacy (pre-Part 137): treat as ok when a raw payload exists.
  return Boolean(a.raw && typeof a.raw === "object");
}

/**
 * Part 138 G — a stored ok result whose request really had web search.
 * Legacy results written before `searchUsed` existed do NOT qualify: they must be re-run.
 */
export function isWebCheckedOk(a) {
  return isOkAssessment(a) && a.status === "ok" && a.searchUsed === true;
}

/** Garbled legacy: relevance none + empty reason + no status → mark failed for re-ask. */
export function isGarbledNoneAssessment(a) {
  if (!a || typeof a !== "object") return false;
  if (a.status === "ok" || a.status === "failed") return false;
  const raw = a.raw;
  if (!raw || typeof raw !== "object") return false;
  const rel = String(raw.relevance || "").trim().toLowerCase();
  if (rel !== "none") return false;
  const reason = String(raw.reason || "").trim();
  return !reason;
}

/**
 * Walk researchFindings and convert garbled none assessments to failed.
 * Does not change scores or verdicts.
 */
export function migrateGarbledAssessments(findings = {}) {
  if (!findings || typeof findings !== "object") return findings;
  const next = { ...findings };
  let changed = false;

  function fixBucket(bucket) {
    if (!bucket || typeof bucket !== "object") return bucket;
    const assessments = bucket.assessments;
    if (!assessments || typeof assessments !== "object") return bucket;
    const out = { ...assessments };
    let local = false;
    for (const [key, val] of Object.entries(out)) {
      if (isGarbledNoneAssessment(val)) {
        out[key] = failedAssessment("The AI's answer could not be read", { returnedSources: val.returnedSources });
        local = true;
      }
    }
    if (!local) return bucket;
    changed = true;
    return { ...bucket, assessments: out };
  }

  if (next.f1) next.f1 = fixBucket(next.f1);
  if (next.f2) next.f2 = fixBucket(next.f2);
  return changed ? next : findings;
}
