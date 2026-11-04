/**
 * Improvement / path-to-GO copy must cite this idea's inputs and findings — not generic blanks.
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
    growthRoute: "penetration",
    growthArgument: "households growing in hair oils",
  },
  {
    benchmarkVerified: true,
    benchmarkEvidence: "Marico listing active in India",
    categorySizeFound: false,
    categorySizeEvidence: "no triangulated category size for Hair oils",
    attributeValidation: [{ stated: "softness", status: "aligned" }],
  }
);
const growth = f1.items.find((it) => /Growth route/i.test(it.text));
assert.ok(growth);
assert.equal(growth.status, "pending");
assert.match(growth.text, /penetration/);
assert.match(growth.text, /no triangulated category size/i);
assert.doesNotMatch(growth.text, /^Growth argument entered, but category size could not be substantiated by research$/);

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
// Part 130 — unrun filters are explicit path actions (never a silent empty path).
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
    items: [{ status: "pending", text: "Growth route \"penetration\" is entered, but category size was not substantiated — thin" }],
  },
  f2: {
    checkLabel: "Below floor",
    items: [
      {
        status: "pending",
        text: "Net margin 40% is below the 50% Personal Care floor (v4, non-negotiable). Raise net margin at scale above 50%, or revise COGS/MRP so the path clears that floor.",
      },
    ],
  },
  f3: { items: [] },
  f4: {
    items: [
      {
        status: "pending",
        text: "User habit shift potential: High risk — leave-in serums. Clear via a Filter 4 mitigation response on \"User habit shift potential\" naming contracts, lab proof, or a dated certification path",
      },
    ],
  },
});
assert.equal(ranked[0].filter, "F2", "floor failures lead the next-steps list");
assert.match(ranked[0].text, /needs at least 50%|Personal Care|Raise net margin|non-negotiable/i);

console.log("PASS grounded improvement feedback cites inputs and findings");
