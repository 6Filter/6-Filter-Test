import { checkF3 } from "../lib/filterChecks.js";
import { f3HasEnough, isFilterUnlocked } from "../lib/filterUnlock.js";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { solveForVolumeLossCeiling } from "../lib/filters/runMarginElasticityResearch.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const f3Fields = SIX_FILTERS_FORM.find((f) => f.key === "f3")?.fields || [];
assert(f3Fields[0]?.key === "plannedAnnualIncreasePct", "F3 form field is the inflation-cover input");
assert(f3Fields[0]?.type === "price-resilience", "F3 field is the interactive cliff preview");
assert(
  !f3Fields.some((f) => f.key === "marginElasticity" || f.key === "f3RangeOverride"),
  "safe-range fields removed from the schema"
);
assert(
  !f3Fields.some((f) =>
    ["priceIndexVsBenchmark", "fixedPricePointExposure", "elasticityEstimate", "elasticitySource", "modelledVolumeLoss"].includes(f.key)
  ),
  "old F3 field keys must be gone from the schema"
);

const f1Growth = SIX_FILTERS_FORM.find((f) => f.key === "f1")?.fields.find((f) => f.key === "growthRoute");
assert(f1Growth?.label === "Growth route", `growthRoute label should be Growth route, got ${f1Growth?.label}`);

// Part 135 — without a resolvable Filter 2 MRP, Filter 3 is Not yet run.
const missing = checkF3({}, {});
assert(missing.checkLabel === "Not yet run", "empty F2 must not read as Cleared");
assert(missing.items.length === 0, "blank F3 has no check items yet");

const noEvents = checkF3(
  { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18 },
  {},
  {}
);
assert(noEvents.checkLabel === "Marked down", "price without research is mark-down");
assert(noEvents.checkLabel !== "Below floor", "never Below floor");

const cleared = checkF3(
  { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18 },
  {},
  { priceEvents: { annualIncreasePct: 0, events: [] } }
);
assert(cleared.checkLabel === "Cleared", `no crossing should clear, got ${cleared.checkLabel}`);

assert(!f3HasEnough({}), "empty f3 without F2 price is not f3-enough");
assert(
  f3HasEnough({}, { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18 }),
  "resolvable F2 MRP counts as f3-enough"
);
assert(
  f3HasEnough({ marginElasticity: { minMrpInr: 277, maxMrpInr: 361 } }),
  "legacy rupee band still counts as f3-enough"
);
assert(
  !f3HasEnough({ marginElasticity: { minMrpInr: 277 } }),
  "only Min MRP is not f3-enough"
);

const doc = {
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "summer ritual",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18 },
  f3: {},
};
assert(isFilterUnlocked("f3", {}), "F3 is always editable");
assert(isFilterUnlocked("f4", doc), "F4 is always editable");

const ceiling = solveForVolumeLossCeiling({
  categoryAvgPrice: 100,
  inflationRatePct: 6,
  volumeLossAtInflationPct: 6,
  targetVolumeLossPct: 10,
});
assert(ceiling.priceCeiling != null, "legacy solver still available for research helpers");

console.log("PASS Part 46 F3 cliff form + f3HasEnough (no progressive unlock)");
