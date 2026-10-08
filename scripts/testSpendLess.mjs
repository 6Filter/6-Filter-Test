import assert from "node:assert/strict";
import { modelForTier } from "../lib/modelTier.js";
import { formatCostLine, openSubmissionCost, noteSubmissionUsage, closeSubmissionCost } from "../lib/submissionCost.js";
import { categoryFactFresh, stampCategoryFact } from "../lib/categoryFactCache.js";
import { billingUsageAllowed } from "../lib/billingUsageApi.js";
import { compareGoldRuns } from "./goldSetCompare.mjs";

const heavy = modelForTier("heavy");
const previous = process.env.ANTHROPIC_MODEL_LIGHT;
delete process.env.ANTHROPIC_MODEL_LIGHT;
assert.equal(modelForTier("light"), modelForTier("heavy"));
process.env.ANTHROPIC_MODEL_LIGHT = "claude-haiku-test";
assert.equal(modelForTier("light"), "claude-haiku-test");
assert.equal(modelForTier("heavy"), heavy);
if (previous == null) delete process.env.ANTHROPIC_MODEL_LIGHT;
else process.env.ANTHROPIC_MODEL_LIGHT = previous;

const now = Date.parse("2026-10-08T00:00:00Z");
assert.equal(categoryFactFresh("2026-09-01T00:00:00Z", now, 45), true);
assert.equal(categoryFactFresh("2026-08-01T00:00:00Z", now, 45), false);
const stamped = stampCategoryFact({ basis: "Nielsen average", source: "Kantar" }, "2026-10-01T12:00:00Z");
assert.match(stamped.basis, /as of 2026-10-01/);
assert.match(stamped.source, /as of 2026-10-01/);

assert.equal(billingUsageAllowed("Master"), true);
assert.equal(billingUsageAllowed("R&D"), false);

openSubmissionCost("p1");
noteSubmissionUsage({ label: "filter1", inputTokens: 10, outputTokens: 4, searches: 2, cacheRead: 3 });
const line = formatCostLine({
  propositionId: "p1",
  calls: 1,
  inputTokens: 10,
  outputTokens: 4,
  cacheRead: 3,
  searches: 2,
  byLabel: { filter1: { calls: 1 } },
});
assert.match(line, /\[primus\/cost\] proposition=p1 calls=1 in=10 out=4 cache_read=3 searches=2/);
closeSubmissionCost();

const report = compareGoldRuns(
  [{ id: "a", verdict: "GO", score: 81, benchmarkVerified: true, f4: { risk: "low" }, parseFailed: false }],
  [{ id: "a", verdict: "GO", score: 81, benchmarkVerified: true, f4: { risk: "low" }, parseFailed: false }]
);
assert.equal(report.verdicts, 1);
assert.equal(report.parseFailures, 0);

console.log("testSpendLess ok");
