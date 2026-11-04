import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1, checkF3, checkF4, checkF6, hasAnyRealInput } from "../lib/filterChecks.js";
import { previewAdvisoryChecks } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { ideaSizeForResult } from "../lib/ideaScale.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";

const blank = emptyPropositionDoc("blank-part75");
assert.equal(hasAnyRealInput(blank.f1), false);
assert.equal(hasAnyRealInput(blank.f2), false);
assert.equal(hasAnyRealInput(blank.f3), false);
assert.equal(hasAnyRealInput(blank.f4), false);
assert.equal(hasAnyRealInput(blank.f5), false);
assert.equal(hasAnyRealInput(blank.f6), false);

assert.equal(checkF1(blank.f1).checkLabel, "Not yet run");
assert.equal(checkF3(blank.f2, blank.f3).checkLabel, "Not yet run");
assert.equal(checkF4(blank.f4).checkLabel, "Not yet run");
assert.equal(checkF6(blank.f6, false).checkLabel, "Not yet run");
assert.equal(checkF6(blank.f6, true).checkLabel, "Not yet run");

const preview = previewAdvisoryChecks(blank);
for (const key of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
  assert.equal(preview[key].checkLabel, "Not yet run", `${key} preview on a blank doc must be Not yet run`);
  assert.notEqual(preview[key].checkLabel, "Cleared");
}

const scored = await computeAllAdvisoryChecks(blank);
for (const key of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
  assert.equal(scored[key].checkLabel, "Not yet run", `${key} server score on a blank doc must be Not yet run`);
  assert.notEqual(scored[key].checkLabel, "Cleared");
}

const onlyF1 = previewAdvisoryChecks({
  ...blank,
  f1: { declaredAttribute: "24-hour odour control" },
});
assert.notEqual(onlyF1.f1.checkLabel, "Not yet run");
assert.equal(onlyF1.f2.checkLabel, "Not yet run");
assert.equal(onlyF1.f3.checkLabel, "Not yet run");
assert.equal(onlyF1.f4.checkLabel, "Not yet run");
assert.equal(onlyF1.f5.checkLabel, "Not yet run");
assert.equal(onlyF1.f6.checkLabel, "Not yet run");

const onlyF2 = previewAdvisoryChecks({
  ...blank,
  f2: { cogsAtScale: 42, netMarginAtScale: 52 },
});
assert.equal(onlyF2.f1.checkLabel, "Not yet run");
assert.notEqual(onlyF2.f2.checkLabel, "Not yet run");
assert.equal(onlyF2.f3.checkLabel, "Not yet run");

const gstOnly = previewAdvisoryChecks({
  ...blank,
  f2: { gstRatePct: 18, gstBasis: "HSN 3307" },
});
assert.equal(gstOnly.f2.checkLabel, "Not yet run", "auto GST must not count as F2 having been run");

const watchEstimate = ideaSizeForResult({
  goNoGo: { classification: "WATCH" },
  f5: {
    householdsReachedY3Mn: 3.2,
    trialRatePct: 45,
    repeatConversionPct: 30,
    purchaseFrequencyYr: 5,
    avgPackValueInr: 120,
  },
});
assert.ok(watchEstimate);
assert.equal(watchEstimate.provisional, true);

const confirmed = ideaSizeForResult({
  goNoGo: { classification: "GO" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
  f5: {
    householdsReachedY3Mn: 3.2,
    trialRatePct: 45,
    repeatConversionPct: 30,
    purchaseFrequencyYr: 5,
    avgPackValueInr: 120,
    confirmedByHuman: true,
  },
});
assert.equal(confirmed.provisional, false);

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /hasAnyRealInput/);
assert.match(form, /provisional-tag/);
assert.match(form, /estimated, pre-GO/);
assert.match(form, /confirmedByHuman/);
assert.match(form, /livePreviewChecks\[spec\.key\]/);
assert.match(form, /Check: \{checkLabel\}/);

const checksSrc = readFileSync(new URL("../lib/filterChecks.js", import.meta.url), "utf8");
assert.match(checksSrc, /export function hasAnyRealInput/);
assert.match(checksSrc, /export function checkFilter/);
assert.match(checksSrc, /checkF1Six|return checkF1Six/);
assert.match(checksSrc, /return checkFilter\(f3/);
assert.match(checksSrc, /return checkFilter\(f4/);
assert.match(checksSrc, /return checkFilter\(f6/);

const scoringSrc = readFileSync(new URL("../lib/propositionScoring.js", import.meta.url), "utf8");
assert.match(scoringSrc, /return checkFilter\(f2/);
assert.match(scoringSrc, /return checkFilter\(f5/);

console.log("PASS Part 75 shared not-yet-run gate, estimated gram badge");
