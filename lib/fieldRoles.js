/**
 * Part 139 A (D58–D60) — the ONLY source of label text for field roles.
 *
 * Every box on the input form has one role. The role words come from ROLE_LABEL /
 * ROLE_MEANING below and nowhere else; UI code must not invent its own wording.
 * Browser-safe: no I/O, no Node APIs, no scoring arithmetic (the score lives in the
 * server-side scoring files — this file only says what each box is *for*).
 *
 * Paths: top-of-form boxes are bare keys ("name"); filter boxes are "f1.benchmark".
 */
import { f4AnswerPasses } from "./enteredFieldCredit.js";
import { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM } from "./propositionFields.js";
import { isNewMarketRoute as f1IsNewMarketRoute } from "./filter1Check.js";
import { DIMENSION_LABELS, TECH_SHIFT_DIMENSIONS } from "./techShiftRisk.js";

// ───────────────────────────── D58 — the seven role words ─────────────────────────────

export const ROLE_LABEL = Object.freeze({
  required: "Required",
  "needed-for-verdict": "Needed for a verdict",
  scored: "Scored",
  "filled-by-ai": "Filled by AI",
  optional: "Optional",
  "changes-checks": "Changes the checks",
  "not-in-score": "Not in the score",
});

export const ROLE_MEANING = Object.freeze({
  required: "You cannot submit without this.",
  "needed-for-verdict": "Without this, no GO / NO-GO / WATCH verdict can be given.",
  scored: "Blank, or found wrong by the web check, loses a point.",
  "filled-by-ai": "Check it or type over it; you do not have to fill it yourself.",
  optional: "Skip it and your score does not change.",
  "changes-checks": "A switch, not a question — it changes which checks apply.",
  "not-in-score": "Sizes the idea or gates the prototype; it is outside the percent score.",
});

export const ROLE_KEYS = Object.freeze(Object.keys(ROLE_LABEL));

/**
 * Roles that may legitimately have no box today.
 * D59 made the AI-estimated cost (COGS) "Needed for a verdict" rather than "Filled by AI",
 * so "filled-by-ai" stays in ROLE_LABEL / ROLE_MEANING for D58 completeness but no box uses it.
 * If a box is ever given this role, nothing else has to change.
 */
export const ROLES_RESERVED_UNUSED = Object.freeze(["filled-by-ai"]);

// ───────────────────────────── FIELD_ROLES — every form box ─────────────────────────────

const NEW_MARKET_UNLESS = Object.freeze({
  field: "f1.growthRoute",
  equals: "new-market",
  role: "optional",
  note: "Not needed — your growth route is New market.",
});

function entry(role, label, note = "", extra = {}) {
  return { role, label, note, ...extra };
}

const BASE_ROLES = {
  // Top of the form — you cannot submit without these.
  submitterName: entry("required", "Your name"),
  submitterDepartment: entry("required", "Your team"),
  name: entry("required", "Proposition name"),
  category: entry("required", "Category"),
  ideaDescription: entry("required", "Idea description"),

  // Filter 1
  "f1.declaredAttribute": entry("scored", "Main benefit (attribute 1)", "Your intended USP — research checks it."),
  "f1.declaredAttribute2": entry("optional", "Attribute 2", "2nd of the top-3"),
  "f1.declaredAttribute3": entry("optional", "Attribute 3", "3rd of the top-3"),
  "f1.evidenceSourceDate": entry("optional", "Evidence source"),
  "f1.benchmark": entry("scored", "Benchmark (strongest competitor)", "Not needed when your growth route is New market", {
    unless: NEW_MARKET_UNLESS,
  }),
  "f1.declaredGap": entry("scored", "Declared gap"),
  "f1.gapDerivation": entry("scored", "What we intend to beat"),
  "f1.parityExceptions": entry("scored", "Where we may lose"),
  "f1.targetConsumer": entry("optional", "Who is this for?"),
  "f1.growthRoute": entry("scored", "Growth route"),
  "f1.growthArgument": entry("scored", "Growth argument"),
  "f1.pureCommodity": entry("changes-checks", "Pure commodity"),

  // Filter 2
  "f2.cogsAtScale": entry(
    "needed-for-verdict",
    "Cost to make one unit (COGS)",
    "The AI fills this; type it if the AI could not."
  ),
  "f2.netMarginAtScale": entry(
    "needed-for-verdict",
    "Net margin at scale",
    "Starts at the division minimum — raise it if you know better. Also costs a point if blank or below the minimum."
  ),
  "f2.gstRatePct": entry(
    "needed-for-verdict",
    "GST rate",
    "You enter this. Also costs a point if blank or contradicted."
  ),
  "f2.grammage": entry("scored", "Pack size", "Needs a number and a unit (g, ml, …)."),
  "f2.mrpInr": entry("optional", "Shelf price (MRP)"),
  "f2.qcomTrajectory": entry("optional", "Quick-commerce notes"),
  "f2.financeSigned": entry("optional", "Finance sign-off"),

  // Filter 3
  "f3.plannedAnnualIncreasePct": entry("optional", "Planned yearly price rise"),

  // Filter 4
  "f4.techShiftRisk": entry("scored", "Technology and habit shift risk"),
  "f4.f4MitigationResponses": entry("optional", "Written responses to Filter 4 risks"),
};

