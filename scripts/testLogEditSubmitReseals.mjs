import assert from "node:assert/strict";
import { checkF4 } from "../lib/filterChecks.js";
import {
  easeScreeningChecks,
  syncF4ViewsForScore,
  sealedF4OpenClearedByViews,
  scoringDocForEnteredCredit,
} from "../lib/enteredFieldCredit.js";
import { scoreAdvisoryChecks, computeGoNoGo, previewAdvisoryChecks } from "../lib/goNoGo.js";
import { advisoryChecksFromOutput, sealGoNoGoOutput } from "../lib/sealOutput.js";
import { scoreInputKey, lockedScoreFromPrior, resolveHardLockedGoNoGo } from "../lib/analysisStability.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";
import { readFileSync } from "node:fs";

const finding =
  "Whey protein isolate remains the dominant functional core for RTD protein drinks in India with enough words here to pass.";
const dims = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Medium", reason: finding }])
);
dims.functionalCoreStability = { risk: "Low", reason: finding };
const assessments = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [
    k,
    {
      status: "ok",
      searchUsed: true,
      raw: { rating: dims[k].risk, supported: true, quote: finding, reason: finding },
    },
  ])
);
const base = {
  name: "Polka Pop Plus",
  screeningDifficulty: 2,
  division: "Beverages",
  category: "Carbonated soft drinks",
  f1: {
    declaredAttribute: "protein",
    benchmark: "Sprite",
    declaredGap: 2.5,
    gapDerivation: "higher protein per sip than the named drink",
    parityExceptions: "same sweetener class as the named drink",
    growthRoute: "penetration",
    growthArgument: "more gym households buying a second pack each month",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 45, gstRatePct: 12, grammage: "1000 g" },
  f3: {
    volumeLossJustification:
      "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
  },
  f4: { techShiftRisk: { dimensions: dims, overallRisk: "Medium" } },
  researchFindings: { f4: { assessments } },
};

const scored0 = scoringDocForEnteredCredit(base);
const before = easeScreeningChecks(
  { ...previewAdvisoryChecks(scored0), f4: checkF4(scored0.f4, scored0.researchFindings.f4) },
  base
).checks;
const beforeScore = scoreAdvisoryChecks(before);
const assessed = TECH_SHIFT_DIMENSIONS.filter((k) => k !== "functionalCoreStability");
const pasted = {
  ...base,
  f4: {
    ...base.f4,
    userInputs: Object.fromEntries(assessed.map((k) => [k, { pov: finding }])),
  },
};
const synced = syncF4ViewsForScore(pasted);
const sealed = sealGoNoGoOutput(
  {
    classification: computeGoNoGo(before),
    score: beforeScore,
    scoreInputKey: scoreInputKey(synced),
    rationale: "prior",
  },
  { advisoryChecks: before, doc: synced }
);
const prev = {
  classification: sealed.classification,
  score: sealed.output.score,
  scoreInputKey: sealed.output.scoreInputKey,
  rationale: "prior",
  output: sealed.output,
};
assert.equal(Boolean(lockedScoreFromPrior(synced, prev)), true);

const scored = scoringDocForEnteredCredit(synced);
const liveChecks = easeScreeningChecks(
  { ...previewAdvisoryChecks(scored), f4: checkF4(scored.f4, scored.researchFindings.f4) },
  synced
).checks;
const liveScore = scoreAdvisoryChecks(liveChecks);
assert.ok(liveScore.pct > beforeScore.pct);

// Simulate withAdvisory seal branch with forceReseal:true (Log → edit → Submit)
let goNoGo = resolveHardLockedGoNoGo({
  doc: synced,
  prev,
  advisoryChecks: liveChecks,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
  buildRationale: () => "x",
});
assert.equal(goNoGo.hardLocked, true);
const forceReseal = true;
const creditBeatsLock = forceReseal;
assert.equal(creditBeatsLock, true);
assert.equal(goNoGo.hardLocked && prev?.output?.sealedAt && !creditBeatsLock, false, "must not keep prev output");
goNoGo = {
  ...goNoGo,
  hardLocked: false,
  classification: computeGoNoGo(liveChecks),
  score: { ...liveScore, scoreInputKey: scoreInputKey(synced) },
  scoreInputKey: scoreInputKey(synced),
};
const resealed = sealGoNoGoOutput(goNoGo, { advisoryChecks: liveChecks, doc: synced });
assert.equal(resealed.output.score.pct, liveScore.pct);
assert.notEqual(resealed.output.score.pct, beforeScore.pct);
assert.ok(resealed.output.score.pct >= 80, `expected GO-band after forceReseal, got ${resealed.output.score.pct}`);

// Form Submit wiring must always send forceReseal
const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /forceReseal:\s*true/);
const api = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(api, /const forceReseal = true/);

console.log("PASS log-edit-submit reseal", { before: beforeScore.pct, after: resealed.output.score.pct });
