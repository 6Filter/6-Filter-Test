/**
 * Part 143 A (D84–D85, D89) and Part 145 (D105, D109) — the two labels a person sees on the form.
 *
 * The finer roles in fieldRoles.js stay for scoring tests. This module maps a path
 * to "Required" or "Optional" for display only. Browser-safe: no I/O, no Node APIs.
 */
import { isNewMarketRoute as f1IsNewMarketRoute, textConfirmedByPerson } from "./filter1Check.js";
import { GUARDED_FIELDS, submitBarSummary, reviewInputsGuarded as reviewInputs } from "./answerGuard.js";
import { getFieldRole, isPathFilled, valueAtPath } from "./fieldRoles.js";
import { DISPLAY_LABEL, DISPLAY_REQUIRED_PATHS, SUBMIT_GATE_PATHS } from "./requiredBoxes.js";

export { SUBMIT_GATE_PATHS, DISPLAY_REQUIRED_PATHS };

function isNewMarket(doc) {
  return f1IsNewMarketRoute(doc?.f1 || {});
}

/** "Required" or "Optional" for this box on this idea. */
export function displayRole(path, doc) {
  const p = String(path ?? "").trim();
  if (!p) return "Optional";
  if (p === "f1.benchmark" && isNewMarket(doc)) return "Optional";
  if (DISPLAY_REQUIRED_PATHS.includes(p)) return "Required";
  return "Optional";
}

export function displayRoleKey(path, doc) {
  return displayRole(path, doc) === "Required" ? "required" : "optional";
}

function labelled(path) {
  return { path, label: DISPLAY_LABEL[path] || getFieldRole(path)?.label || path };
}

/** Required boxes that are still empty (display Required list). */
export function requiredEmpty(doc) {
  const d = doc || {};
  return DISPLAY_REQUIRED_PATHS.filter((p) => {
    if (p === "f1.benchmark" && isNewMarket(d)) return false;
    return !isPathFilled(d, p);
  }).map(labelled);
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function nameList(items) {
  return items.map((i) => i.label).join(", ");
}

/**
 * Submit bar plain words (kept short so the fixed bar does not cover the form):
 * Any display-Required empty → "N required boxes left before you can submit."
 * Else → "Ready to submit."
 * Full missing-field names live under "Why can't I submit?".
 */
export function submitBarMessageTwoLabels(doc) {
  const d = doc || {};
  const left = requiredEmpty(d);
  if (left.length) {
    return `${left.length} required ${plural(left.length, "box", "boxes")} left before you can submit.`;
  }
  return "Ready to submit.";
}

/** Full missing-Required list for the Why-can't-I-submit panel. */
export function requiredEmptySummary(doc) {
  const left = requiredEmpty(doc);
  if (!left.length) return "";
  return nameList(left);
}

// ───────────────────────────── Part 150 D138 — one list of what blocks, for the bar and the panel ─────────────────────────────

/** The path a review field key lives at (top-of-form boxes are bare). */
export function pathForReviewField(field) {
  const f = String(field || "");
  if (f === "name" || f === "category" || f === "ideaDescription") return f;
  if (["declaredAttribute", "benchmark", "gapDerivation", "parityExceptions", "growthArgument", "declaredGap"].includes(f)) {
    return `f1.${f}`;
  }
  if (["gstRatePct", "netMarginAtScale", "mrpInr", "cogsAtScale", "grammage"].includes(f)) return `f2.${f}`;
  return f;
}

const AI_TEXT_PATHS = Object.freeze(["f1.gapDerivation", "f1.parityExceptions", "f1.growthArgument"]);

function autofillStatusOf(doc) {
  const own = doc?.autofillStatus;
  if (own && typeof own === "object") return own;
  const nested = doc?.researchFindings?.autofillStatus;
  return nested && typeof nested === "object" ? nested : {};
}

/** AI-written texts nobody has edited or confirmed yet: they score nothing until someone does. */
export function unconfirmedAiTexts(doc) {
  const d = doc || {};
  const status = autofillStatusOf(d);
  return AI_TEXT_PATHS.filter((p) => {
    const value = valueAtPath(d, p);
    if (!String(value ?? "").trim()) return false;
    return !textConfirmedByPerson(p, value, status);
  }).map(labelled);
}

/**
 * The three lists behind both the Submit bar and the "Why can't I submit?" panel:
 * requiredEmpty (still empty), invalid (refused answers, with their message) and unconfirmed (AI text to confirm).
 */
export function submitProblems(doc) {
  const d = doc || {};
  // Stable order: the guarded text boxes follow the order they appear in the form.
  const rank = (f) => GUARDED_FIELDS.indexOf(f.field) + 1;
  const invalid = reviewInputs(d)
    .fields.filter((f) => f.status === "invalid")
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map(({ f }) => f)
    .map((f) => {
      const path = pathForReviewField(f.field);
      return { field: f.field, path, label: DISPLAY_LABEL[path] || getFieldRole(path)?.label || f.field, message: f.message };
    });
  return { requiredEmpty: requiredEmpty(d), invalid, unconfirmed: unconfirmedAiTexts(d) };
}

/** The bar line: "Ready to submit." only when nothing in submitProblems(doc) is left. */
export function submitBarLine(doc) {
  return submitBarSummary(submitProblems(doc));
}

/** Re-export for tests that inspect a path value without importing fieldRoles. */
export { valueAtPath, isPathFilled };
