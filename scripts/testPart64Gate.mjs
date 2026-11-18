import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canProceedToProofUpload,
  hasGoClassification,
  hasManagerApproval,
  isFilterUnlocked,
  listMissingFormInputs,
  nextLockedHint,
} from "../lib/filterUnlock.js";
import { computeGoNoGo, classifyGoNoGoFromScore, goNoGoIsFloorFailure } from "../lib/goNoGo.js";

const f4Ready = {
  f1: {
    declaredAttribute: "softness",
    benchmark: "Parachute Advansed 200ml",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "category growing",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 22 },
  f3: { marginElasticity: { minMrpInr: 80, maxMrpInr: 120 } },
  f4: { techShiftRisk: { dimensions: { format: { risk: "Low" } } } },
};

for (const key of ["f1", "f2", "f3", "f4", "proof-gate"]) {
  assert.equal(isFilterUnlocked(key, f4Ready), true, `${key} stays editable`);
}
assert.equal(isFilterUnlocked("f5", f4Ready), false, "F5 stays locked until GO + proof");
assert.equal(isFilterUnlocked("f6", f4Ready), false, "F6 stays locked until GO + proof");
assert.match(
  String(nextLockedHint(f4Ready) || ""),
  /GO|manager|Filters 5/i,
  "hint points at Filters 5–6 gate"
);
assert.ok(listMissingFormInputs({}).length > 0, "empty doc lists missing inputs for the output");

assert.equal(canProceedToProofUpload({ goNoGo: { classification: "GO" } }), true);
assert.equal(canProceedToProofUpload({ goNoGo: { classification: "WATCH" } }), false);
assert.equal(canProceedToProofUpload({ goNoGo: { classification: "NO-GO" } }), false);
assert.equal(
  canProceedToProofUpload({
    goNoGo: { classification: "WATCH" },
    managerApproval: { comment: "Proceed — close the gap in market." },
  }),
  true,
  "manager-approved WATCH unlocks proof the same as GO"
);
assert.equal(
  canProceedToProofUpload({
    goNoGo: { classification: "NO-GO" },
    managerApproval: { comment: "override anyway" },
  }),
  false,
  "NO-GO cannot be manager-overridden even if a comment exists"
);

const goDoc = {
  ...f4Ready,
  goNoGo: { classification: "GO" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
};
assert.equal(hasGoClassification(goDoc), true);
assert.equal(isFilterUnlocked("f5", goDoc), true, "GO + proof unlocks F5");
assert.equal(isFilterUnlocked("f6", goDoc), true, "GO + proof unlocks F6");

const watchDoc = {
  ...f4Ready,
  goNoGo: { classification: "WATCH" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
};
const approvedWatch = {
  ...watchDoc,
  managerReview: { comment: "Approved after reviewing the WATCH gaps." },
};
assert.equal(hasManagerApproval(approvedWatch), true);
assert.equal(isFilterUnlocked("f5", approvedWatch), true, "manager-approved WATCH + proof unlocks F5");

assert.equal(classifyGoNoGoFromScore(81), "GO");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(59), "NO-GO");
// Part 138 D49 — F4 overall High is the only hard stop left among the floors.
assert.equal(computeGoNoGo({ f4: { checkLabel: "Below floor", items: [] } }), "NO-GO");
// Part 134 revised — Filter 2 never hard-stops on "Below floor" (margin is a mark-down).
assert.equal(goNoGoIsFloorFailure({ f2: { checkLabel: "Below floor" } }), false);
assert.equal(goNoGoIsFloorFailure({ f2: { checkLabel: "Marked down" } }), false);
assert.equal(goNoGoIsFloorFailure({ f1: { checkLabel: "Marked down" } }), false);
assert.equal(goNoGoIsFloorFailure({ f1: { checkLabel: "Below floor" } }), false, "F1 gap is a mark-down, not a hard stop");
assert.equal(goNoGoIsFloorFailure({ f4: { checkLabel: "Below floor" } }), true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /runGoNoGoRead/);
assert.match(formSrc, /Submit for verdict/);
assert.match(formSrc, /listMissingFormInputs/);
assert.match(formSrc, /Values you have not entered yet|Still to enter before a full score/);
assert.doesNotMatch(formSrc, /FilterTeaserCard/); // Part 145 D108
assert.doesNotMatch(formSrc, /Opens once the idea reads GO and proof is uploaded/);

console.log("PASS Part 64 proof-upload gate + F5/F6-only lock");
