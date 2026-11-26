/**
 * Screen again must reseal score + verdict when Filter 4 views already clear.
 * Closest path must not say "cleared" while the sealed percent is still frozen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import { buildPathToGo } from "../lib/improvementPoints.js";
import { displayCopy } from "../lib/displayCopy.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(formSrc, /forceReseal:\s*true/);
assert.match(formSrc, /forceResearch:\s*true/);
assert.match(apiSrc, /forceReseal/);
// Submit path must always reseal (not only when the client sends forceReseal).
assert.match(apiSrc, /const forceReseal = true/);

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
assert.ok(beforeScore.pct < 90, `expected open F4 to hold the score down, got ${beforeScore.pct}`);

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
assert.equal(Boolean(lockedScoreFromPrior(synced, prev)), true, "same mitigations keep the lock");

const sealedBack = advisoryChecksFromOutput(sealed.output);
assert.ok(
  sealedF4OpenClearedByViews(synced, sealedBack.f4),
  "pasted views must beat sealed-open Filter 4"
);

const path = buildPathToGo({
  advisoryChecks: sealedBack,
  sealedScore: { ...beforeScore, classification: sealed.classification },
  scoreStatus: "current",
  listAllOpen: true,
  doc: synced,
});
const f4Path = path.actions.filter((a) => String(a.filter).toUpperCase() === "F4");
assert.ok(f4Path.length >= 6, `expected open F4 path rows, got ${f4Path.length}`);
for (const row of f4Path) {
  const shown = displayCopy(row.instruction || row.text, synced);
  assert.doesNotMatch(
    shown,
    /: cleared\.?\s*$/i,
    `path must not fake cleared while sealed % is frozen: ${shown}`
  );
  assert.match(
    shown,
    /Screen again to update the score|mitigation|Clear the open|entered/i,
    `path should tip Screen again or stay open: ${shown}`
  );
}

const scored = scoringDocForEnteredCredit(synced);
const liveChecks = easeScreeningChecks(
  { ...previewAdvisoryChecks(scored), f4: checkF4(scored.f4, scored.researchFindings.f4) },
  synced
).checks;
const liveScore = scoreAdvisoryChecks(liveChecks);
assert.ok(liveScore.pct > beforeScore.pct, `${beforeScore.pct} → ${liveScore.pct}`);

let goNoGo = resolveHardLockedGoNoGo({
  doc: synced,
  prev,
  advisoryChecks: liveChecks,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
  buildRationale: () => "screen-again",
});
assert.equal(goNoGo.hardLocked, true);
// forceReseal path: unlock and seal live checks (Screen again)
goNoGo = {
  ...goNoGo,
  hardLocked: false,
  classification: computeGoNoGo(liveChecks),
  score: { ...liveScore, scoreInputKey: scoreInputKey(synced) },
  scoreInputKey: scoreInputKey(synced),
};
const resealed = sealGoNoGoOutput(goNoGo, { advisoryChecks: liveChecks, doc: synced });
assert.equal(resealed.output.score.pct, liveScore.pct);
assert.equal(resealed.output.classification, computeGoNoGo(liveChecks));
assert.ok(
  resealed.output.score.pct >= 80,
  `Screen again must raise the sealed band (got ${resealed.output.score.pct})`
);

console.log("PASS testScreenAgainResealsScore", {
  before: beforeScore.pct,
  after: resealed.output.score.pct,
  verdict: resealed.output.classification,
});
