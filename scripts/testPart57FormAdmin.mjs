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
assert.equal(emptyF2.items.at(-1).text, unsigned);
assert.equal(isFormAdminCheck(emptyF2.items.at(-1)), true);
assert.equal(analysisCheckItems(emptyF2.items).length, 0);
assert.equal(filterCheckScore(emptyF2).total, 0);
assert.equal(filterCheckScore(emptyF2).pct, 0);

const signedSame = previewAdvisoryChecks({
  f2: {
    mrpInr: 120,
    grammage: "100 ml",
    netMarginAtScale: 55,
    qcomTrajectory: "3-year terms held",
    financeSigned: true,
  },
}).f2;
const unsignedSame = previewAdvisoryChecks({
  f2: {
    mrpInr: 120,
    grammage: "100 ml",
    netMarginAtScale: 55,
    qcomTrajectory: "3-year terms held",
    financeSigned: false,
  },
}).f2;
assert.equal(filterCheckScore(signedSame).pct, filterCheckScore(unsignedSame).pct);
assert.equal(filterCheckScore(unsignedSame).pct, 100);
assert.ok(unsignedSame.items.some((it) => it.text === unsigned && it.formAdmin));

const belowAndUnsigned = {
  checkLabel: "Below floor",
  items: [
    {
      status: "pending",
      text: "Net margin 40% is below the 50% floor (v4, non-negotiable)",
    },
    { status: "pending", text: unsigned, formAdmin: true },
    { status: "pending", text: "MRP and grammage not yet declared", formAdmin: true },
  ],
};
const holding = analysisCheckItems(belowAndUnsigned.items).filter((i) => i.status === "pending");
assert.equal(holding.length, 1);
assert.match(holding[0].text, /below the 50% floor/);
assert.doesNotMatch(holding[0].text, /Finance/);

const narrative = fallbackFilterNarrative(belowAndUnsigned);
assert.match(narrative, /below the 50% floor/);
assert.doesNotMatch(narrative, /Finance/);
assert.doesNotMatch(narrative, /not yet declared/);

const rationale = buildGateRationale({
  classification: "NO-GO",
  score: { pct: 40 },
  checks: { f2: belowAndUnsigned },
  ideaName: "Cooling herbal hair oil",
});
assert.match(rationale, /below the 50% floor/);
assert.doesNotMatch(rationale, /Finance/);
assert.doesNotMatch(rationale, /not yet declared/);

const f1Blank = checkF1({});
assert.ok(f1Blank.items.every((it) => isFormAdminCheck(it)));
assert.equal(filterCheckScore(f1Blank).total, 0);
assert.doesNotMatch(fallbackFilterNarrative(f1Blank), /not yet declared|Benchmark not named|Declared gap missing/i);

const f3Blank = checkF3({}, {});
assert.equal(f3Blank.checkLabel, "Evidence missing");
assert.doesNotMatch(fallbackFilterNarrative(f3Blank), /not yet computed/i);

const mixedScore = scoreAdvisoryChecks({
  f1: { items: [{ status: "done", text: "Benchmark named: Indulekha" }] },
  f2: unsignedSame,
  f3: belowAndUnsigned,
  f4: { items: [] },
});
assert.ok(mixedScore.byFilter.f2.pct === 100);
assert.ok(mixedScore.byFilter.f3.pct === 0);
assert.doesNotMatch(JSON.stringify(analysisCheckItems(unsignedSame.items)), /Finance/);

console.log("PASS Part 57 form-admin gaps stay out of score, holding-back, and analysis");
