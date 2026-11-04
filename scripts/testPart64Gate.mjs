import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canProceedToProofUpload,
  hasGoClassification,
  hasManagerApproval,
  isFilterUnlocked,
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

assert.equal(isFilterUnlocked("proof-gate", f4Ready), true, "F4 complete still opens the analysis/proof gate");
assert.equal(isFilterUnlocked("f5", f4Ready), false, "F5 stays locked until GO (or approved WATCH) plus proof");
assert.equal(isFilterUnlocked("f6", f4Ready), false);

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
assert.equal(isFilterUnlocked("f6", goDoc), true);

const watchDoc = {
  ...f4Ready,
  goNoGo: { classification: "WATCH" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
};
assert.equal(isFilterUnlocked("f5", watchDoc), false, "WATCH + proof without approval does not open F5");

const approvedWatch = {
  ...watchDoc,
  managerReview: { comment: "Approved after reviewing the WATCH gaps." },
};
assert.equal(hasManagerApproval(approvedWatch), true);
assert.equal(isFilterUnlocked("f5", approvedWatch), true, "approved WATCH + proof unlocks F5");
assert.equal(isFilterUnlocked("f6", approvedWatch), true);

assert.equal(classifyGoNoGoFromScore(81), "GO");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(59), "NO-GO");
assert.equal(computeGoNoGo({ f1: { checkLabel: "Below floor", items: [] } }), "NO-GO");
assert.equal(goNoGoIsFloorFailure({ f2: { checkLabel: "Below floor" } }), true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /runGoNoGoRead/);
assert.match(formSrc, /Submit for verdict/);
assert.match(formSrc, /canProceedToProofUpload/);

console.log("PASS Part 64 F4→F5 analysis gate + GO/WATCH/NO-GO unlock");
