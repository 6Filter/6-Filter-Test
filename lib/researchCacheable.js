/**
 * Step cache: a failed, truncated, empty, or unparsed model result must never
 * be stored for that step — retry-step / forceResearch runs the step again.
 *
 * Bundle cache (permanent identical-input rule): once a research hash has a
 * finished filter outcome, every later Submit with those same research inputs
 * must HIT and keep the same scores. Documented failures are stored on purpose
 * so a twin idea cannot re-roll the model. forceResearch / retry-step / Master
 * cache invalidation are the only ways to replace a stored bundle.
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

function isDocumentedFilterPart(part) {
  return Boolean(part && typeof part === "object" && !Array.isArray(part) && Object.keys(part).length > 0);
}

function filterFindingParts(findings) {
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return [];
  return FILTER_FINDING_KEYS.map((key) => findings[key]).filter(isDocumentedFilterPart);
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
        isDocumentedFilterPart(part)
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
 * True when a whole-bundle payload may be persisted for identical-input replay.
 * Narrative-only writes pass. Documented filter outcomes (pass or fail) save.
 * Empty / truncated parts are refused. Standalone blobs (categorySizing) save.
 */
export function researchBundleSaveAllowed(payload = {}) {
  if (!payload || typeof payload !== "object") return false;
  if (partFailed(payload)) return false;
  if (payload.researchFindings === undefined) return true;
  const findings = payload.researchFindings;
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return false;
  const parts = cacheableFindingParts(findings);
  return parts.length > 0;
}

/**
 * Bundle has filter findings worth replaying on a research-cache HIT.
 * A documented failure counts — that is what keeps twin scores identical.
 */
export function hasReplayableResearchCache(cached = null) {
  if (!cached || typeof cached !== "object") return false;
  const filters = filterFindingParts(cached.researchFindings);
  if (filters.length) return true;
  return cacheableFindingParts(cached.researchFindings).length > 0;
}

/**
 * First writer wins for research findings (and the suggestions that feed scores).
 * Later saves may still refresh suggestions/narratives when findings are unchanged.
 */
export function preferExistingResearchFindings(existing = null, incoming = null) {
  if (!hasReplayableResearchCache(existing) || !incoming || incoming.researchFindings === undefined) {
    return incoming;
  }
  const sameFindings =
    JSON.stringify(existing.researchFindings) === JSON.stringify(incoming.researchFindings);
  if (sameFindings) return incoming;
  return {
    ...incoming,
    researchFindings: existing.researchFindings,
    suggestions: existing.suggestions ?? incoming.suggestions,
    division: existing.division || incoming.division,
    providerUsed: existing.providerUsed || incoming.providerUsed,
  };
}
