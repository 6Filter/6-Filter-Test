/**
 * Screen again must persist a new score even when scoreInputKey is unchanged.
 * DB stringifyGoNogo → hardLockGoNoGo otherwise reverts to the prior seal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hardLockGoNoGo } from "../lib/analysisStability.js";
import { checkF4 } from "../lib/filterChecks.js";
import {
  easeScreeningChecks,
  syncF4ViewsForScore,
  scoringDocForEnteredCredit,
} from "../lib/enteredFieldCredit.js";
import { scoreAdvisoryChecks, computeGoNoGo, previewAdvisoryChecks } from "../lib/goNoGo.js";
import { sealGoNoGoOutput } from "../lib/sealOutput.js";
import { scoreInputKey } from "../lib/analysisStability.js";
import { withScreeningDifficulty } from "../lib/difficultyLevel.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const finding =
  "Whey protein isolate remains the dominant functional core for RTD protein drinks in India with enough words here to pass.";
const dims = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Medium", reason: finding }])
);
const assessments = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [
    k,
    {
      status: "ok",
      searchUsed: true,
      raw: { rating: "Medium", supported: true, quote: finding, reason: finding },
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
  f4: {
    techShiftRisk: { dimensions: dims, overallRisk: "Medium" },
    userInputs: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { pov: finding }])),
    f4MitigationResponses: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, finding])),
  },
  researchFindings: { f4: { assessments }, screeningDifficulty: 2 },
};

const openDoc = { ...base, f4: { techShiftRisk: base.f4.techShiftRisk } };
const openChecks = easeScreeningChecks(
  {
    ...previewAdvisoryChecks(scoringDocForEnteredCredit(openDoc)),
    f4: checkF4(openDoc.f4, openDoc.researchFindings.f4),
  },
  openDoc
).checks;
const openScore = scoreAdvisoryChecks(openChecks);
const key = scoreInputKey(syncF4ViewsForScore(base));
const prior = sealGoNoGoOutput(
  {
    classification: computeGoNoGo(openChecks),
    score: openScore,
    scoreInputKey: key,
    rationale: "prior",
  },
  { advisoryChecks: openChecks, doc: openDoc }
);
assert.ok(openScore.pct < 90, `open F4 should hold score down, got ${openScore.pct}`);

const l1 = withScreeningDifficulty(syncF4ViewsForScore(base), 1);
const liveChecks = easeScreeningChecks(
  {
    ...previewAdvisoryChecks(scoringDocForEnteredCredit(l1)),
    f4: checkF4(l1.f4, l1.researchFindings.f4),
  },
  l1
).checks;
const liveScore = scoreAdvisoryChecks(liveChecks);
assert.ok(liveScore.pct > openScore.pct, `${openScore.pct} → ${liveScore.pct}`);
assert.equal(scoreInputKey(l1), key, "Level switch alone must not move the fingerprint");

const next = sealGoNoGoOutput(
  {
    classification: computeGoNoGo(liveChecks),
    score: { ...liveScore, scoreInputKey: key },
    scoreInputKey: key,
    rationale: "screen-again",
    allowRulesetRescore: true,
  },
  { advisoryChecks: liveChecks, doc: l1 }
);

const withoutFlag = hardLockGoNoGo(
  { ...prior, score: prior.output.score, scoreInputKey: key, classification: prior.classification },
  { ...next, allowRulesetRescore: false, score: next.output.score, scoreInputKey: key }
);
assert.equal(
  withoutFlag.classification,
  prior.classification,
  "without allowRulesetRescore the DB lock must keep the old verdict"
);
assert.equal(Number(withoutFlag.score?.pct), Number(prior.output.score.pct));

const withFlag = hardLockGoNoGo(
  { ...prior, score: prior.output.score, scoreInputKey: key, classification: prior.classification },
  {
    ...next,
    allowRulesetRescore: true,
    score: next.output.score,
    scoreInputKey: key,
    classification: next.output.classification || computeGoNoGo(liveChecks),
  }
);
assert.equal(Number(withFlag.score?.pct), Number(liveScore.pct));
assert.notEqual(withFlag.classification, prior.classification);

const api = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(api, /allowRulesetRescore:\s*true/);
assert.match(api, /levelChangedOnPut/);
assert.match(api, /body\?\.forceReseal \|\| payload\?\.forceReseal/);
const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /withScreeningDifficulty\(doc, screeningDifficulty\)/);
assert.match(form, /forceReseal:\s*true/);
assert.match(form, /levelChanged/);

console.log("PASS testForceResealBeatsDbHardLock", {
  before: openScore.pct,
  after: withFlag.score.pct,
  verdict: withFlag.classification,
});
