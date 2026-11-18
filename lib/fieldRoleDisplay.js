/**
 * Part 143 A (D84–D85, D89) and Part 145 (D105, D109) — the two labels a person sees on the form.
 *
 * The finer roles in fieldRoles.js stay for scoring tests. This module maps a path
 * to "Required" or "Optional" for display only. Browser-safe: no I/O, no Node APIs.
 */
import { isNewMarketRoute as f1IsNewMarketRoute } from "./filter1Check.js";
import { isPathFilled, valueAtPath } from "./fieldRoles.js";
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
