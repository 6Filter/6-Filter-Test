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

function storedHasValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "boolean") return value === true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim() !== "";
}

/** A person rated at least one Filter 4 dimension. Research-shaped payloads stay server-owned. */
export function isHandRatedTechShift(value) {
  if (!value || typeof value !== "object" || value.aiSourced !== false) return false;
  const dims = value.dimensions;
  if (!dims || typeof dims !== "object") return false;
  return Object.values(dims).some((cell) => {
    const risk = String(cell?.risk || "").trim();
    return risk === "Low" || risk === "Medium" || risk === "High";
  });
}

/** "", null, and undefined are a clear when the key is present on the payload. */
export function isExplicitBlank(value) {
  return value == null || value === "";
}

/**
 * Keep every stored key the incoming object does not mention.
 * A present blank clears a human-owned key. A stale blank does not.
 * A client cannot change a server-owned key. clearKeys removes a key.
 */
export function mergeFilterObject(existing, incoming, { writer = "client", clearKeys = [], allowFilterReset = false, stale = false } = {}) {
  const prev = parseFilterValue(existing);
  if (incoming === undefined) return { value: undefined, blockedKeys: [] };
  if (allowFilterReset) return { value: parseFilterValue(incoming), blockedKeys: [] };
  const nextIn = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : parseFilterValue(incoming);
  const clear = new Set(clearKeys.map((key) => String(key)));
  const merged = { ...prev };
  const blockedKeys = [];
  for (const key of Object.keys(prev)) {
    if (storedHasValue(prev[key]) && !(key in nextIn) && !clear.has(key)) blockedKeys.push(key);
  }
  for (const key of Object.keys(nextIn)) {
    if (clear.has(key)) continue;
    if (writer !== "server" && isServerOwnedFilterKey(key)) {
      // Hand ratings are the form's input. A research-shaped payload still cannot clobber them.
      if (key === "techShiftRisk" && isHandRatedTechShift(nextIn[key])) {
        merged[key] = nextIn[key];
      }
      continue;
    }
    if (stale && isExplicitBlank(nextIn[key]) && storedHasValue(prev[key])) {
      blockedKeys.push(key);
      continue;
    }
    if (isExplicitBlank(nextIn[key]) && !isServerOwnedFilterKey(key)) {
      if (storedHasValue(prev[key])) delete merged[key];
      continue;
    }
    merged[key] = nextIn[key];
  }
  for (const key of clear) {
    if (!storedHasValue(prev[key])) continue;
    if (stale) {
      blockedKeys.push(key);
      continue;
    }
    delete merged[key];
  }
  return { value: merged, blockedKeys };
}

const SCALAR_SKIP_TYPES = new Set(["computed", "computed-range", "computed-risk"]);

/** Blanks the form can send for a human-owned key. Absent keys are not clears. */
export function blankClearsInFilter(column, filter) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return [];
  const keys = [];
  const spec = SIX_FILTERS_FORM.find((item) => item.key === column);
  const fields = spec ? spec.fields : [];
  const seen = new Set();
  const consider = (key, type) => {
    if (seen.has(key) || isServerOwnedFilterKey(key) || SCALAR_SKIP_TYPES.has(type)) return;
    seen.add(key);
    if (!(key in filter)) return;
    if (type === "checkbox") {
      if (filter[key] === false) keys.push(`${column}.${key}`);
      return;
    }
    if (!isExplicitBlank(filter[key])) return;
    keys.push(`${column}.${key}`);
  };
  for (const field of fields) consider(field.key, field.type);
  consider("forumVerdict", "select");
  consider("verdictNote", "text");
  return keys;
}

export function blankClearsInPayload(payload = {}) {
  const keys = [];
  for (const column of FILTER_COLUMNS) keys.push(...blankClearsInFilter(column, payload[column]));
  return keys;
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
