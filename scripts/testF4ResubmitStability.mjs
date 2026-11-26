/**
 * Same typed inputs must keep Filter 4 points, score and verdict stable across
 * resubmits — a failed F4 must not lock forever, and a hard-locked seal must
 * not rebuild Closest-path rows from a fresh advisory pass.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF4 } from "../lib/filterChecks.js";
import { finishResearchForSeal } from "../lib/finishResearchForSeal.js";
import {
  preferExistingResearchFindings,
  preserveSuccessfulF4,
} from "../lib/researchCacheable.js";
import { resolveHardLockedGoNoGo } from "../lib/analysisStability.js";
import { sealGoNoGoOutput } from "../lib/sealOutput.js";

const dims = {
  functionalCoreStability: { risk: "Low", reason: "stable format" },
  consumptionContextStability: { risk: "Low", reason: "stable use" },
  manufacturingDisruptionRisk: { risk: "Low", reason: "stable make" },
  userHabitShiftPotential: { risk: "Low", reason: "stable habit" },
  adjacentSubstitutionThreat: { risk: "Low", reason: "stable sub" },
  purchaseFrequencyShift: { risk: "Low", reason: "stable freq" },
  regulatoryDisruptionRisk: { risk: "Low", reason: "stable reg" },
};

const rated = {
  techShiftRisk: { dimensions: dims, overallRisk: "Low" },
};

// finishResearchForSeal clears stale F4 failed before scoring, so checkF4 sees ratings.
const finished = finishResearchForSeal({
  f4: rated,
  researchFindings: {
    stepsExpected: ["F4"],
    stepsDone: [],
    stepsFailed: ["F4"],
    f4: { researchFailed: true, error: "timeout" },
  },
  researchRunAt: "2026-11-25T00:00:00.000Z",
});
assert.equal(finished.changed, true);
assert.equal(finished.doc.researchFindings.f4.researchFailed, false);
const afterFinish = checkF4(rated, finished.doc.researchFindings.f4 || {});
assert.equal((afterFinish.items || []).length, 7);
assert.equal(
  (afterFinish.items || []).some((it) => it.code === "F4_RESEARCH_FAILED"),
  false
);

const okF4 = {
  researchFindings: {
    f4: {
      techShiftFound: true,
      overallRisk: "Low",
      assessments: {
        functionalCoreStability: { status: "ok", searchUsed: true, raw: { rating: "Low", supported: true } },
      },
    },
  },
};
const failedF4 = {
  researchFindings: {
    f4: { researchFailed: true, error: "provider error", techShiftFound: false },
  },
};

assert.equal(
  preferExistingResearchFindings(failedF4, okF4).researchFindings.f4.techShiftFound,
  true,
  "successful F4 must replace a failed first-writer cache"
);
assert.equal(
  preferExistingResearchFindings(okF4, failedF4).researchFindings.f4.techShiftFound,
  true,
  "successful F4 must survive a later failed save"
);
assert.equal(
  preserveSuccessfulF4(okF4.researchFindings, failedF4.researchFindings).f4.techShiftFound,
  true
);

const sealedPrev = {
  classification: "WATCH",
  score: { pct: 61, total: 18, points: 11, scoreInputKey: "abc" },
  scoreInputKey: "abc",
  hardLocked: true,
  output: {
    sealedAt: "2026-11-25T00:00:00.000Z",
    scoreInputKey: "abc",
    classification: "WATCH",
    score: { pct: 61 },
    filters: {
      f4: {
        label: "Cleared",
        narrative: "stable",
        items: [{ text: "Functional core stability: Low", credit: 1 }],
      },
    },
  },
  filterNarratives: { f4: "stable" },
  checkLabels: { f4: "Cleared" },
};
const liveChecks = {
  f4: {
    checkLabel: "Evidence missing",
    items: [{ text: "Research failed", credit: 0 }],
  },
};
const rebuilt = sealGoNoGoOutput(
  { ...sealedPrev, hardLocked: true },
  { advisoryChecks: liveChecks, doc: { f4: rated } }
);
assert.notEqual(rebuilt.output.filters.f4.label, "Cleared");

// Source lock: hardLocked path must reuse prev.output instead of sealGoNoGoOutput.
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /goNoGo\.hardLocked && prev\?\.output\?\.sealedAt/);
assert.match(apiSrc, /output: prev\.output/);
assert.match(apiSrc, /preserveSuccessfulF4/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /Omit derived\/AI-filled GST and MRP/);
assert.doesNotMatch(
  formSrc,
  /f2\.grammage,\s*\r?\n\s*f2\.gstRatePct,\s*\r?\n\s*f2\.mrpInr/
);
assert.doesNotMatch(formSrc, /Select risk/);
assert.doesNotMatch(formSrc, /Web check rating/);
assert.match(formSrc, /Your view/);

const { f4AnswerPasses, easeScreeningChecks, scoringDocForEnteredCredit, syncF4ViewsForScore } =
  await import("../lib/enteredFieldCredit.js");
const { scoreInputKey, lockedScoreFromPrior } = await import("../lib/analysisStability.js");
const { previewAdvisoryChecks } = await import("../lib/goNoGo.js");
const finding = "Pack format stays on shelf with no substitute format growing in search.";
const pasteDoc = {
  screeningDifficulty: 1,
  division: "Personal Care",
  f4: {
    userInputs: { functionalCoreStability: { pov: finding } },
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Medium", reason: finding },
      },
    },
  },
  researchFindings: {
    f4: {
      techShiftFound: true,
      assessments: {
        functionalCoreStability: {
          status: "ok",
          searchUsed: true,
          raw: { rating: "Medium", quote: finding, reason: finding, supported: true },
        },
      },
    },
  },
};
assert.equal(f4AnswerPasses(pasteDoc, "functionalCoreStability"), true);
const beforePasteKey = scoreInputKey({
  ...pasteDoc,
  f4: { techShiftRisk: pasteDoc.f4.techShiftRisk },
});
const syncedPaste = syncF4ViewsForScore(pasteDoc);
assert.equal(
  syncedPaste.f4.f4MitigationResponses.functionalCoreStability,
  finding,
  "typed view must mirror into mitigations for the score lock key"
);
assert.notEqual(
  beforePasteKey,
  scoreInputKey(syncedPaste),
  "pasting the AI finding into Your view must change the score lock key"
);
const priorWatch = {
  classification: "WATCH",
  score: { done: 11, total: 18, pct: 61, scoreInputKey: beforePasteKey },
  scoreInputKey: beforePasteKey,
  rationale: "prior",
  at: "2026-11-26T00:00:00.000Z",
};
assert.equal(
  Boolean(lockedScoreFromPrior(syncedPaste, priorWatch)),
  false,
  "pasted Filter 4 view must unlock the sealed score so Submit updates verdict and path"
);
const l1 = easeScreeningChecks(
  {
    ...previewAdvisoryChecks(scoringDocForEnteredCredit(pasteDoc)),
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "pending",
          credit: 0,
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  pasteDoc
).checks;
assert.equal(l1.f4.items[0].credit, 1, "Level 1 paste of the AI finding must clear the point");
assert.match(l1.f4.items[0].text, /cleared/i, "matching Level 1 view stays quiet on the output");
assert.doesNotMatch(l1.f4.items[0].text, /contradict/i);

const contradictDoc = {
  ...pasteDoc,
  f4: {
    ...pasteDoc.f4,
    userInputs: {
      functionalCoreStability: {
        pov: "Glass bottles will replace this pack in every store within a year.",
      },
    },
  },
};
const l1Contradict = easeScreeningChecks(
  {
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "pending",
          credit: 0,
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  contradictDoc
).checks;
assert.equal(l1Contradict.f4.items[0].credit, 1, "Level 1 contradiction is not marked down");
assert.match(
  l1Contradict.f4.items[0].text,
  /contradicts what was found online/i,
  "Level 1 contradiction is noted on the output"
);

const l2Doc = { ...pasteDoc, screeningDifficulty: 2 };
const l2 = easeScreeningChecks(
  {
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "pending",
          credit: 0,
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  l2Doc
).checks;
assert.equal(l2.f4.items[0].credit, 1, "same paste clears at Level 2 too");

const l2Contradict = easeScreeningChecks(
  {
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "pending",
          credit: 0,
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  { ...contradictDoc, screeningDifficulty: 2 }
).checks;
assert.equal(
  Number(l2Contradict.f4.items[0].credit) || 0,
  0,
  "Level 2 contradiction stays open until the finding is matched"
);

void resolveHardLockedGoNoGo;
console.log("PASS testF4ResubmitStability");
