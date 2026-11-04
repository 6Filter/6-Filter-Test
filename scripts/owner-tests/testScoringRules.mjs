/**
 * Part 129 owner scoring rules — do not weaken these assertions.
 * Covers one sealed score, fixed slots, INCOMPLETE for unfinished research, and explicit re-screen.
 */
import assert from "node:assert/strict";
import {
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  SCORING_RULESET_VERSION,
  F3_MRP_RANGE_TOLERANCE_INR,
  INCOMPLETE_VERDICT_MODE,
  SCORE_KEY_IGNORES_NAME_TYPOS,
} from "../../lib/lockedConstants.js";
import { scoreAdvisoryChecks, computeGoNoGo, goNoGoIsFloorFailure } from "../../lib/goNoGo.js";
import { resolveOutputScore } from "../../lib/improvementPoints.js";
import { scoreInputKey, sealStoredGoNoGo } from "../../lib/analysisStability.js";
import {
  annotateSealedGoNoGo,
  computeScoreStatus,
  stampScreenedGoNoGo,
} from "../../lib/scoringRuleset.js";
import { checkF1, checkF3, checkF4 } from "../../lib/filterChecks.js";

assert.equal(SCORE_DENOMINATOR_MODE, "fixed-slots");
assert.equal(SCORING_RULESET_VERSION, "v4.3");
assert.equal(INCOMPLETE_VERDICT_MODE, "incomplete");
assert.equal(SCORE_KEY_IGNORES_NAME_TYPOS, false);
assert.equal(F3_MRP_RANGE_TOLERANCE_INR, 0.5);
assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);
assert.deepEqual({ ...SCORE_CHECK_SLOTS }, { f1: 4, f2: 3, f3: 1, f4: 7 });

const clearedF1 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "Attribute 1 declared" },
    { status: "done", text: "Benchmark verified: X" },
    { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
    { status: "done", text: "Growth route recorded" },
  ],
};
const clearedF2 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "MRP ₹99 · 50g" },
    { status: "done", text: "Net margin 40% clears the division floor" },
    { status: "done", text: "Quick-commerce terms assumption recorded" },
    { status: "pending", text: "The margin computation hasn't been confirmed by Finance yet", formAdmin: true },
  ],
};
const clearedF3 = { checkLabel: "Cleared", items: [{ status: "done", text: "Filter 2 MRP sits within the safe range" }] };
const clearedF4 = {
  checkLabel: "Cleared",
  items: Array.from({ length: 7 }, (_, i) => ({ status: "done", text: `Dim ${i} Low` })),
};

function stageChecks({ f1 = false, f2 = false, f3 = false, f4 = false } = {}) {
  return {
    f1: f1 ? clearedF1 : checkF1({}),
    f2: f2 ? clearedF2 : { checkLabel: "Not yet run", items: [] },
    f3: f3 ? clearedF3 : checkF3({}, {}),
    f4: f4 ? clearedF4 : checkF4({}),
  };
}

// --- S1: same sealed score everywhere
{
  const checks = stageChecks({ f1: true, f2: true, f3: true, f4: true });
  const live = scoreAdvisoryChecks(checks);
  const doc = {
    name: "S1 idea",
    f1: { declaredAttribute: "a", benchmark: "b", declaredGap: 3, growthRoute: "penetration", growthArgument: "x" },
    f2: { cogsAtScale: 10, netMarginAtScale: 40, gstRatePct: 18, grammage: "50g", mrpInr: 99, qcomTrajectory: "up" },
    f3: { marginElasticity: { minMrpInr: 80, maxMrpInr: 120 } },
    f4: { techShiftRisk: { dimensions: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`d${i}`, { risk: "Low", reason: "ok" }])) } },
  };
  const key = scoreInputKey(doc);
  const sealed = {
    classification: "GO",
    score: { ...live, pct: 40, done: 6, total: 15, scoreInputKey: key },
    scoreInputKey: key,
    rulesetVersion: SCORING_RULESET_VERSION,
    screenedAt: "2026-01-01T00:00:00.000Z",
    at: "2026-01-01T00:00:00.000Z",
  };
  const shown = resolveOutputScore(checks, sealed.score, doc, key);
  assert.equal(shown.pct, 40, "S1: Log/open/PDF must show sealed 40%, not live");
  assert.notEqual(shown.pct, live.pct);
}

// --- S3: opening / annotate never changes stored pct
{
  const doc = { name: "S3", f2: { cogsAtScale: 1, netMarginAtScale: 50 } };
  const key = scoreInputKey(doc);
  const prev = {
    classification: "NO-GO",
    score: { pct: 36, done: 5, total: 15, scoreInputKey: key },
    scoreInputKey: key,
    rulesetVersion: SCORING_RULESET_VERSION,
    at: "2026-02-01T10:00:00.000Z",
  };
  const sealed = sealStoredGoNoGo(doc, prev);
  const annotated = annotateSealedGoNoGo(doc, sealed);
  assert.equal(annotated.score.pct, 36, "S3: annotate must not rewrite pct");
  assert.equal(annotated.classification, "NO-GO");
}

