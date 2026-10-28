/**
 * Step cache: a failed, truncated, empty, or unparsed model result must never
 * be stored for that step — the next retry runs the step again.
 *
 * Bundle cache: store a finished pass when at least one filter part succeeded,
 * even if another part failed. Identical research inputs then HIT and keep the
 * same scores. forceResearch / retry-step still re-run a failed step.
 */

const FILTER_FINDING_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];
const META_FINDING_KEYS = new Set(["sources", "stepsExpected", "stepsDone", "stepsFailed"]);

function partFailed(part) {
  if (!part || typeof part !== "object" || Array.isArray(part)) return false;
  if (Object.keys(part).length === 0) return true;
  if (part.researchFailed) return true;
  if (part.error) return true;
  if (part.parseFailed) return true;
  if (part.stopReason === "max_tokens") return true;
  return false;
}

function filterFindingParts(findings) {
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return [];
  return FILTER_FINDING_KEYS.map((key) => findings[key]).filter(
    (part) => part && typeof part === "object" && !Array.isArray(part)
  );
}

/** Filter parts when present; otherwise standalone blobs such as categorySizing. */
function cacheableFindingParts(findings) {
  const filters = filterFindingParts(findings);
  if (filters.length) return filters;
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return [];
  return Object.entries(findings)
    .filter(
      ([key, part]) =>
        !META_FINDING_KEYS.has(key) &&
        !FILTER_FINDING_KEYS.includes(key) &&
        part &&
        typeof part === "object" &&
        !Array.isArray(part)
    )
    .map(([, part]) => part);
}

export function researchResultIsCacheable(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length === 0) return false;
  if (partFailed(value)) return false;
  const findings = value.researchFindings;
  if (findings && typeof findings === "object") {
    for (const part of cacheableFindingParts(findings)) {
      if (partFailed(part)) return false;
    }
  }
  return true;
}

/**
 * True when a whole-bundle payload is safe to persist for identical-input replay.
 * Narrative-only writes pass. A filter part that failed is allowed when another
 * filter part succeeded. All-failed or empty filter findings are refused.
 */
export function researchBundleSaveAllowed(payload = {}) {
  if (!payload || typeof payload !== "object") return false;
  if (partFailed(payload)) return false;
  if (payload.researchFindings === undefined) return true;
  const findings = payload.researchFindings;
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return false;
  const parts = cacheableFindingParts(findings);
  if (!parts.length) return false;
  return parts.some((part) => !partFailed(part));
}

/** Bundle has filter findings worth replaying on a research-cache HIT. */
export function hasReplayableResearchCache(cached = null) {
  if (!cached || typeof cached !== "object") return false;
  return filterFindingParts(cached.researchFindings).some((part) => !partFailed(part));
}
