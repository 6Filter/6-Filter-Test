/**
 * Failed research must finish as empty so Evaluate can seal a band from entered values.
 */
import assert from "node:assert/strict";
import { evaluationStatus } from "../lib/evaluationStatus.js";
import { canSealOutput } from "../lib/sealOutput.js";
import { bandFromIncompleteGoNoGo, finishResearchForSeal } from "../lib/finishResearchForSeal.js";
import { classifyGoNoGoFromBands } from "../lib/lockedConstants.js";

const incomplete = {
  f1: {
    benchmark: "Brand X Serum 100ml",
    declaredGap: 3,
    gapDerivation: "lab gap",
    growthArgument: "households growing",
    parityExceptions: "fragrance",
    declaredAttribute: "softness",
    growthRoute: "penetration",
  },
  f2: { grammage: "100g", cogsAtScale: 40, gstRatePct: 18, netMarginAtScale: 25 },
  f4: {
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Low" },
        consumptionContextStability: { risk: "Low" },
        manufacturingDisruptionRisk: { risk: "Low" },
        userHabitShiftPotential: { risk: "Low" },
        adjacentSubstitutionThreat: { risk: "Low" },
        purchaseFrequencyShift: { risk: "Low" },
        regulatoryDisruptionRisk: { risk: "Low" },
      },
      overallRisk: "Low",
    },
  },
  researchRunAt: "2026-11-23T12:00:00.000Z",
  researchFindings: {
    stepsExpected: ["F1", "f1Benchmark", "f1Claims", "f1Plan", "F2", "F3", "F4"],
    stepsDone: ["F1", "F4"],
    stepsFailed: ["F2", "f1Claims"],
    f1: {
      assessments: {
        benchmark: { status: "ok", searchUsed: true, raw: { relevance: "adequate" } },
        derivation: { status: "failed", error: "The AI's answer could not be read" },
        parity: { status: "failed", error: "The AI's answer could not be read" },
        argument: { status: "failed", error: "The AI's answer could not be read" },
        attributes: { status: "ok", searchUsed: true, raw: { relevance: "adequate" } },
        route: { status: "ok", searchUsed: true, raw: { matches: "yes" } },
      },
      benchmarkCheck: { status: "ok" },
      routeCheck: { matches: "yes" },
    },
    f2: { costEstimate: { status: "failed", error: "timeout" }, researchFailed: true },
    f3: {},
    f4: { techShiftFound: true, overallRisk: "Low" },
  },
};

assert.notEqual(evaluationStatus(incomplete).state, "evaluated");
assert.equal(canSealOutput(incomplete), false);

const { doc, changed, finishedSteps } = finishResearchForSeal(incomplete);
assert.equal(changed, true);
assert.ok(finishedSteps.includes("cogsGst") || finishedSteps.includes("claims") || finishedSteps.length >= 1);
assert.equal(evaluationStatus(doc).state, "evaluated", `state=${evaluationStatus(doc).state} missing=${JSON.stringify(evaluationStatus(doc).missing)}`);
assert.equal(canSealOutput(doc), true);

const banded = bandFromIncompleteGoNoGo(
  { classification: "INCOMPLETE", score: { pct: 67, total: 18, points: 12 }, rationale: "x" },
  classifyGoNoGoFromBands,
  { ideaScale: { tier: "100g", label: "₹1–12 Cr" } }
);
assert.equal(banded.classification, "WATCH");
assert.equal(banded.ideaScale.tier, "100g");
assert.equal(banded.incompleteResearch, true);

const apiSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8")
);
assert.match(apiSrc, /finishResearchForSeal/);
assert.match(apiSrc, /bandFromIncompleteGoNoGo/);

const formSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8")
);
assert.match(formSrc, /forceResearch: true/);
assert.match(formSrc, /The verdict and score below use the values entered/);

console.log("PASS testFinishResearchForSeal");