// --- C3: total always 15; percent only rises with evidence
{
  const s0 = scoreAdvisoryChecks(stageChecks({}));
  const s1 = scoreAdvisoryChecks(stageChecks({ f1: true }));
  const s2 = scoreAdvisoryChecks(stageChecks({ f1: true, f2: true }));
  const s3 = scoreAdvisoryChecks(stageChecks({ f1: true, f2: true, f3: true }));
  const s4 = scoreAdvisoryChecks(stageChecks({ f1: true, f2: true, f3: true, f4: true }));
  for (const s of [s0, s1, s2, s3, s4]) assert.equal(s.total, 15, "C3: total is always 15");
  assert.ok(s1.pct >= s0.pct, "C3: evidence never lowers percent");
  assert.ok(s2.pct >= s1.pct);
  assert.ok(s3.pct >= s2.pct);
  assert.ok(s4.pct >= s3.pct);
  assert.equal(s4.pct, 100);
  assert.equal(s4.done, 15);
}

// --- C5: blank benchmark is still an open F1 slot
{
  const withBlankBench = {
    f1: {
      checkLabel: "Evidence missing",
      items: [
        { status: "done", text: "Attribute 1 declared" },
        { status: "pending", text: "Benchmark not named", formAdmin: true },
        { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
        { status: "done", text: "Growth route recorded" },
      ],
    },
    f2: clearedF2,
    f3: clearedF3,
    f4: clearedF4,
  };
  const namedBench = {
    ...withBlankBench,
    f1: {
      checkLabel: "Evidence missing",
      items: [
        { status: "done", text: "Attribute 1 declared" },
        { status: "pending", text: "Benchmark named (X) but not verified" },
        { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
        { status: "done", text: "Growth route recorded" },
      ],
    },
  };
  const a = scoreAdvisoryChecks(withBlankBench);
  const b = scoreAdvisoryChecks(namedBench);
  assert.equal(a.total, 15);
  assert.equal(b.total, 15);
  assert.equal(a.pct, b.pct, "C5: naming an unverified benchmark must not lower the percent");
}

// --- C6: floor-failure NO-GO
{
  const below = {
    f1: clearedF1,
    f2: {
      checkLabel: "Below floor",
      items: [
        { status: "done", text: "MRP ok" },
        { status: "pending", text: "Net margin 10% is below the division floor" },
        { status: "done", text: "Qcom recorded" },
      ],
    },
    f3: clearedF3,
    f4: clearedF4,
  };
  assert.equal(goNoGoIsFloorFailure(below), true);
  assert.equal(computeGoNoGo(below), "NO-GO", "C6: floor failure is NO-GO");
}

// --- D5: unfinished research is INCOMPLETE (never NO-GO when floors pass)
{
  const f1f2Only = stageChecks({ f1: true, f2: true });
  assert.equal(goNoGoIsFloorFailure(f1f2Only), false);
  assert.equal(computeGoNoGo(f1f2Only), "INCOMPLETE", "F1+F2 only → INCOMPLETE");
  const noF4 = stageChecks({ f1: true, f2: true, f3: true });
  assert.equal(computeGoNoGo(noF4), "INCOMPLETE", "missing F4 → INCOMPLETE");
  assert.equal(scoreAdvisoryChecks(noF4).pct, 53);
}

// --- Floor failure with missing research still NO-GO
{
  const floorAndMissing = {
    f1: { checkLabel: "Below floor", items: [{ status: "pending", text: "gap below floor" }] },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  };
  assert.equal(computeGoNoGo(floorAndMissing), "NO-GO");
}

// --- scoreStatus: older-ruleset + edited-since-screening
{
  const doc = {
    name: "status",
    f2: { cogsAtScale: 10, netMarginAtScale: 40, grammage: "50g" },
  };
  const key = scoreInputKey(doc);
  const legacy = {
    classification: "WATCH",
    score: { pct: 67, done: 10, total: 15, scoreInputKey: key },
    scoreInputKey: key,
  };
  assert.equal(computeScoreStatus(doc, legacy), "older-ruleset");
  const current = stampScreenedGoNoGo(
    { classification: "WATCH", score: { pct: 67, done: 10, total: 15 }, scoreInputKey: key },
    doc
  );
  assert.equal(current.rulesetVersion, SCORING_RULESET_VERSION);
  assert.equal(computeScoreStatus(doc, current), "current");
  const editedDoc = { ...doc, f2: { ...doc.f2, netMarginAtScale: 55 } };
  assert.equal(computeScoreStatus(editedDoc, current), "edited-since-screening");
}

console.log("PASS owner testScoringRules — S1/S3/C3/C5/C6/D5 + fixed slots + scoreStatus v4.2");

