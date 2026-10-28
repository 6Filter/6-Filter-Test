/**
 * Part 106: expected steps, confirm-before-spend, legacy state, and the empty-filter save.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextFilterJson } from "../lib/db.js";
import { flattenProposition } from "../lib/logExport.js";
import { applyLogStatusFilter } from "../lib/logStatus.js";
import {
  expectedResearchSteps,
  handEntered,
  planResearch,
  researchPassFinished,
  shouldRunStep,
  submitWithRunners,
  uiResearchState,
} from "../lib/researchProgress.js";
import { loadRestoredRows } from "./planResubmit.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sized = {
  householdsReachedY3Mn: 1,
  trialRatePct: 1,
  repeatConversionPct: 1,
  purchaseFrequencyYr: 1,
  avgPackValueInr: 1,
};

const hand = {
  f1: { declaredAttribute: "strength", benchmark: "Brand", declaredGap: 3 },
  f2: { cogsAtScale: 40, netMarginAtScale: 20 },
  f5: sized,
};
assert.equal(handEntered(hand, "F1"), false, "typed F1 fields are inputs — research must still verify the benchmark");
assert.equal(expectedResearchSteps(hand).includes("F1"), true);
assert.equal(shouldRunStep(hand, "f1"), true);
assert.equal(handEntered(hand, "F2"), true);
assert.equal(expectedResearchSteps(hand).includes("F2"), false);
const priced = planResearch({ ...hand, researchRunAt: "2026-10-01T00:00:00.000Z", f3: {}, f4: {} });
assert.equal(priced.steps.includes("F2"), false);

const gapBlank = { f1: {}, f2: hand.f2, f5: sized };
assert.equal(expectedResearchSteps(gapBlank).includes("noCompetitor"), true);
const gapSet = { f1: { declaredGap: 3, benchmark: "Brand", declaredAttribute: "strength" }, f2: hand.f2, f5: sized };
assert.equal(expectedResearchSteps(gapSet).includes("noCompetitor"), false);
const verified = {
  f1: { declaredGap: "", benchmark: "Brand" },
  f2: hand.f2,
  f5: sized,
  researchFindings: { f1: { benchmarkVerified: true } },
};
assert.equal(expectedResearchSteps(verified).includes("noCompetitor"), false);

assert.equal(shouldRunStep(hand, "cost", { forceFresh: true }), false);

const kept = nextFilterJson(undefined, JSON.stringify({ cogsAtScale: 40, netMarginAtScale: 20 }));
assert.match(kept, /cogsAtScale/);
assert.equal(JSON.parse(kept).netMarginAtScale, 20);

const half = {
  researchRunAt: null,
  f1: hand.f1,
  f2: hand.f2,
  f3: {},
  f4: {},
  f5: sized,
  researchFindings: {
    stepsExpected: ["F3", "F4"],
    stepsDone: [],
    stepsFailed: [],
    f3: { marginElasticityFound: false },
    f4: { techShiftFound: false },
  },
};
assert.equal(researchPassFinished(half.researchFindings), false);
assert.equal(planResearch(half).researchState, "incomplete");
const declined = await submitWithRunners(half, {
  F3: async () => { throw new Error("must not call"); },
  F4: async () => { throw new Error("must not call"); },
}, { confirm: async () => false });
assert.deepEqual(declined.calls, []);
assert.equal(declined.doc, half);

const { rows } = await loadRestoredRows();
assert.equal(rows.length, 96);
for (const doc of rows) {
  assert.equal(uiResearchState(doc), planResearch(doc).researchState);
}
const listed = rows.map((doc) => ({
  researchRunAt: doc.researchRunAt,
  f1: doc.f1,
  f2: doc.f2,
  f3: doc.f3,
  f4: doc.f4,
  f5: doc.f5,
  researchFindings: doc.researchFindings,
}));
for (let i = 0; i < rows.length; i += 1) {
  assert.equal(uiResearchState(listed[i]), planResearch(rows[i]).researchState);
}

const incompleteRows = rows.filter((doc) => uiResearchState(doc) === "incomplete");
assert.equal(applyLogStatusFilter(rows, "incomplete").length, incompleteRows.length);
const flat = flattenProposition(incompleteRows[0]);
assert.equal(flat.researchState, "incomplete");

const form = readFileSync(path.join(root, "src", "PropositionForm.jsx"), "utf8");
assert.match(form, /confirmMissingSteps/);
assert.match(form, /window\.confirm\(missingStepsCostPreview/);
const api = readFileSync(path.join(root, "lib", "propositionsApi.js"), "utf8");
assert.match(api, /needsConfirm/);
assert.doesNotMatch(api, /run all|runAll|bulkResearch/i);
const health = readFileSync(path.join(root, "lib", "healthApi.js"), "utf8");
assert.match(health, /researchIncomplete/);

console.log("PASS part 106 research steps");
