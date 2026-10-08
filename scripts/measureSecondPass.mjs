/**
 * Second pass of the already measured idea. Does not force a fresh model run.
 * Prints token totals only.
 */
process.env.PRIMUS_REPLAY = "";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}
loadEnv(".env.local");

const ideas = JSON.parse(await readFile("data/gold/ideas.json", "utf8"));
const first = JSON.parse(await readFile("data/gold/measured-one.json", "utf8"));
const proposition = ideas[0];
const { initDb } = await import("../lib/db.js");
const { runPropositionResearch } = await import("../lib/propositionAiFirstPass.js");
const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../lib/submissionCost.js");
const { usdFromUsage } = await import("../lib/goldBudget.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");

await initDb();
const storedChecks = await computeAllAdvisoryChecks(proposition);
console.log(
  `stored-score classification=${computeGoNoGo(storedChecks)} pct=${scoreAdvisoryChecks(storedChecks).pct}`
);
openSubmissionCost(proposition.id || "second");
const research = await runPropositionResearch({
  ideaText: proposition.ideaDescription || proposition.name || "",
  proposition,
  division: proposition.division || "",
  forceFresh: false,
});
const bag = currentSubmissionCost() || {};
closeSubmissionCost();
const second = {
  calls: bag.calls || 0,
  inputTokens: bag.inputTokens || 0,
  outputTokens: bag.outputTokens || 0,
  cacheRead: bag.cacheRead || 0,
  cacheWrite: bag.cacheWrite || 0,
  searches: bag.searches || 0,
};
second.listPriceUsd = usdFromUsage(second);
const withFindings = { ...proposition, researchFindings: research.researchFindings };
const checks = await computeAllAdvisoryChecks(withFindings);
console.log(
  `second calls=${second.calls} in=${second.inputTokens} out=${second.outputTokens} ` +
    `cache_read=${second.cacheRead} cache_write=${second.cacheWrite} searches=${second.searches} ` +
    `usd=${second.listPriceUsd.toFixed(2)}`
);
console.log(
  `delta calls=${first.calls - second.calls} in=${first.inputTokens - second.inputTokens} ` +
    `out=${first.outputTokens - second.outputTokens} searches=${first.searches - second.searches} ` +
    `usd=${(first.listPriceUsd - second.listPriceUsd).toFixed(2)}`
);
console.log(
  `second-score classification=${computeGoNoGo(checks)} pct=${scoreAdvisoryChecks(checks).pct}`
);
