/**
 * Part 143 A (D84–D85, D89) — the two labels a person sees on the form.
 *
 * The finer roles in fieldRoles.js stay for scoring tests. This module maps a path
 * to "Required" or "Optional" for display only. Browser-safe: no I/O, no Node APIs.
 */
import { isNewMarketRoute as f1IsNewMarketRoute } from "./filter1Check.js";
import { isPathFilled, valueAtPath } from "./fieldRoles.js";

/** The five boxes that gate Submit (D85 / D89). */
export const SUBMIT_GATE_PATHS = Object.freeze([
  "submitterName",
  "submitterDepartment",
  "name",
  "category",
  "ideaDescription",
]);

/**
 * Display-Required boxes (D85). Benchmark is Required unless growth route is New market.
 * Everything else on the form is Optional.
 */
export const DISPLAY_REQUIRED_PATHS = Object.freeze([
  "submitterName",
  "submitterDepartment",
  "name",
  "category",
  "ideaDescription",
  "f1.declaredAttribute",
  "f1.benchmark",
  "f1.declaredGap",
  "f1.gapDerivation",
  "f1.parityExceptions",
  "f1.growthRoute",
  "f1.growthArgument",
  "f2.cogsAtScale",
  "f2.netMarginAtScale",
  "f2.gstRatePct",
  "f2.grammage",
]);

const DISPLAY_LABEL = Object.freeze({
  submitterName: "Your name",
  submitterDepartment: "Your team",
  name: "Proposition name",
  category: "Category",
  ideaDescription: "Idea description",
  "f1.declaredAttribute": "Declared attribute",
  "f1.benchmark": "Benchmark",
  "f1.declaredGap": "Declared gap",
  "f1.gapDerivation": "Gap derivation",
  "f1.parityExceptions": "Parity exceptions",
  "f1.growthRoute": "Growth route",
  "f1.growthArgument": "Growth argument",
  "f2.cogsAtScale": "COGS",
  "f2.netMarginAtScale": "Net margin",
  "f2.gstRatePct": "GST rate",
  "f2.grammage": "Pack size",
});

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
  return { path, label: DISPLAY_LABEL[path] || path };
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

/** Re-export for tests that inspect a path value without importing fieldRoles. */
export { valueAtPath, isPathFilled };
