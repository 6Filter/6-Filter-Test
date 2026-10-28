/**
 * Identical research inputs must replay from the bundle cache even when one
 * filter failed — so twin submits keep the same score.
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
} = await import("../lib/researchCacheable.js");
const { saveResearchCache, getResearchCache } = await import("../lib/db.js");

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

assert.equal(researchBundleSaveAllowed({ researchFindings: mixedFindings }), true);
assert.equal(hasReplayableResearchCache({ researchFindings: mixedFindings }), true);
assert.equal(
  researchResultIsCacheable({ researchFailed: true, failureReason: "no usable range" }),
  false,
  "a failed step result still must not enter the step cache"
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
assert.equal(hit.suggestions.f5.trialRatePct, 10);
assert.equal(hasReplayableResearchCache(hit), true);

assert.equal(
  researchBundleSaveAllowed({
    researchFindings: {
      f3: { researchFailed: true },
      f4: { researchFailed: true, error: "down" },
      stepsFailed: [],
    },
  }),
  false,
  "all-failed bundles stay uncached so a later submit can retry"
);

console.log("PASS score replay cache — mixed failure still HITs; all-failed does not");
