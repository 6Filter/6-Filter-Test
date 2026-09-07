import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldOwners } from "../lib/fieldOwnership.js";
import {
  closestPathToGo,
  computeImprovementPointValues,
  countFiltersWithEvidence,
  f2ActualVsFloor,
  f3ActualVsCeiling,
  formatScreenedDuration,
  ownersForCheckItem,
  projectedScoreIfTopResolved,
  scoreArcColor,
} from "../lib/improvementPoints.js";
import { financeSignatureCopy, scoreAdvisoryChecks } from "../lib/goNoGo.js";

const checks = {
  f1: {
    checkLabel: "Cleared",
    items: [
      { status: "done", text: "Benchmark named: Indulekha" },
      { status: "done", text: "Attributes declared (3 of 3)" },
    ],
  },
  f2: {
    checkLabel: "Below floor",
    items: [
      { status: "done", text: "MRP ₹199 · 100ml" },
      {
        status: "pending",
        text: "Net margin 40% is below the 50% floor (v4, non-negotiable)",
      },
      { status: "pending", text: financeSignatureCopy(false), formAdmin: true },
    ],
  },
  f3: {
    checkLabel: "Below floor",
    items: [
      {
        status: "pending",
        text: "Current MRP implies a price above the safe ₹120 ceiling — risks over 10 percent volume loss",
      },
    ],
  },
  f4: {
    checkLabel: "Cleared",
    items: [{ status: "done", text: "Functional core stability: Low risk — function survives a form change" }],
  },
};

const scored = scoreAdvisoryChecks(checks);
const items = computeImprovementPointValues(checks);
assert.equal(items.length, 2, "form-admin Finance line must not become a next-step");
assert.ok(items.every((it) => it.pointValue === Math.round(100 / 6)));
assert.equal(
  items.reduce((s, it) => s + it.pointValue, 0),
  2 * Math.round(100 / 6)
);
assert.doesNotMatch(JSON.stringify(items), /Finance/);
assert.equal(items[0].filter, "F2");
assert.deepEqual(items[0].owners, fieldOwners("netMarginAtScale"));
assert.deepEqual(ownersForCheckItem("f3", items[1].text), fieldOwners("marginElasticity"));
assert.deepEqual(ownersForCheckItem("f1", "Benchmark named: Indulekha"), ["BM", "CMI"]);
assert.deepEqual(ownersForCheckItem("f4", "User habit shift potential: High risk — habit may move"), ["CMI", "R&D"]);

const projected = projectedScoreIfTopResolved(checks, items, 2);
assert.equal(projected, Math.round((100 * (scored.done + 2)) / scored.total));

const notCoreCopy =
  "The category currently sells on price-pack architecture / value-for-money, flavour range and regional relevance, brand salience/distribution reach, and health perception (baked/lower-oil). Distinctive crunch/texture requires primary research — it is not a salient purchase driver across general trade, modern trade, e-com and quick-commerce.";
assert.deepEqual(ownersForCheckItem("f1", notCoreCopy), fieldOwners("declaredAttribute"));

const chipsLike = {
  f1: {
    items: [
      { status: "pending", text: notCoreCopy },
      { status: "done", text: "Benchmark verified: Lay's" },
      { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
      { status: "done", text: "Growth route and argument recorded, backed by researched category size" },
    ],
  },
  f2: {
    items: [
      { status: "done", text: "MRP ₹49.17 · 60g" },
      { status: "done", text: "Net margin 40% clears the 30% floor" },
      { status: "done", text: "Quick-commerce terms assumption recorded" },
    ],
  },
  f3: { items: [{ status: "done", text: "Filter 2 MRP sits within the safe ₹46–₹53 range" }] },
  f4: {
    items: [
      { status: "pending", text: "Functional core stability: Medium risk — baked claim is fragile" },
      { status: "done", text: "Consumption context stability: Low risk — leisure occasions hold" },
      { status: "pending", text: "Manufacturing disruption risk: Medium risk — competing processes" },
      { status: "pending", text: "User habit shift potential: High risk — better-for-you snacking" },
      { status: "done", text: "Adjacent substitution threat: Low risk — alternatives exist" },
      { status: "done", text: "Purchase frequency shift: Low risk — impulse packs remain" },
      { status: "pending", text: "Regulatory disruption risk: Medium risk — labeling pressure" },
    ],
  },
};
const chipsScore = scoreAdvisoryChecks(chipsLike);
assert.equal(chipsScore.done, 10);
assert.equal(chipsScore.total, 15);
assert.equal(chipsScore.pct, 67);
const chipsItems = computeImprovementPointValues(chipsLike);
const path = closestPathToGo(chipsLike, chipsItems);
assert.equal(path.items.length, 3);
assert.equal(path.projectedPct, 87);
assert.equal(path.reachesGo, true);
assert.notEqual(path.projectedPct, 81);

assert.equal(scoreArcColor(40), "var(--fail)");
assert.equal(scoreArcColor(70), "var(--watch)");
assert.equal(scoreArcColor(90), "var(--pass)");

const pair = f2ActualVsFloor(
  { f2: { netMarginAtScale: 40 } },
  checks.f2
);
assert.deepEqual(pair, { actual: 40, floor: 50, unit: "%" });

const f3 = f3ActualVsCeiling({
  f2: { mrpInr: 199 },
  f3: { marginElasticity: { maxMrpInr: 120 } },
});
assert.deepEqual(f3, { actual: 199, ceiling: 120, unit: "₹" });
assert.equal(f3ActualVsCeiling({ f2: { mrpInr: 199 } }), null, "must not invent a ceiling");

const coverage = countFiltersWithEvidence({
  f1: { declaredAttribute: "cooling" },
  f2: { netMarginAtScale: 40 },
  f3: {},
  f4: {},
  f5: {},
  f6: {},
});
assert.equal(coverage.total, 6);
assert.equal(coverage.have, 2);

const src = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(src, /--bg:#0d0715/);
assert.match(src, /--path-panel-bg:#151f2c/);
assert.match(src, /Space Grotesk/);
assert.match(src, /JetBrains Mono/);
assert.match(src, /closestPathToGo/);
assert.match(src, /What to do next/);
assert.match(src, /Closest path to GO/);
assert.match(src, /See all next steps/);
assert.match(src, /gonogo-scale-chip/);
assert.match(src, /ideaSizeFromF5/);
assert.doesNotMatch(src, /Export summary/);
assert.match(src, /formatScreenedDuration\(doc\?\.researchDurationMs\)/);
assert.doesNotMatch(src, /result\.screenedMs/);
assert.equal(formatScreenedDuration(12000), "12s");
assert.equal(formatScreenedDuration(null), null);

const goNoGo = readFileSync(new URL("../lib/goNoGo.js", import.meta.url), "utf8");
assert.doesNotMatch(goNoGo, /computeImprovementPointValues/);
assert.match(goNoGo, /<60 NO-GO · 60–80 WATCH · >80 GO/);

console.log("PASS Part 58 output-page point values, owners, and reference tokens");
