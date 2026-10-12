const IGNORED = new Set(["forumVerdict", "verdictNote"]);

export function filterHasInputs(filter) {
  if (!filter || typeof filter !== "object") return false;
  for (const [key, value] of Object.entries(filter)) {
    if (IGNORED.has(key)) continue;
    if (value == null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) return true;
      continue;
    }
    if (typeof value === "object") {
      if (filterHasInputs(value)) return true;
      continue;
    }
    return true;
  }
  return false;
}

/** A saved classification with no Filter 1–4 inputs behind it. */
export function storedVerdictWithoutInputs(doc) {
  if (!doc?.goNoGo?.classification) return false;
  return ["f1", "f2", "f3", "f4"].every((key) => !filterHasInputs(doc[key]));
}
