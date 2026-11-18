/**
 * Part 145 D105 — the 12 boxes a person types. A leaf module (no imports) so both the display
 * labels (fieldRoleDisplay.js) and the output-page list (filterUnlock.js) read one list.
 * Browser-safe.
 */

/** The three idea boxes every Submit needs. Name and team come from the login, never a box. */
export const SUBMIT_GATE_PATHS = Object.freeze(["name", "category", "ideaDescription"]);

/** The 12 Required boxes. Benchmark is Optional under the New market route. */
export const DISPLAY_REQUIRED_PATHS = Object.freeze([
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
  "f2.grammage",
  "f2.gstRatePct",
]);

export const DISPLAY_LABEL = Object.freeze({
  name: "Proposition name",
  category: "Category",
  ideaDescription: "Idea description",
  "f1.declaredAttribute": "Declared attribute",
  "f1.benchmark": "Benchmark",
  "f1.declaredGap": "Declared gap",
  "f1.gapDerivation": "Gap derivation",
  "f1.parityExceptions": "Parity or better on the remaining attributes",
  "f1.growthRoute": "Growth route",
  "f1.growthArgument": "Growth argument",
  "f2.grammage": "Pack size",
  "f2.gstRatePct": "GST rate",
});

/** Same test as filter1Check.isNewMarketRoute, kept here so this module has no imports. */
export function growthRouteIsNewMarket(f1 = {}) {
  return /^new[\s_-]*market$/i.test(String(f1?.growthRoute ?? "").trim());
}
