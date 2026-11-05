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

for (const key of ["f1", "f2", "f3", "f4", "f5", "f6", "proof-gate", "send-manager"]) {
  assert.equal(isFilterUnlocked(key, f4Ready), true, `${key} stays editable (progressive unlock retired)`);
}
assert.equal(nextLockedHint(f4Ready), null);
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

assert.equal(classifyGoNoGoFromScore(81), "GO");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(59), "NO-GO");
assert.equal(computeGoNoGo({ f1: { checkLabel: "Below floor", items: [] } }), "NO-GO");
// Part 134 revised — Filter 2 never hard-stops on "Below floor" (margin is a mark-down).
assert.equal(goNoGoIsFloorFailure({ f2: { checkLabel: "Below floor" } }), false);
assert.equal(goNoGoIsFloorFailure({ f2: { checkLabel: "Marked down" } }), false);
assert.equal(goNoGoIsFloorFailure({ f1: { checkLabel: "Below floor" } }), true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /runGoNoGoRead/);
assert.match(formSrc, /Submit for verdict/);
assert.match(formSrc, /canProceedToProofUpload/);

console.log("PASS Part 64 proof-upload gate + retired progressive filter unlock");
