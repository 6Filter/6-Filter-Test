/**
 * Improvement / path-to-GO copy must cite this idea's inputs and findings — not generic blanks.
 * Part 133: growth route/argument wait on AI checks; category size no longer scores F1.
 */
import assert from "node:assert/strict";
import { checkF1, checkF4 } from "../lib/filterChecks.js";
import {
  closestPathToGo,
  computeImprovementPointValues,
  emptyImprovementReason,
} from "../lib/improvementPoints.js";
import { fallbackFilterNarrative } from "../lib/filterNarrativeText.js";

const f1 = checkF1(
  {
    declaredAttribute: "softness",
    benchmark: "Parachute Advansed",
    declaredGap: 3,
    gapDerivation: "Beat on softness",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "households growing in hair oils",
    evidenceSourceDate: "https://example.com/study",
  },
  {
    benchmarkCheck: { status: "relevant", source_url: "https://example.com/parachute" },
  },
  {
    evidenceRead: {
      status: "ok",
      relevant: true,
      facts: [{ topic: "attribute", verified: true, quote: "softness" }],
    },
  }
);
const route = f1.items.find((it) => it.slot === "route");
assert.ok(route);
assert.equal(route.status, "pending");
assert.match(route.text, /awaiting AI check/i);

const f4 = checkF4({
  techShiftRisk: {
    dimensions: {
      userHabitShiftPotential: {
        risk: "High",
        reason: "leave-in serums displacing oil occasions among urban under-30",
      },
    },
  },
});
const habit = f4.items.find((it) => /habit/i.test(it.text));
assert.ok(habit);
assert.equal(habit.status, "pending");
assert.match(habit.text, /leave-in serums/);
assert.match(habit.text, /mitigation response/i);
assert.match(habit.text, /User habit|habit shift/i);

const blank = {
  f1: { checkLabel: "Not yet run", items: [] },
  f2: { checkLabel: "Not yet run", items: [] },
  f3: { checkLabel: "Not yet run", items: [] },
  f4: { checkLabel: "Not yet run", items: [] },
};
const reason = emptyImprovementReason(blank, []);
assert.match(reason, /not been scored yet|No scored Filter 1–4/i);
assert.doesNotMatch(reason, /nothing outstanding/i);
const path = closestPathToGo(blank, []);
assert.ok(path.items.length >= 1, "unrun filters appear on the path");
assert.ok(path.items.some((it) => /Filter 4 research/i.test(it.text)));
assert.notEqual(path.projectedPct, path.currentPct);

const narrative = fallbackFilterNarrative({
  checkLabel: "Evidence missing",
  items: [],
});
assert.match(narrative, /no scored evidence|inputs and Submit/i);
assert.doesNotMatch(narrative, /^Evidence on this filter is still incomplete\.$/);

const ranked = computeImprovementPointValues({
  f1: {
    items: [
      {
        status: "pending",
        text: 'Growth route mismatch — AI expects "new-market"',
        slot: "route",
        code: "F1_ROUTE_MISMATCH",
      },
    ],
  },
  f2: {
    checkLabel: "Below floor",
    items: [{ status: "pending", text: "Net margin 5% is below the 18% floor" }],
  },
  f3: { checkLabel: "Not yet run", items: [] },
  f4: { checkLabel: "Not yet run", items: [] },
});
assert.ok(ranked.length >= 1);
assert.ok(ranked.some((r) => /route|margin|Filter/i.test(r.text || r.instruction || "")));

console.log("PASS grounded improvement feedback");
