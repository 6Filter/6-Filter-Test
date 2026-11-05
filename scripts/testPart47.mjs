import { checkF3 } from "../lib/filterChecks.js";
import { mrpFromMarginPct, marginPctFromMrp } from "../lib/mrpFormula.js";
import { solveForVolumeLossCeiling } from "../lib/filters/runMarginElasticityResearch.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cogs = 50;
const minMarginPct = 20;
const minMrpInr = mrpFromMarginPct(cogs, minMarginPct);
assert(Math.abs(minMrpInr - 62.5) < 1e-9, `min MRP from today's COGS expected 62.5, got ${minMrpInr}`);

const inflation = 5;
const ceiling = solveForVolumeLossCeiling({
  categoryAvgPrice: 100,
  inflationRatePct: inflation,
  volumeLossAtInflationPct: 10,
  targetVolumeLossPct: 10,
});
assert(Math.abs(ceiling.priceCeiling - 105) < 1e-9, `price ceiling expected 105, got ${ceiling.priceCeiling}`);

const projectedCogs5yr = cogs * Math.pow(1 + inflation / 100, 5);
const maxMrpInr = ceiling.priceCeiling;

assert(minMrpInr !== maxMrpInr, "min MRP (today's COGS) must not equal the 5-year price ceiling");
assert(
  Math.abs(mrpFromMarginPct(projectedCogs5yr, minMarginPct) - minMrpInr) > 1,
  "min MRP must use today's COGS, not the 5-year inflated COGS used for max margin"
);

const f2 = { cogsAtScale: cogs, netMarginAtScale: 30, gstRatePct: 18 };
assert(checkF3({}, {}).checkLabel === "Not yet run", "no F2 price → Not yet run");

const noResearch = checkF3(f2, {}, {});
assert(noResearch.checkLabel === "Marked down", `MRP without priceEvents is mark-down, got ${noResearch.checkLabel}`);
assert(noResearch.checkLabel !== "Below floor", "Filter 3 never Below floor");

const cleared = checkF3(f2, {}, { priceEvents: { annualIncreasePct: 0, events: [] } });
assert(cleared.checkLabel === "Cleared", `smooth inflation with no crossing clears, got ${cleared.checkLabel}`);

const overriddenMax = 70;
const syncedMaxPct = marginPctFromMrp(cogs, overriddenMax);
assert(syncedMaxPct != null && syncedMaxPct < 30, `overriding max MRP to 70 should pull max margin below 30, got ${syncedMaxPct}`);

// Legacy marginElasticity on f3 no longer scores — only F2 MRP + priceEvents matter.
const bandIgnored = checkF3(f2, {
  marginElasticity: {
    minMrpInr,
    maxMrpInr: overriddenMax,
    minMarginPct,
    maxMarginPct: syncedMaxPct,
  },
});
assert(bandIgnored.checkLabel === "Marked down", "stored band does not override missing research");

console.log("part47 ok");
console.log(`minMrp (today COGS)=${minMrpInr.toFixed(2)} maxMrp (5yr ceiling)=${maxMrpInr.toFixed(2)} projectedCogs5yr=${projectedCogs5yr.toFixed(2)}`);
