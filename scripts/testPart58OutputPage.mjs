import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldOwners } from "../lib/fieldOwnership.js";
import {
  computeImprovementPointValues,
  countFiltersWithEvidence,
  f2ActualVsFloor,
  f3ActualVsCeiling,
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

const projected = projectedScoreIfTopResolved(scored.pct, items, 2);
assert.equal(projected, Math.min(100, scored.pct + items[0].pointValue + items[1].pointValue));

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
assert.match(src, /computeImprovementPointValues/);
assert.match(src, /What to do next/);
assert.match(src, /Closest path to GO/);
assert.match(src, /See all next steps/);
assert.doesNotMatch(src, /business impact/i);
assert.doesNotMatch(src, /className="gonogo-scale"/);
assert.doesNotMatch(src, /Export summary/);

const goNoGo = readFileSync(new URL("../lib/goNoGo.js", import.meta.url), "utf8");
assert.doesNotMatch(goNoGo, /computeImprovementPointValues/);
assert.match(goNoGo, /0–60 NO-GO · 61–80 WATCH · 81\+ GO/);

console.log("PASS Part 58 output-page point values, owners, and reference tokens");
