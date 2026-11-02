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
  resolveOutputScore,
  scoreArcColor,
} from "../lib/improvementPoints.js";
import { buildGateRationale, financeSignatureCopy, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { checkF4 } from "../lib/filterChecks.js";
import { scoreInputKey } from "../lib/analysisStability.js";

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
assert.match(src, /ideaSizeForResult|ideaSizeFromF5/);
assert.doesNotMatch(src, /Export summary/);
assert.match(src, /formatScreenedDuration\(doc\?\.researchDurationMs\)/);
assert.doesNotMatch(src, /result\.screenedMs/);
assert.equal(formatScreenedDuration(12000), "12s");
assert.equal(formatScreenedDuration(null), null);

const goNoGo = readFileSync(new URL("../lib/goNoGo.js", import.meta.url), "utf8");
assert.doesNotMatch(goNoGo, /computeImprovementPointValues/);
assert.match(goNoGo, /lockedConstants/);
assert.match(goNoGo, /classifyGoNoGoFromBands/);

// Stale 100% ring must not win over live F4 Medium pending checks (Protein milkshake case).
const mediumF4 = checkF4({
  techShiftRisk: {
    overallRisk: "Medium",
    dimensions: {
      functionalCoreStability: { risk: "Medium", reason: "heat-stable protein" },
      consumptionContextStability: { risk: "Medium", reason: "RTD occasions" },
      manufacturingDisruptionRisk: { risk: "Medium", reason: "UHT capacity" },
      userHabitShiftPotential: { risk: "Medium", reason: "powder mix switch" },
      adjacentSubstitutionThreat: { risk: "Medium", reason: "whey RTDs" },
      purchaseFrequencyShift: { risk: "Medium", reason: "basket pressure" },
      regulatoryDisruptionRisk: { risk: "Low", reason: "FSSAI path" },
    },
  },
});
const milkshakeChecks = {
  f1: {
    checkLabel: "Cleared",
    items: [
      { status: "done", text: "Attribute ok" },
      { status: "done", text: "Benchmark verified" },
      { status: "done", text: "Gap clears floor" },
      { status: "done", text: "Growth argument recorded" },
    ],
  },
  f2: {
    checkLabel: "Cleared",
    items: [
      { status: "done", text: "Net margin 40% clears the 18% floor" },
      { status: "done", text: "Quick-commerce terms assumption recorded" },
    ],
  },
  f3: { checkLabel: "Cleared", items: [{ status: "done", text: "MRP inside safe band" }] },
  f4: mediumF4,
};
const milkDoc = {
  name: "Protein milkshake",
  f1: { benchmark: "Electral", declaredGap: 3 },
  f2: { netMarginAtScale: 40, mrpInr: 99, grammage: "200ml" },
  f3: {},
  f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Medium" } } } },
};
const milkKey = scoreInputKey(milkDoc);
const liveMilk = scoreAdvisoryChecks(milkshakeChecks);
assert.ok(liveMilk.pct < 100 && liveMilk.total > liveMilk.done);

const liveBeatsStale100 = resolveOutputScore(milkshakeChecks, { pct: 100, done: 14, total: 14 });
assert.ok(liveBeatsStale100.pct < 100, "live pending F4 items must beat a stale 100% store");
assert.ok(liveBeatsStale100.total > liveBeatsStale100.done);

const stale100Locked = resolveOutputScore(
  milkshakeChecks,
  { pct: 100, done: 14, total: 14, scoreInputKey: milkKey },
  milkDoc,
  milkKey
);
assert.ok(stale100Locked.pct < 100, "stale 100% loses even when a lock key still matches");
assert.ok(stale100Locked.total > stale100Locked.done);

const lockedHonest = resolveOutputScore(
  milkshakeChecks,
  { pct: 72, done: liveMilk.done, total: liveMilk.total, scoreInputKey: milkKey },
  milkDoc,
  milkKey
);
assert.equal(lockedHonest.pct, 72, "non-100% seal still hard-locks when the fingerprint matches");

const milkPath = closestPathToGo(milkshakeChecks, computeImprovementPointValues(milkshakeChecks));
assert.ok(milkPath.projectedPct >= milkPath.currentPct, "path must never suggest a lower score");
assert.notEqual(milkPath.projectedPct, 100);

const sealedPath = closestPathToGo(
  milkshakeChecks,
  computeImprovementPointValues(milkshakeChecks),
  { pct: 86, done: 12, total: 14 }
);
assert.equal(sealedPath.currentPct, 86, "path current % must follow the sealed ring score");
assert.equal(sealedPath.projectedPct, 86, "already-GO sealed ring must not invent a higher path target");

// Sealed tiny denominator must not project to 100% while live still has several gaps.
const mismatchedSealPath = closestPathToGo(
  milkshakeChecks,
  computeImprovementPointValues(milkshakeChecks),
  { pct: 60, done: 3, total: 5 }
);
assert.equal(mismatchedSealPath.currentPct, 60);
assert.ok(mismatchedSealPath.projectedPct > 60);
assert.ok(
  mismatchedSealPath.projectedPct <= Math.round((100 * (liveMilk.done + mismatchedSealPath.items.length)) / liveMilk.total),
  "path projection must follow live done/total, not the sealed denominator"
);
assert.match(src, /resolveOutputScore/);
const watchRationale = buildGateRationale({
  classification: "WATCH",
  score: { pct: 100 },
  checks: milkshakeChecks,
  ideaName: "Protein milkshake",
});
assert.doesNotMatch(watchRationale, /60–80 band|60-80 band/);
assert.match(watchRationale, /Outstanding on the form|Medium risk/i);

console.log("PASS Part 58 output-page point values, owners, and reference tokens");
