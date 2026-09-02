import fs from "fs";
import { computeMrp, formatMrpBreakdown } from "../lib/mrpFormula.js";
import { runVolumeLossResearch } from "../lib/filters/runVolumeLossResearch.js";
import { buildSuggestions } from "../lib/propositionAiFirstPass.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const a = computeMrp({ cogsAtScale: 40, netMarginAtScale: 20, gstRatePct: 18 });
const b = computeMrp({ cogsAtScale: 80, netMarginAtScale: 20, gstRatePct: 18 });
const c = computeMrp({ cogsAtScale: 40, netMarginAtScale: 40, gstRatePct: 18 });
assert(a && b && c, "valid inputs should compute");
assert(a.finalMrp !== b.finalMrp && b.finalMrp !== c.finalMrp && a.finalMrp !== c.finalMrp, "three COGS/margin combos must produce three different MRPs");
assert(Math.abs(a.finalMrp - 59) < 0.05, `40/20/18 expected ~59, got ${a.finalMrp}`);

assert(computeMrp({ cogsAtScale: 0, netMarginAtScale: 20, gstRatePct: 18 }) == null, "zero COGS must not compute");
assert(computeMrp({ cogsAtScale: -4, netMarginAtScale: 20, gstRatePct: 18 }) == null, "negative COGS must not compute");
assert(computeMrp({ cogsAtScale: 40, netMarginAtScale: 0, gstRatePct: 18 }) == null, "zero margin must not compute");
assert(computeMrp({ cogsAtScale: 40, netMarginAtScale: 100, gstRatePct: 18 }) == null, "100% margin must not compute");
assert(computeMrp({ cogsAtScale: 40, netMarginAtScale: 110, gstRatePct: 18 }) == null, ">=100% margin must not compute");
assert(formatMrpBreakdown(null, 18) === "—", "invalid MRP display should be an em dash");

const skipped = await runVolumeLossResearch({
  benchmarkName: "Parachute Advansed",
  priceIndexVsBenchmark: "",
  category: "hair oil",
});
assert(skipped == null, "volume-loss research must not fire on an empty price index");

const skippedNull = await runVolumeLossResearch({
  benchmarkName: "Parachute Advansed",
  category: "hair oil",
});
assert(skippedNull == null, "volume-loss research must not fire when price index is omitted");

const withLoss = buildSuggestions({}, {}, { priceIndexVsBenchmark: 108 }, null, null, {
  modelledVolumeLossPct: 6.2,
  basis: "5.5% inflation (WPI food articles, Aug 2026) plus an already-above-benchmark price position",
});
assert(withLoss.f3.modelledVolumeLoss === 6.2, "volume-loss number should surface");
assert(/inflation/i.test(withLoss.f3.modelledVolumeLossBasis || ""), "basis must mention inflation");
assert(/benchmark|above/i.test(withLoss.f3.modelledVolumeLossBasis || ""), "basis must mention competitive position");
assert(withLoss.f2?.mrpInr == null, "suggestions must not seed MRP — formula owns it");

const withoutIndex = buildSuggestions({}, {}, null, null, null, null);
assert(withoutIndex.f3?.modelledVolumeLoss == null, "no volume-loss suggestion without a price index / research result");

const fixture = fs.readFileSync("scripts/testF2Cost.mjs", "utf8");
assert(!/\b5\.3\b/.test(fixture), "testF2Cost.mjs still contains a 5.3-shaped fixture");
assert(
  !/mrpInr\s*[:=]\s*5/.test(fixture),
  "testF2Cost.mjs appears to hardcode an MRP rather than calling live research"
);

console.log("part43 ok");
console.log("three MRPs:", a.finalMrp.toFixed(2), b.finalMrp.toFixed(2), c.finalMrp.toFixed(2));
console.log("testF2Cost.mjs: no 5.3 fixture; live Groq cost-estimate script only");
