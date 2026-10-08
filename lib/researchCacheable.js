/**
 * A failed, truncated, empty, or unparsed model result must never be stored.
 * The next submit retries that step instead of replaying the failure.
 */

function partFailed(part) {
  if (!part || typeof part !== "object") return false;
  if (Object.keys(part).length === 0) return true;
  if (part.researchFailed) return true;
  if (part.error) return true;
  if (part.parseFailed) return true;
  if (part.stopReason === "max_tokens") return true;
  return false;
}

export function researchResultIsCacheable(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length === 0) return false;
  if (partFailed(value)) return false;
  const findings = value.researchFindings;
  if (findings && typeof findings === "object") {
    for (const part of Object.values(findings)) {
      if (partFailed(part)) return false;
    }
  }
  return true;
}

/** True when a whole-bundle payload is safe to persist. Narrative-only writes pass. */
export function researchBundleSaveAllowed(payload = {}) {
  if (!payload || typeof payload !== "object") return false;
  if (partFailed(payload)) return false;
  if (payload.researchFindings === undefined) return true;
  const findings = payload.researchFindings;
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return false;
  if (Object.keys(findings).length === 0) return false;
  for (const part of Object.values(findings)) {
    if (partFailed(part)) return false;
  }
  return true;
}
