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
const maxMarginPct = ((maxMrpInr - projectedCogs5yr) / maxMrpInr) * 100;
const minMrpIfSameCogsAsMax = mrpFromMarginPct(projectedCogs5yr, minMarginPct);

assert(minMrpInr !== maxMrpInr, "min MRP (today's COGS) must not equal the 5-year price ceiling");
assert(
  Math.abs((minMrpIfSameCogsAsMax || 0) - minMrpInr) > 1,
  "min MRP must use today's COGS, not the 5-year inflated COGS used for max margin"
);

const range = {
  minMrpInr,
  maxMrpInr,
  minMarginPct,
  maxMarginPct,
};
const declared = { cogsAtScale: cogs, netMarginAtScale: 30 };
const before = checkF3(declared, { marginElasticity: range });
assert(before.checkLabel === "Cleared", `30% should sit in ${minMarginPct}–${maxMarginPct.toFixed(1)}, got ${before.checkLabel}`);
assert(/₹63–₹105|₹62–₹105/.test(before.items[0].text), before.items[0].text);

const overriddenMax = 70;
const syncedMaxPct = marginPctFromMrp(cogs, overriddenMax);
assert(syncedMaxPct != null && syncedMaxPct < 30, `overriding max MRP to 70 should pull max margin below 30, got ${syncedMaxPct}`);
const after = checkF3(declared, {
  marginElasticity: { ...range, maxMrpInr: overriddenMax, maxMarginPct: syncedMaxPct },
});
assert(after.checkLabel === "Below floor", `should flip to Below floor after max MRP override, got ${after.checkLabel}`);
assert(/₹70 ceiling/.test(after.items[0].text), after.items[0].text);

console.log("part47 ok");
console.log(`minMrp (today COGS)=${minMrpInr.toFixed(2)} maxMrp (5yr ceiling)=${maxMrpInr.toFixed(2)} projectedCogs5yr=${projectedCogs5yr.toFixed(2)}`);
