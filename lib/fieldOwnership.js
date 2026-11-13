import { isServerOwnedFilterKey } from "./filterWriteGuard.js";
import { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM } from "./propositionFields.js";

/** Browser-safe — keep this module free of accessDb / auth / db imports. */
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

const META_KEYS = new Set([
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "advisoryChecks",
  "researchRunAt",
  "researchDurationMs",
  "researchFindings",
  "suggestions",
  "notCovered",
  "sources",
  "researchError",
]);

export const SERVER_OWNED_KEYS = new Set([
  "marginElasticity",
  "techShiftRisk",
  "computedRevenue",
  "researchFindings",
  "advisoryChecks",
  "suggestions",
  "goNoGo",
]);

export function isServerOwnedField(key) {
  if (SERVER_OWNED_KEYS.has(key)) return true;
  return isServerOwnedFilterKey(key);
}

const FILTER_CONTAINER_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];

/**
 * Part 140 A (D62) — a save never fails because of a server-owned field.
 * Removes SERVER_OWNED_KEYS from the top level and from f1–f6, without mutating `payload`.
 * `ignoredKeys` lists every removed path ("goNoGo", "f4.techShiftRisk").
 * `attemptedDiffs` lists removed paths whose incoming value differs from `current`
 * (all removed paths when `current` is omitted) — for audit only, never a refusal.
 */
export function stripServerOwnedFields(payload, current = undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { cleaned: payload, ignoredKeys: [], attemptedDiffs: [] };
  }
  const ignoredKeys = [];
  const attemptedDiffs = [];
  const note = (path, incomingValue, storedValue) => {
    ignoredKeys.push(path);
    if (current === undefined || !valuesEqual(storedValue, incomingValue)) {
      attemptedDiffs.push({ path, incoming: incomingValue, stored: storedValue });
    }
  };
  const cur = current && typeof current === "object" ? current : {};
  const cleaned = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SERVER_OWNED_KEYS.has(key)) {
      note(key, value, cur[key]);
      continue;
    }
    if (FILTER_CONTAINER_KEYS.includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const storedFilter = cur[key] && typeof cur[key] === "object" ? cur[key] : {};
      const inner = {};
      for (const [fk, fv] of Object.entries(value)) {
        if (SERVER_OWNED_KEYS.has(fk)) {
          note(`${key}.${fk}`, fv, storedFilter[fk]);
          continue;
        }
        inner[fk] = fv;
      }
      cleaned[key] = inner;
      continue;
    }
    cleaned[key] = value;
  }
  return { cleaned, ignoredKeys, attemptedDiffs };
}

export function canEditIdeaInputs(user, idea = {}) {
  if (!user) return false;
  if (String(user.status || "active") === "disabled") return false;
  if (String(user.role || "").trim() === "ADMIN") return true;
  const myEmail = normalizeEmail(user.email);
  const ownerEmail = normalizeEmail(idea.createdByEmail || idea.created_by_email || "");
  if (myEmail && ownerEmail && myEmail === ownerEmail) return true;
  if (idea?.createdByUserId && String(idea.createdByUserId) === String(user.id)) return true;
  if (idea?.created_by_user_id && String(idea.created_by_user_id) === String(user.id)) return true;
  return false;
}

export function fieldOwners(key) {
  if (key === "attachment") return ["BM"];
  if (key === "evidenceSourceFile") return ["CMI"];
  const top = PROPOSITION_TOP_FIELDS.find((f) => f.key === key);
  if (top) return top.owners || [];
  for (const filter of SIX_FILTERS_FORM) {
    const f = filter.fields.find((field) => field.key === key);
    if (f) return f.owners || [];
    if (key === "forumVerdict" || key === "verdictNote") return ["BH FORUM"];
  }
  return [];
}

/** @deprecated Role no longer gates inputs — use canEditIdeaInputs. */
export function canWriteField(_role, key) {
  return !isServerOwnedField(key);
}

export function ownerLabel(key) {
  const owners = fieldOwners(key);
  if (!owners.length) return "";
  return owners.join(" / ");
}

export function usuallyProvidedByHint(key) {
  const owners = fieldOwners(key);
  if (!owners.length) return "";
  return `Usually provided by ${owners.join(" / ")}`;
}

/** Filter numbers that list at least one field with a department hint. */
export function ownedFilterNums(role) {
  if (!role) return [];
  if (role === "ADMIN") return SIX_FILTERS_FORM.map((s) => s.num);
  const nums = [];
  for (const spec of SIX_FILTERS_FORM) {
    const hinted = spec.fields.some((field) => fieldOwners(field.key).length > 0);
    if (hinted) nums.push(spec.num);
  }
  return nums;
}

export function ownershipBanner(role) {
  if (!role) return "Fill every input on your own idea — hints show who usually provides each field.";
  if (role === "ADMIN") return "You can edit every filter on ideas you open.";
  return "You own every input on your own ideas. Hints show who usually provides each field.";
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

  for (const key of SERVER_OWNED_KEYS) {
    if (key in incoming && !valuesEqual(cur[key], incoming[key])) changed.push(key);
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
      if (field.fileKey && field.fileKey in b && !valuesEqual(a[field.fileKey], b[field.fileKey])) {
        changed.push(field.fileKey);
      }
    }
    if ("forumVerdict" in b && !valuesEqual(a.forumVerdict, b.forumVerdict)) changed.push("forumVerdict");
    if ("verdictNote" in b && !valuesEqual(a.verdictNote, b.verdictNote)) changed.push("verdictNote");
  }

  return changed.filter((key) => !META_KEYS.has(key));
}

