/**
 * Part 130 — buildPathToGo must tell the truth. Do not weaken.
 */
import assert from "node:assert/strict";
import {
  buildPathToGo,
  gainPctForSlots,
  computeImprovementPointValues,
} from "../../lib/improvementPoints.js";
import { SCORE_CHECK_SLOTS_TOTAL } from "../../lib/lockedConstants.js";

assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);
assert.equal(gainPctForSlots(1), 7);
assert.equal(gainPctForSlots(7), 47);

const f1Clear = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "Attribute 1 declared" },
    { status: "done", text: "Benchmark verified: X" },
    { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
    { status: "done", text: "Growth route recorded" },
  ],
};
const f2Clear = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "MRP ₹99 · 50g" },
    { status: "done", text: "Net margin 55% clears the division floor" },
    { status: "done", text: "Quick-commerce terms assumption recorded" },
  ],
};
const f3Clear = { checkLabel: "Cleared", items: [{ status: "done", text: "Filter 2 MRP sits within the safe range" }] };
const f4Clear = {
  checkLabel: "Cleared",
  items: Array.from({ length: 7 }, (_, i) => ({ status: "done", text: `Dim ${i} Low` })),
};
const empty = { checkLabel: "Not yet run", items: [] };

// Case A — older release never mixes sealed % with live path
{
  const path = buildPathToGo({
    advisoryChecks: { f1: f1Clear, f2: empty, f3: empty, f4: empty },
    sealedScore: { pct: 67, done: 10, total: 15 },
    scoreStatus: "older-ruleset",
  });
  assert.equal(path.kind, "recompute");
  assert.match(path.message, /Recompute to see the path to GO/i);
  assert.equal(path.actions.length, 0);
  assert.equal(path.toGo.pct, path.currentPct);
}

// Case B — floor failure is blockers even when sealed % > 80
{
  const path = buildPathToGo({
    advisoryChecks: {
      f1: f1Clear,
      f2: {
        checkLabel: "Below floor",
        items: [
          { status: "done", text: "MRP ok" },
          { status: "pending", text: "Net margin 35% is below the 50% floor (Personal Care)" },
          { status: "done", text: "Qcom recorded" },
        ],
      },
      f3: f3Clear,
      f4: f4Clear,
    },
    sealedScore: { pct: 93, done: 14, total: 15 },
    scoreStatus: "current",
  });
  assert.equal(path.kind, "blockers");
  assert.match(path.message, /verdict stays NO-GO/i);
  assert.ok(path.blockers.length >= 1);
  assert.match(path.blockers[0].text, /Net margin 35%.*50%/i);
  assert.doesNotMatch(path.message || "", /already above 80/i);
  assert.notEqual(path.kind, "go");
}

// Case C — fixed-slot gains
{
  const items = computeImprovementPointValues({
    f1: {
      checkLabel: "Evidence missing",
      items: [
        { status: "done", text: "Attribute 1 declared" },
        { status: "pending", text: "Benchmark not verified" },
        { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
        { status: "done", text: "Growth route recorded" },
      ],
    },
    f2: f2Clear,
    f3: f3Clear,
    f4: f4Clear,
  });
  assert.ok(items.length >= 1);
  assert.equal(items[0].pointValue, 7);
  assert.equal(items[0].gainPct, 7);
}

// Unrun Filter 4 appears as one action with +47%
{
  const path = buildPathToGo({
    advisoryChecks: { f1: f1Clear, f2: f2Clear, f3: f3Clear, f4: empty },
    sealedScore: { pct: 53, done: 8, total: 15 },
    scoreStatus: "current",
  });
  assert.equal(path.kind, "path");
  assert.notEqual(path.currentPct, path.toGo.pct);
  assert.ok(path.actions.some((a) => /Run Filter 4 research/i.test(a.text) && a.gainPct === 47));
  assert.match(path.headline, /→/);
  assert.doesNotMatch(path.headline, /(\d+)% → \1%/);
}

// GO kind
{
  const path = buildPathToGo({
    advisoryChecks: { f1: f1Clear, f2: f2Clear, f3: f3Clear, f4: f4Clear },
    sealedScore: { pct: 100, done: 15, total: 15 },
    scoreStatus: "current",
  });
  assert.equal(path.kind, "go");
  assert.match(path.message, /GO, above 80/);
}

// Edited-since-screening
{
  const path = buildPathToGo({
    advisoryChecks: { f1: f1Clear, f2: f2Clear, f3: f3Clear, f4: f4Clear },
    sealedScore: { pct: 80, done: 12, total: 15 },
    scoreStatus: "edited-since-screening",
  });
  assert.equal(path.kind, "recompute");
}

console.log("PASS testPathToGo");
