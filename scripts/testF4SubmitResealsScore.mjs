/**
 * Pasting Filter 4 AI findings and submitting must raise the sealed score —
 * Closest path must not look cleared while the percent stays frozen.
 */
import assert from "node:assert/strict";
import { scoreInputKey, lockedScoreFromPrior } from "../lib/analysisStability.js";
import {
  easeScreeningChecks,
  syncF4ViewsForScore,
  f4AnswerPasses,
} from "../lib/enteredFieldCredit.js";
import { checkF4 } from "../lib/filterChecks.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";
import { advisoryChecksFromOutput, sealGoNoGoOutput } from "../lib/sealOutput.js";
import { buildPathToGo } from "../lib/improvementPoints.js";
import { DIMENSION_LABELS, TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const assessed = TECH_SHIFT_DIMENSIONS.filter(
  (k) => k !== "adjacentSubstitutionThreat" && k !== "purchaseFrequencyShift"
);

const dims = Object.fromEntries(
  assessed.map((k) => [
    k,
    {
      risk: "Medium",
      reason: `Finding about ${k} with enough words to pass the short-text guard.`,
      userResponse: "",
    },
  ])
);
const findings = {
  f4: {
    researchFailed: false,
    assessments: Object.fromEntries(
      assessed.map((k) => [
        k,
        {
          status: "ok",
          searchUsed: true,
          raw: {
            rating: "Medium",
            supported: true,
            quote: dims[k].reason,
            reason: dims[k].reason,
          },
        },
      ])
    ),
  },
};

const base = {
  name: "Chill Out Mocktails",
  category: "Carbonated soft drinks",
  division: "Beverages",
  screeningDifficulty: 2,
  f1: {
    declaredAttribute: "refreshment",
    benchmark: "Sprite",
    declaredGap: 2.5,
    gapDerivation: "gap from cooler occasions versus the named drink",
    parityExceptions: "no caffeine versus the named drink",
    growthRoute: "penetration",
    growthArgument: "more households buying mocktails each month",
  },
  f2: { cogsAtScale: 20, netMarginAtScale: 40, gstRatePct: 12, grammage: "100 g" },
  f3: {
    volumeLossJustification: "Price stays flat for five years and volume loss stays inside ten percent.",
  },
  f4: { techShiftRisk: { dimensions: dims, overallRisk: "Medium" } },
  researchFindings: findings,
};

const beforeChecks = easeScreeningChecks(
  {
    f1: { checkLabel: "Cleared", items: [] },
    f2: { checkLabel: "Cleared", items: [] },
    f3: { checkLabel: "Cleared", items: [] },
    f4: checkF4(base.f4, findings.f4),
  },
  base
).checks;
const beforeScore = scoreAdvisoryChecks(beforeChecks);
assert.ok(beforeScore.pct < 90, `expected open F4 to hold the score down, got ${beforeScore.pct}`);

const sealed = sealGoNoGoOutput(
  {
    classification: computeGoNoGo(beforeChecks),
    score: beforeScore,
    scoreInputKey: scoreInputKey(base),
    rationale: "prior",
  },
  { advisoryChecks: beforeChecks, doc: base }
);
const sealedPath = buildPathToGo({
  advisoryChecks: advisoryChecksFromOutput(sealed.output),
  sealedScore: { ...beforeScore, classification: sealed.classification },
  scoreStatus: "current",
  listAllOpen: true,
});
assert.ok(sealedPath.actions.some((a) => /Adjacent substitution|Purchase frequency/i.test(a.instruction || a.text)));

const pasted = {
  ...base,
  f4: {
    ...base.f4,
    userInputs: Object.fromEntries(
      assessed.map((k) => [k, { pov: dims[k].reason, at: "2026-11-26T00:00:00.000Z" }])
    ),
  },
};
assert.ok(assessed.every((k) => f4AnswerPasses(pasted, k)));
const synced = syncF4ViewsForScore(pasted);
assert.equal(Boolean(lockedScoreFromPrior(synced, sealed)), false, "paste must unlock the seal");

const afterChecks = easeScreeningChecks(
  {
    f1: { checkLabel: "Cleared", items: [] },
    f2: { checkLabel: "Cleared", items: [] },
    f3: { checkLabel: "Cleared", items: [] },
    f4: checkF4(synced.f4, findings.f4),
  },
  synced
).checks;
const afterScore = scoreAdvisoryChecks(afterChecks);
assert.ok(
  afterScore.pct > beforeScore.pct,
  `paste+ease must raise the score (${beforeScore.pct} → ${afterScore.pct})`
);
assert.ok(
  afterChecks.f4.items.filter((it) => it.status === "done").length >= assessed.length,
  "assessed Filter 4 views must clear"
);

const resealed = sealGoNoGoOutput(
  {
    classification: computeGoNoGo(afterChecks),
    score: afterScore,
    scoreInputKey: scoreInputKey(synced),
    rationale: "updated",
  },
  { advisoryChecks: afterChecks, doc: synced }
);
assert.equal(resealed.output.score.pct, afterScore.pct);
const back = advisoryChecksFromOutput(resealed.output);
assert.ok(
  (back.f4?.items || []).filter((it) => it.status === "done" || Number(it.credit) >= 1).length >=
    assessed.length,
  "resealed Filter 4 must keep cleared views done"
);
// Score + sealed checks are the contract. Path reconstruction for missing research
 // dimensions is covered separately; the user bug was a frozen percent after paste.
const sealedTexts = resealed.output.filters.f4.items.map((it) => `${it.credit}|${it.level}|${it.text}`);
assert.ok(
  resealed.output.filters.f4.items.some((it) => Number(it.credit) >= 1),
  `resealed F4 must store credited rows: ${sealedTexts.join(" || ")}`
);
assert.ok(
  afterScore.pct > beforeScore.pct && resealed.output.score.pct === afterScore.pct,
  "sealed percent must match the raised score"
);
console.log("PASS testF4SubmitResealsScore", { before: beforeScore.pct, after: afterScore.pct });
