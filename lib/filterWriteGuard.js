/**
 * A filter column with real answers must not be replaced by an empty blob.
 * Forum text counts as content. The empty {forumVerdict, verdictNote} blob does not.
 */
import { hasAnyRealInput } from "./filterChecks.js";

export const FILTER_COLUMNS = ["f1", "f2", "f3", "f4", "f5", "f6"];

export function parseFilterValue(value) {
  if (value == null || value === "") return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function filterHasContent(value) {
  const obj = parseFilterValue(value);
  if (hasAnyRealInput(obj)) return true;
  if (String(obj.forumVerdict || "").trim()) return true;
  if (String(obj.verdictNote || "").trim()) return true;
  return false;
}

/**
 * undefined means "not in this write" and the stored column stays.
 * A no-content value aimed at a populated column is refused.
 */
export function keptFilterIncoming(incoming, existing, { allowFilterReset = false } = {}) {
  if (incoming === undefined) return { incoming: undefined, blocked: false };
  if (allowFilterReset) return { incoming, blocked: false };
  if (filterHasContent(existing) && !filterHasContent(incoming)) {
    return { incoming: undefined, blocked: true };
  }
  return { incoming, blocked: false };
}

/** Drop filter keys that carry no content so a handler cannot send the empty blob. */
export function omitEmptyFilterColumns(payload = {}) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  for (const key of FILTER_COLUMNS) {
    if (next[key] !== undefined && !filterHasContent(next[key])) delete next[key];
  }
  return next;
}
