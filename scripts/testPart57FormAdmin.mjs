import assert from "node:assert/strict";
import { checkF1, checkF3, isFormAdminCheck, analysisCheckItems } from "../lib/filterChecks.js";
import {
  buildGateRationale,
  financeSignatureCopy,
  filterCheckScore,
  previewAdvisoryChecks,
  scoreAdvisoryChecks,
} from "../lib/goNoGo.js";
import { fallbackFilterNarrative } from "../lib/filterNarrativeText.js";

const unsigned = financeSignatureCopy(false);

const emptyF2 = previewAdvisoryChecks({ f2: { financeSigned: false } }).f2;
assert.equal(emptyF2.checkLabel, "Not yet run");
assert.deepEqual(emptyF2.items, []);
assert.equal(filterCheckScore(emptyF2).total, 0);
assert.equal(filterCheckScore(emptyF2).pct, 0);

const startedF2 = previewAdvisoryChecks({ f2: { financeSigned: false, netMarginAtScale: 40 } }).f2;
assert.equal(startedF2.items.at(-1).text, unsigned);
assert.equal(isFormAdminCheck(startedF2.items.at(-1)), true);
assert.notEqual(startedF2.checkLabel, "Not yet run");

const signedSame = previewAdvisoryChecks({
  division: "Personal Care",
  f2: {
    mrpInr: 120,
    grammage: "100 ml",
    netMarginAtScale: 55,
    gstRatePct: 18,
    qcomTrajectory: "3-year terms held",
    financeSigned: true,
  },
}).f2;
const unsignedSame = previewAdvisoryChecks({
  division: "Personal Care",
  f2: {
    mrpInr: 120,
    grammage: "100 ml",
    netMarginAtScale: 55,
    gstRatePct: 18,
    qcomTrajectory: "3-year terms held",
    financeSigned: false,
  },
}).f2;
assert.equal(filterCheckScore(signedSame).pct, filterCheckScore(unsignedSame).pct);
// Part 138 — F2 scores margin, pack size and GST → 100% when all three clear (Finance sign-off never scores).
assert.equal(filterCheckScore(unsignedSame).pct, 100);
// GST is person-entered: with no GST the F2 slot stays open (2 of 3).
const noGst = previewAdvisoryChecks({
  division: "Personal Care",
  f2: { mrpInr: 120, grammage: "100 ml", netMarginAtScale: 55, financeSigned: false },
}).f2;
assert.equal(filterCheckScore(noGst).pct, 67);
assert.ok(unsignedSame.items.some((it) => it.slot === "margin" && it.credit === 1));
assert.ok(unsignedSame.items.some((it) => it.text === unsigned && it.formAdmin));

const belowAndUnsigned = {
  checkLabel: "Marked down",
  markedDown: true,
  items: [
    {
      status: "pending",
      text: "Net margin 40% is below the 50% minimum for Personal Care",
      code: "F2_MARGIN_BELOW_MINIMUM",
      credit: 0,
    },
    { status: "pending", text: unsigned, formAdmin: true },
    { status: "pending", text: "MRP and grammage not yet declared", formAdmin: true },
  ],
};
const holding = analysisCheckItems(belowAndUnsigned.items).filter((i) => i.status === "pending");
assert.equal(holding.length, 1);
assert.match(holding[0].text, /below the 50% minimum/);
assert.doesNotMatch(holding[0].text, /Finance/);

const narrative = fallbackFilterNarrative(belowAndUnsigned);
assert.match(narrative, /below the 50% minimum|Marked down/i);
assert.doesNotMatch(narrative, /Finance/);
assert.doesNotMatch(narrative, /not yet declared/);

const rationale = buildGateRationale({
  classification: "WATCH",
  score: { pct: 40 },
  checks: { f2: belowAndUnsigned },
  ideaName: "Cooling herbal hair oil",
});
assert.match(rationale, /below the 50% minimum|raise the net margin/i);
assert.doesNotMatch(rationale, /Finance/);
assert.doesNotMatch(rationale, /not yet declared/);

const f1Blank = checkF1({});
assert.equal(f1Blank.checkLabel, "Not yet run");
assert.equal(f1Blank.items.length, 0);
assert.equal(filterCheckScore(f1Blank).total, 0);

const f3Blank = checkF3({}, {});
assert.equal(f3Blank.checkLabel, "Not yet run");
assert.doesNotMatch(fallbackFilterNarrative(f3Blank), /not yet computed/i);

const mixedScore = scoreAdvisoryChecks({
  f1: { items: [{ status: "done", text: "Benchmark named: Indulekha" }] },
  f2: unsignedSame,
  f3: belowAndUnsigned,
  f4: { items: [] },
});
assert.ok(mixedScore.byFilter.f2.pct === 100, `f2 margin-only score, got ${mixedScore.byFilter.f2.pct}`);
assert.ok(mixedScore.byFilter.f3.pct === 0);
assert.doesNotMatch(JSON.stringify(analysisCheckItems(unsignedSame.items)), /Finance/);

console.log("PASS Part 57 form-admin gaps stay out of score, holding-back, and analysis");
