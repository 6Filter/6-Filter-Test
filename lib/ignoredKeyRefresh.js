/**
 * A save that ignores some keys refreshes only those keys.
 * The field the person is typing stays as they left it.
 */
export function patchIgnoredKeys(localDoc, serverDoc, ignoredKeys, activeKey = "") {
  const local = localDoc && typeof localDoc === "object" ? localDoc : {};
  const server = serverDoc && typeof serverDoc === "object" ? serverDoc : {};
  const next = { ...local };
  const applied = [];
  for (const token of Array.isArray(ignoredKeys) ? ignoredKeys : []) {
    const text = String(token || "");
    if (!text || text === activeKey) continue;
    const dot = text.indexOf(".");
    if (dot <= 0) continue;
    const column = text.slice(0, dot);
    const field = text.slice(dot + 1);
    const serverFilter = server[column];
    if (!serverFilter || typeof serverFilter !== "object") continue;
    const current = next[column] && typeof next[column] === "object" ? next[column] : {};
    if (Object.prototype.hasOwnProperty.call(serverFilter, field)) {
      next[column] = { ...current, [field]: serverFilter[field] };
    } else {
      const copy = { ...current };
      delete copy[field];
      next[column] = copy;
    }
    applied.push(text);
  }
  return { doc: next, applied };
}