function buildFieldRoles() {
  const out = {};
  for (const [path, e] of Object.entries(BASE_ROLES)) out[path] = Object.freeze({ path, ...e });
  // Filters 5 and 6 — every box is outside the percent score.
  for (const spec of SIX_FILTERS_FORM) {
    if (spec.key !== "f5" && spec.key !== "f6") continue;
    for (const f of spec.fields) {
      const path = `${spec.key}.${f.key}`;
      out[path] = Object.freeze({ path, ...entry("not-in-score", f.label) });
    }
  }
  return Object.freeze(out);
}

export const FIELD_ROLES = buildFieldRoles();

// ───────────────────────────── lookups ─────────────────────────────

/** Every path a form box can have (derived from propositionFields — the form's own spec). */
export function formFieldPaths() {
  const paths = PROPOSITION_TOP_FIELDS.map((f) => f.key);
  for (const spec of SIX_FILTERS_FORM) {
    for (const f of spec.fields) paths.push(`${spec.key}.${f.key}`);
  }
  return paths;
}

/** Throws if any form box has no role (test R1). Returns the number of boxes checked. */
export function assertEveryFormFieldHasRole() {
  const missing = formFieldPaths().filter((p) => !Object.prototype.hasOwnProperty.call(FIELD_ROLES, p));
  if (missing.length) {
    throw new Error(`Form box without a role: ${missing.join(", ")}`);
  }
  const bad = Object.values(FIELD_ROLES).filter((e) => !ROLE_LABEL[e.role]);
  if (bad.length) {
    throw new Error(`Role not in ROLE_LABEL: ${bad.map((e) => `${e.path}=${e.role}`).join(", ")}`);
  }
  return formFieldPaths().length;
}

/** Normalise a path to its FIELD_ROLES key, or null. Accepts "f1.benchmark" or a bare top key. */
export function roleKeyFor(path) {
  const p = String(path ?? "").trim();
  if (!p) return null;
  if (Object.prototype.hasOwnProperty.call(FIELD_ROLES, p)) return p;
  if (p.startsWith("top.")) {
    const bare = p.slice(4);
    if (Object.prototype.hasOwnProperty.call(FIELD_ROLES, bare)) return bare;
  }
  return null;
}

export function getFieldRole(path) {
  const key = roleKeyFor(path);
  return key ? FIELD_ROLES[key] : null;
}

// ───────────────────────────── reading the doc ─────────────────────────────

export function valueAtPath(doc, path) {
  const p = String(path ?? "");
  const dot = p.indexOf(".");
  if (dot < 0) return doc?.[p];
  return doc?.[p.slice(0, dot)]?.[p.slice(dot + 1)];
}

export function isNewMarketRoute(doc) {
  return f1IsNewMarketRoute(doc?.f1 || {});
}

