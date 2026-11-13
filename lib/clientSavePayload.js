/**
 * Part 140 B (D64) — what the browser sends on Save draft / Submit.
 * Browser-safe: no I/O, no Node APIs.
 *
 * Research and formula values belong to the server. A save body never carries them,
 * so a save cannot fail (or be refused) because a stale copy rode along.
 */
export const SERVER_OWNED_SAVE_KEYS = Object.freeze([
  "marginElasticity",
  "techShiftRisk",
  "computedRevenue",
  "researchFindings",
  "advisoryChecks",
  "suggestions",
  "goNoGo",
]);

const FILTER_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];

function cloneJson(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON clone */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Clone `doc` and delete the server-owned keys from the top level and from f1–f6.
 * The input is never mutated. Person-owned keys (including f4.userInputs) are kept.
 */
export function omitServerOwnedForSave(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;
  const out = cloneJson(doc);
  for (const key of SERVER_OWNED_SAVE_KEYS) delete out[key];
  for (const fk of FILTER_KEYS) {
    const filter = out[fk];
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) continue;
    for (const key of SERVER_OWNED_SAVE_KEYS) delete filter[key];
  }
  return out;
}

/** Plain-words reason a draft save failed — shown to the person, never a stack trace or "Failed to fetch". */
export function plainDraftSaveError(error) {
  const raw = String(error?.message || error || "").trim();
  if (!raw || /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return "we could not reach the server. Check your connection";
  }
  if (error?.status === 401 || error?.status === 403) {
    return raw || "you no longer have permission to save this idea. Sign in again";
  }
  return raw.replace(/[.\s]+$/, "");
}
