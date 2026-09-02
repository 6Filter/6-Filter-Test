import { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM } from "./propositionFields.js";

const META_KEYS = new Set([
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "advisoryChecks",
  "researchRunAt",
  "researchFindings",
  "suggestions",
  "notCovered",
  "sources",
  "researchError",
]);

export function fieldOwners(key) {
  if (key === "attachment") return ["BM"];
  const top = PROPOSITION_TOP_FIELDS.find((f) => f.key === key);
  if (top) return top.owners || [];
  for (const filter of SIX_FILTERS_FORM) {
    const f = filter.fields.find((field) => field.key === key);
    if (f) return f.owners || [];
    if (key === "forumVerdict" || key === "verdictNote") return ["BH FORUM"];
  }
  return [];
}

export function canWriteField(role, key) {
  if (role === "ADMIN") return true;
  const owners = fieldOwners(key);
  return owners.length === 0 || owners.includes(role);
}

export function ownerLabel(key) {
  const owners = fieldOwners(key);
  if (!owners.length) return "";
  return owners.join(" / ");
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if ((a == null || a === "") && (b == null || b === "")) return true;
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  if (typeof a === "number" || typeof b === "number") {
    const na = a === "" || a == null ? null : Number(a);
    const nb = b === "" || b == null ? null : Number(b);
    if (na == null && nb == null) return true;
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a ?? "") === String(b ?? "");
}

export function changedOwnedFields(current, incoming) {
  const changed = [];
  if (!incoming || typeof incoming !== "object") return changed;
  const cur = current && typeof current === "object" ? current : {};

  for (const field of PROPOSITION_TOP_FIELDS) {
    if (!(field.key in incoming)) continue;
    if (!valuesEqual(cur[field.key], incoming[field.key])) changed.push(field.key);
  }

  if ("attachment" in incoming) {
    const a = cur.attachment && typeof cur.attachment === "object" ? cur.attachment : null;
    const b = incoming.attachment && typeof incoming.attachment === "object" ? incoming.attachment : null;
    const aKey = a
      ? `${a.name || ""}|${a.mediaType || ""}|${a.hasData || a.data ? "1" : "0"}|${String(a.data || "").length}`
      : "";
    const bKey = b
      ? `${b.name || ""}|${b.mediaType || ""}|${b.hasData || b.data ? "1" : "0"}|${String(b.data || "").length}`
      : "";
    if (aKey !== bKey) changed.push("attachment");
  }

  for (const filter of SIX_FILTERS_FORM) {
    const a = cur[filter.key] && typeof cur[filter.key] === "object" ? cur[filter.key] : {};
    const b = incoming[filter.key] && typeof incoming[filter.key] === "object" ? incoming[filter.key] : null;
    if (!b) continue;
    for (const field of filter.fields) {
      if (field.type === "computed") continue;
      if (!(field.key in b)) continue;
      if (!valuesEqual(a[field.key], b[field.key])) changed.push(field.key);
    }
    if ("forumVerdict" in b && !valuesEqual(a.forumVerdict, b.forumVerdict)) changed.push("forumVerdict");
    if ("verdictNote" in b && !valuesEqual(a.verdictNote, b.verdictNote)) changed.push("verdictNote");
  }

  return changed.filter((key) => !META_KEYS.has(key));
}

export function firstForbiddenField(role, current, incoming) {
  for (const key of changedOwnedFields(current, incoming)) {
    if (!canWriteField(role, key)) return key;
  }
  return null;
}
