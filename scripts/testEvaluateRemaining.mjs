/**
 * Evaluate must run GST / shelf-price research even if the ledger says complete.
 */
import assert from "node:assert/strict";
import { remainingEvaluateResearch } from "../lib/evaluateRemaining.js";

const f4 = {
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: { risk: "Low", reason: "ok" },
      consumptionContextStability: { risk: "Low", reason: "ok" },
      manufacturingDisruptionRisk: { risk: "Low", reason: "ok" },
      userHabitShiftPotential: { risk: "Low", reason: "ok" },
      adjacentSubstitutionThreat: { risk: "Low", reason: "ok" },
      regulatoryOrStandardsShift: { risk: "Low", reason: "ok" },
      channelOrFormatDisplacement: { risk: "Low", reason: "ok" },
    },
    overallRisk: "Low",
  },
};

const researchFindings = {
  stepsExpected: ["F1", "f1Benchmark", "f1Claims", "f1Plan", "F4"],
  stepsDone: ["F1", "f1Benchmark", "f1Claims", "f1Plan", "F4"],
  stepsFailed: [],
  f1: {
    assessments: {
      benchmark: { status: "ok" },
      derivation: { status: "ok" },
      argument: { status: "ok" },
      attributes: { status: "ok" },
      route: { status: "ok" },
    },
    benchmarkCheck: { ok: true },
    claimChecks: { ok: true },
    routeCheck: { ok: true },
  },
  f4: { techShiftFound: true, overallRisk: "Low" },
};

const needsGstEstimate = {
  f1: {
    benchmark: "Dove Hair Fall Rescue",
    declaredGap: 3,
    gapDerivation: "CMI gap",
    growthArgument: "households growing",
    declaredAttribute: "reduces hair fall",
    growthRoute: "penetration",
  },
  f2: { grammage: "50ml" },
  f4,
  researchRunAt: "2026-11-23T09:00:00.000Z",
  researchFindings,
};

const needsCliffResearch = {
  ...needsGstEstimate,
  f2: {
    grammage: "50ml",
    cogsAtScale: 80,
    gstRatePct: 18,
    netMarginAtScale: 25,
    mrpInr: 299,
  },
};

const completeLedger = { researchState: "complete", internalSteps: [] };

const skipped = remainingEvaluateResearch(needsCliffResearch, {
  confirmMissingSteps: false,
  plan: completeLedger,
});
assert.equal(skipped.force, false);

const gstPass = remainingEvaluateResearch(needsGstEstimate, {
  confirmMissingSteps: true,
  plan: completeLedger,
});
assert.equal(gstPass.force, true);
assert.ok(gstPass.onlySteps.includes("cost"), `expected cost, got ${gstPass.onlySteps.join(",")}`);

const evaluate = remainingEvaluateResearch(needsCliffResearch, {
  confirmMissingSteps: true,
  plan: completeLedger,
});
assert.equal(evaluate.force, true);
assert.ok(evaluate.onlySteps.includes("margin"), `expected margin, got ${evaluate.onlySteps.join(",")}`);
assert.ok(evaluate.missingLabels.length >= 1);

const apiSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8")
);
assert.match(apiSrc, /remainingEvaluateResearch/);
assert.match(apiSrc, /confirmMissingSteps/);

const formSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8")
);
assert.match(formSrc, /Still unfinished:/);

console.log("PASS testEvaluateRemaining");
