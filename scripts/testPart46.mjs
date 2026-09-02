import { checkF3 } from "../lib/filterChecks.js";
import { f3HasEnough, isFilterUnlocked } from "../lib/filterUnlock.js";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { buildSuggestions } from "../lib/propositionAiFirstPass.js";
import { solveForVolumeLossCeiling } from "../lib/filters/runMarginElasticityResearch.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const f3Fields = SIX_FILTERS_FORM.find((f) => f.key === "f3")?.fields || [];
assert(f3Fields.length === 1 && f3Fields[0].key === "marginElasticity", "F3 must be exactly one marginElasticity field");
assert(
  !f3Fields.some((f) =>
    ["priceIndexVsBenchmark", "fixedPricePointExposure", "elasticityEstimate", "elasticitySource", "modelledVolumeLoss"].includes(f.key)
  ),
  "old F3 field keys must be gone from the schema"
);

const f1Growth = SIX_FILTERS_FORM.find((f) => f.key === "f1")?.fields.find((f) => f.key === "growthRoute");
assert(f1Growth?.label === "Growth Route", `growthRoute label should be Growth Route, got ${f1Growth?.label}`);

const missing = checkF3({ netMarginAtScale: 40 }, {});
assert(missing.checkLabel === "Evidence missing", "no range → evidence missing");
assert(/not yet computed/i.test(missing.items[0].text), missing.items[0].text);

const noMargin = checkF3(
  {},
  { marginElasticity: { minMarginPct: 18, maxMarginPct: 55, minMrpInr: 61, maxMrpInr: 111 } }
);
assert(noMargin.checkLabel === "Evidence missing", "range without F2 margin → evidence missing");
assert(/isn't entered yet/i.test(noMargin.items[0].text), noMargin.items[0].text);

const cleared = checkF3(
  { netMarginAtScale: 40 },
  { marginElasticity: { minMarginPct: 18, maxMarginPct: 55, minMrpInr: 61, maxMrpInr: 111 } }
);
assert(cleared.checkLabel === "Cleared", `inside band should clear, got ${cleared.checkLabel}`);
assert(/safe ₹61–₹111 range/.test(cleared.items[0].text), cleared.items[0].text);

const below = checkF3(
  { netMarginAtScale: 10 },
  { marginElasticity: { minMarginPct: 18, maxMarginPct: 55, minMrpInr: 61, maxMrpInr: 111 } }
);
assert(below.checkLabel === "Below floor", "below min should be Below floor");
assert(/below the safe ₹61 floor/.test(below.items[0].text), below.items[0].text);

const above = checkF3(
  { netMarginAtScale: 70 },
  { marginElasticity: { minMarginPct: 18, maxMarginPct: 55, minMrpInr: 61, maxMrpInr: 111 } }
);
assert(above.checkLabel === "Below floor", "above max should be Below floor");
assert(/above the safe ₹111 ceiling/.test(above.items[0].text), above.items[0].text);

assert(!f3HasEnough({}), "empty f3 does not unlock");
assert(!f3HasEnough({ marginElasticity: { minMarginPct: 18, maxMarginPct: null } }), "null max does not unlock");
assert(f3HasEnough({ marginElasticity: { minMarginPct: 18, maxMarginPct: 55 } }), "max set unlocks F3-enough");

const locked = isFilterUnlocked("f4", {
  f1: {
    declaredAttribute: "softness",
    benchmark: "X",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "yes",
  },
  f2: { cogsAtScale: 30, netMarginAtScale: 40 },
  f3: { marginElasticity: { minMarginPct: 18 } },
});
assert(!locked, "F4 stays locked until maxMarginPct exists");

const unlocked = isFilterUnlocked("f4", {
  f1: {
    declaredAttribute: "softness",
    benchmark: "X",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "yes",
  },
  f2: { cogsAtScale: 30, netMarginAtScale: 40 },
  f3: { marginElasticity: { minMarginPct: 18, maxMarginPct: 55 } },
});
assert(unlocked, "F4 unlocks once the range has maxMarginPct");

const noElasticity = solveForVolumeLossCeiling({
  categoryAvgPrice: 80,
  inflationRatePct: 5,
  volumeLossAtInflationPct: null,
});
assert(noElasticity.priceCeiling == null, "missing elasticity must not fabricate a ceiling");
assert(/elast/i.test(noElasticity.reason), noElasticity.reason);

const ceiling = solveForVolumeLossCeiling({
  categoryAvgPrice: 100,
  inflationRatePct: 5,
  volumeLossAtInflationPct: 10,
  targetVolumeLossPct: 10,
});
assert(Math.abs(ceiling.priceCeiling - 105) < 1e-9, `expected 105, got ${ceiling.priceCeiling}`);

const suggestions = buildSuggestions({}, {}, null, null, null, {
  minMarginPct: 18,
  maxMarginPct: 52.4,
  basis: "Min from the Personal Care division floor. Max from modelled category pricing.",
  sources: [],
  aiSourced: true,
});
assert(suggestions.f3.marginElasticity?.maxMarginPct === 52.4, "suggestions should carry marginElasticity");
assert(suggestions.f3.priceIndexVsBenchmark == null, "old price index must not be suggested");
assert(suggestions.f3.modelledVolumeLoss == null, "old volume-loss field must not be suggested");

console.log("part46 ok");
