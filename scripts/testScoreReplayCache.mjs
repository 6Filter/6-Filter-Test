/**
 * Permanent identical-input rule: finished research for a hash is replayed.
 * Documented failures are stored. First writer wins. Step cache still refuses failures.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-score-replay-"));

const {
  researchBundleSaveAllowed,
  researchResultIsCacheable,
  hasReplayableResearchCache,
  preferExistingResearchFindings,
} = await import("../lib/researchCacheable.js");
const { saveResearchCache, getResearchCache } = await import("../lib/db.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");

const mixedFindings = {
  f1: { attributeValidation: [{ ok: true }], categorySizeEvidence: [] },
  f2: { evidence: [] },
  f3: { researchFailed: true, failureReason: "no usable range" },
  f4: { techShiftFound: true, overallRisk: "High", dimensions: { a: { rating: "high" } } },
  f5: {
    sizingFactorsFound: true,
    householdsReachedY3Mn: 2.5,
    trialRatePct: 10,
    repeatConversionPct: 38,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 120,
  },
  stepsExpected: ["F3", "F4", "F5"],
  stepsDone: ["F4", "F5"],
  stepsFailed: ["F3"],
  sources: [],
};

const allFailedFindings = {
  f3: { researchFailed: true, failureReason: "no usable range" },
  f4: { researchFailed: true, error: "down" },
  stepsExpected: ["F3", "F4"],
  stepsDone: [],
  stepsFailed: ["F3", "F4"],
};

assert.equal(researchBundleSaveAllowed({ researchFindings: mixedFindings }), true);
assert.equal(hasReplayableResearchCache({ researchFindings: mixedFindings }), true);
assert.equal(
  researchBundleSaveAllowed({ researchFindings: allFailedFindings }),
  true,
  "documented all-failed passes must cache so twins cannot re-roll scores"
);
assert.equal(hasReplayableResearchCache({ researchFindings: allFailedFindings }), true);
assert.equal(
  researchResultIsCacheable({ researchFailed: true, failureReason: "no usable range" }),
  false,
  "a failed step result still must not enter the step cache"
);
assert.equal(
  researchBundleSaveAllowed({ researchFindings: { f4: {} } }),
  false,
  "empty filter parts stay uncached"
);

const hash = createHash("sha256").update("score-replay-twin").digest("hex");
const suggestions = {
  f5: {
    householdsReachedY3Mn: 2.5,
    trialRatePct: 10,
    repeatConversionPct: 38,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 120,
  },
  f4: { techShiftRisk: { overallRisk: "High", dimensions: { a: { rating: "high" } } } },
};

const saved = await saveResearchCache(hash, {
  researchFindings: mixedFindings,
  suggestions,
  division: "Personal Care",
  providerUsed: "claude",
});
assert.ok(saved);

const hit = await getResearchCache(hash);
assert.ok(hit);
assert.equal(hit.researchFindings.f3.researchFailed, true);
assert.equal(hit.researchFindings.f5.householdsReachedY3Mn, 2.5);

const secondWriter = await saveResearchCache(hash, {
  researchFindings: {
    ...mixedFindings,
    f5: { ...mixedFindings.f5, householdsReachedY3Mn: 99, trialRatePct: 1 },
  },
  suggestions: { f5: { householdsReachedY3Mn: 99, trialRatePct: 1 } },
  division: "Personal Care",
  providerUsed: "claude",
});
assert.equal(
  secondWriter.researchFindings.f5.householdsReachedY3Mn,
  2.5,
  "first writer must win — later twin cannot replace findings"
);
assert.equal((await getResearchCache(hash)).researchFindings.f5.trialRatePct, 10);

const preferred = preferExistingResearchFindings(hit, {
  researchFindings: { f4: { techShiftFound: true, overallRisk: "Low" } },
  suggestions: { f5: { trialRatePct: 1 } },
});
assert.equal(preferred.researchFindings.f5.householdsReachedY3Mn, 2.5);
assert.equal(
  preferred.suggestions.f5.trialRatePct,
  10,
  "replacing findings must also keep the first writer's scoring suggestions"
);
const sameFindingsRefresh = preferExistingResearchFindings(hit, {
  researchFindings: hit.researchFindings,
  suggestions: { f5: { ...hit.suggestions.f5, trialRatePct: 1 } },
});
assert.equal(
  sameFindingsRefresh.suggestions.f5.trialRatePct,
  1,
  "unchanged findings may still refresh suggestions"
);

function scoreFromBundle(findings, sug) {
  const doc = {
    division: "Personal Care",
    category: "Hair oils",
    f1: { declaredAttribute: "softness", benchmark: "Brand", declaredGap: 3 },
    f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 },
    f3: { marginElasticity: sug?.f3?.marginElasticity || null },
    f4: { techShiftRisk: sug?.f4?.techShiftRisk || null },
    f5: { ...(sug?.f5 || {}) },
    researchFindings: findings,
  };
  return computeAllAdvisoryChecks(doc).then((checks) => ({
    pct: scoreAdvisoryChecks(checks).pct,
    class: computeGoNoGo(checks),
    byFilter: scoreAdvisoryChecks(checks).byFilter,
  }));
}

const a = await scoreFromBundle(hit.researchFindings, hit.suggestions);
const b = await scoreFromBundle(
  (await getResearchCache(hash)).researchFindings,
  (await getResearchCache(hash)).suggestions
);
assert.equal(a.pct, b.pct);
assert.equal(a.class, b.class);
assert.deepEqual(a.byFilter, b.byFilter);

const failedHash = createHash("sha256").update("score-replay-all-failed").digest("hex");
assert.ok(
  await saveResearchCache(failedHash, { researchFindings: allFailedFindings, division: "Personal Care" })
);
assert.equal((await getResearchCache(failedHash)).researchFindings.f3.researchFailed, true);

assert.equal(
  researchBundleSaveAllowed({
    researchFindings: { categorySizing: { sizingRunId: "x", categoryName: "Hair Oils" } },
  }),
  true
);

console.log("PASS score replay cache — finished outcomes stick; first writer wins; scores identical");
