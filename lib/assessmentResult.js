/**
 * Part 137 — assessment result shape: ok | failed. Never invent a "none" verdict from an error.
 * Browser-safe.
 */

export function okAssessment(raw, returnedSources = []) {
  return {
    status: "ok",
    raw: raw && typeof raw === "object" ? raw : {},
    returnedSources: Array.isArray(returnedSources) ? returnedSources : [],
  };
}

export function failedAssessment(error, { raw = null, returnedSources = [] } = {}) {
  return {
    status: "failed",
    error: String(error || "The AI did not answer").slice(0, 240),
    raw: raw && typeof raw === "object" ? raw : null,
    returnedSources: Array.isArray(returnedSources) ? returnedSources : [],
  };
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