function unlessApplies(unless, doc) {
  if (!unless) return false;
  const v = String(valueAtPath(doc, unless.field) ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return v === unless.equals;
}

/** The role this box has for THIS idea (resolves "unless"). */
export function effectiveRole(path, doc) {
  const e = getFieldRole(path);
  if (!e) return null;
  if (e.unless && unlessApplies(e.unless, doc)) return e.unless.role;
  return e.role;
}

export function roleLabel(path, doc) {
  const r = effectiveRole(path, doc);
  return r ? ROLE_LABEL[r] : "";
}

export function roleMeaning(path, doc) {
  const r = effectiveRole(path, doc);
  return r ? ROLE_MEANING[r] : "";
}

export function roleNote(path, doc) {
  const e = getFieldRole(path);
  if (!e) return "";
  if (e.unless && unlessApplies(e.unless, doc)) return e.unless.note || "";
  return e.note || "";
}

// ───────────────────────────── "is this box filled?" helpers ─────────────────────────────

/** A value counts as filled when a person could see something in the box. */
export function isFilledValue(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return v === true;
  if (Array.isArray(v)) return v.some(isFilledValue);
  if (typeof v === "object") return Object.values(v).some(isFilledValue);
  return String(v).trim() !== "";
}

function hasFile(file) {
  return Boolean(
    file &&
      typeof file === "object" &&
      (String(file.name || "").trim() ||
        String(file.data || "").trim() ||
        String(file.sha256 || "").trim() ||
        Number(file.size) > 0)
  );
}

/** Is this box filled on this idea? Handles the boxes that hold more than a plain value. */
export function isPathFilled(doc, path) {
  if (path === "f1.evidenceSourceDate") {
    const f1 = doc?.f1 || {};
    return isFilledValue(f1.evidenceSourceDate) || hasFile(f1.evidenceSourceFile);
  }
  if (path === "f4.techShiftRisk") {
    const dims = doc?.f4?.techShiftRisk?.dimensions;
    return Boolean(dims && typeof dims === "object" && Object.values(dims).some((d) => isFilledValue(d?.risk)));
  }
  return isFilledValue(valueAtPath(doc, path));
}

function pathsWithEffectiveRole(role, doc) {
  return Object.keys(FIELD_ROLES).filter((p) => effectiveRole(p, doc) === role);
}

function labelled(path) {
  return { path, label: FIELD_ROLES[path].label };
}

// ───────────────────────────── D60 — what you can skip ─────────────────────────────

function inputPathsOf(filterKey) {
  const spec = SIX_FILTERS_FORM.find((s) => s.key === filterKey);
  return spec.fields
    .filter((f) => f.type !== "checkbox" && f.type !== "computed" && f.type !== "computed-range" && f.type !== "computed-risk")
    .map((f) => `${filterKey}.${f.key}`);
}

/** The Before-you-submit card's "you can skip these" list, in D60 order. */
export const SKIPPABLE_GROUPS = Object.freeze([
  Object.freeze({
    id: "attributes-2-3",
    label: "Attributes 2 and 3",
    paths: Object.freeze(["f1.declaredAttribute2", "f1.declaredAttribute3"]),
    labelFor(emptyPaths) {
      if (emptyPaths.length >= 2) return "Attributes 2 and 3";
      return emptyPaths[0] === "f1.declaredAttribute2" ? "Attribute 2" : "Attribute 3";
    },
  }),
  Object.freeze({ id: "evidence-source", label: "Evidence source", paths: Object.freeze(["f1.evidenceSourceDate"]) }),
  Object.freeze({ id: "who-is-this-for", label: "Who is this for?", paths: Object.freeze(["f1.targetConsumer"]) }),
  Object.freeze({ id: "quick-commerce", label: "Quick-commerce notes", paths: Object.freeze(["f2.qcomTrajectory"]) }),
  Object.freeze({ id: "filter-5", label: "Filter 5", paths: Object.freeze(inputPathsOf("f5")) }),
  Object.freeze({ id: "filter-6", label: "Filter 6", paths: Object.freeze(inputPathsOf("f6")) }),
]);

/** Every skippable group's label, e.g. for a card that shows the full list. */
export const SKIPPABLE_SUMMARY_ALL = SKIPPABLE_GROUPS.map((g) => g.label).join(", ");

function skippableLeft(doc) {
  const out = [];
  for (const g of SKIPPABLE_GROUPS) {
    const emptyPaths = g.paths.filter((p) => !isPathFilled(doc, p));
    if (!emptyPaths.length) continue;
    out.push({ id: g.id, label: typeof g.labelFor === "function" ? g.labelFor(emptyPaths) : g.label, emptyPaths });
  }
  return out;
}

// ───────────────────────────── the Before-you-submit card ─────────────────────────────

/**
 * Boxes the checklist never nags about. The web check fills the Filter 4 risk grid on
 * Submit and a person cannot type into it, so "empty" there is not something to fix first.
 */
const NOT_NAGGED = new Set(["f4.techShiftRisk"]);

export function submitChecklist(doc) {
  const d = doc || {};
  const requiredEmpty = pathsWithEffectiveRole("required", d)
    .filter((p) => !isPathFilled(d, p))
    .map(labelled);
  const scoredEmpty = pathsWithEffectiveRole("scored", d)
    .filter((p) => !NOT_NAGGED.has(p) && !isPathFilled(d, p))
    .map(labelled);
  const verdictEmpty = pathsWithEffectiveRole("needed-for-verdict", d)
    .filter((p) => !isPathFilled(d, p))
    .map(labelled);
  const left = skippableLeft(d);
  return {
    requiredLeft: requiredEmpty.slice(),
    requiredEmpty,
    scoredEmpty,
    verdictEmpty,
    skippableSummary: left.map((g) => g.label).join(", "),
    skippableGroupsLeft: left,
    requiredLeftCount: requiredEmpty.length,
    scoredEmptyCount: scoredEmpty.length,
    verdictEmptyCount: verdictEmpty.length,
  };
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function nameList(items) {
  return items.map((i) => i.label).join(", ");
}

/**
 * Part 139 E — Submit bar plain words, in this order:
 * 1. required left → "N required boxes left before you can submit."
 * 2. else if scored empty → "Ready to submit. N scored boxes are still empty — each one costs a point."
 * 3. else → "Ready to submit. Every scored box is filled."
 * Plus, when verdict boxes are empty: "COGS and GST are needed for a verdict." (names from the empty set).
 */
export function submitBarMessage(doc) {
  const c = submitChecklist(doc);
  let main;
  if (c.requiredLeftCount) {
    main = `${c.requiredLeftCount} required ${plural(c.requiredLeftCount, "box", "boxes")} left before you can submit.`;
  } else if (c.scoredEmptyCount) {
    main = `Ready to submit. ${c.scoredEmptyCount} scored ${plural(c.scoredEmptyCount, "box is", "boxes are")} still empty — each one costs a point.`;
  } else {
    main = "Ready to submit. Every scored box is filled.";
  }
  if (c.verdictEmptyCount) {
    const names = nameList(c.verdictEmpty);
    const verb = c.verdictEmptyCount === 1 ? "is" : "are";
    main = `${main} ${names} ${verb} needed for a verdict.`;
  }
  return main;
}

// ----------------------------- Path to GO � never sell an optional box as a score gain -----------------------------

/** The exact words for "this box does not move your score" � ROLE_MEANING.optional, never a second wording. */
export function optionalPathHint() {
  return ROLE_MEANING.optional;
}

/**
 * Best-effort: which form box does a Path-to-GO row talk about? Returns "" when it names none
 * (most rows describe a scored check, not a box, and are left alone).
 */
export function pathActionFieldPath(filter, text) {
  const t = String(text || "");
  const k = String(filter || "").toLowerCase();
  if (k === "f1") {
    if (/\bevidence source\b/i.test(t)) return "f1.evidenceSourceDate";
    if (/\battribute 2\b|\b2nd attribute\b/i.test(t)) return "f1.declaredAttribute2";
    if (/\battribute 3\b|\b3rd attribute\b/i.test(t)) return "f1.declaredAttribute3";
    if (/who is this for|target consumer/i.test(t)) return "f1.targetConsumer";
  }
  if (k === "f2") {
    if (/quick-?commerce|q-?com/i.test(t)) return "f2.qcomTrajectory";
    if (/finance sign/i.test(t)) return "f2.financeSigned";
  }
  return "";
}

const NOT_A_SCORE_GAIN = new Set(["optional", "not-in-score"]);

/**
 * Path-to-GO rows for this idea: a non-blocking row that gains nothing and points at an
 * optional / not-in-score box is dropped; a row that still points at an optional / filled-by-AI
 * box (because it carries a gain from a scored check) is returned with `optionalHint` set.
 */
export function annotatePathActions(actions, doc) {
  const out = [];
  for (const a of Array.isArray(actions) ? actions : []) {
    // Pasted / matching Filter 4 views are already credited — do not keep them on Closest path.
    if (String(a?.filter || "").toUpperCase() === "F4" && doc) {
      const line = String(a?.instruction || a?.text || "").toLowerCase();
      const dim = TECH_SHIFT_DIMENSIONS.find((key) => {
        const label = String(DIMENSION_LABELS[key] || key).toLowerCase();
        return label && line.includes(label);
      });
      if (dim && f4AnswerPasses(doc, dim)) continue;
    }
    const path = pathActionFieldPath(a?.filter, a?.instruction || a?.text);
    const role = path ? effectiveRole(path, doc) : null;
    if (role && NOT_A_SCORE_GAIN.has(role)) {
      if (!a.blocker && !(Number(a.gainPct) > 0)) continue;
      out.push({ ...a, optionalHint: optionalPathHint() });
      continue;
    }
    if (role === "filled-by-ai") {
      out.push({ ...a, optionalHint: optionalPathHint() });
      continue;
    }
    out.push(a);
  }
  return out;
}
