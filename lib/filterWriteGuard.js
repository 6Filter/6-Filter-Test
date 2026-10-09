/**
 * A filter column with real answers must not be replaced by an empty blob.
 * Forum text counts as content. The empty {forumVerdict, verdictNote} blob does not.
 * A partial object updates only the keys it sends. Server-owned keys stay on the row.
 */
import { hasAnyRealInput } from "./filterChecks.js";
import { SIX_FILTERS_FORM } from "./propositionFields.js";

const SERVER_OWNED_TYPES = new Set(["computed", "computed-range", "computed-risk"]);

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

/** Research and formula fields. A client save cannot overwrite these. */
export function isServerOwnedFilterKey(key) {
  for (const spec of SIX_FILTERS_FORM) {
    const field = spec.fields.find((item) => item.key === key);
    if (field) return SERVER_OWNED_TYPES.has(field.type);
  }
  return false;
}

/**
 * Keep every stored key the incoming object does not mention.
 * A client cannot change a server-owned key. clearKeys is the only removal.
 */
export function mergeFilterObject(existing, incoming, { writer = "client", clearKeys = [], allowFilterReset = false } = {}) {
  const prev = parseFilterValue(existing);
  if (incoming === undefined) return { value: undefined, blockedKeys: [] };
  if (allowFilterReset) return { value: parseFilterValue(incoming), blockedKeys: [] };
  const nextIn = parseFilterValue(incoming);
  const clear = new Set(clearKeys.map((key) => String(key)));
  const merged = { ...prev };
  const blockedKeys = [];
  for (const key of Object.keys(prev)) {
    const had = prev[key] != null && prev[key] !== "";
    if (had && !(key in nextIn) && !clear.has(key)) blockedKeys.push(key);
  }
  for (const key of Object.keys(nextIn)) {
    if (clear.has(key)) continue;
    if (writer !== "server" && isServerOwnedFilterKey(key)) continue;
    merged[key] = nextIn[key];
  }
  for (const key of clear) delete merged[key];
  return { value: merged, blockedKeys };
}

export function clearKeysForColumn(column, clearKeys) {
  const list = Array.isArray(clearKeys) ? clearKeys : [];
  const keys = [];
  for (const item of list) {
    const text = String(item || "");
    if (text.startsWith(`${column}.`)) keys.push(text.slice(column.length + 1));
  }
  return keys;
}

/** Drop filter keys that carry no content so a handler cannot send the empty blob. */
export function omitEmptyFilterColumns(payload = {}) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  for (const key of FILTER_COLUMNS) {
    if (next[key] !== undefined && !filterHasContent(next[key])) delete next[key];
  }
  return next;
}
