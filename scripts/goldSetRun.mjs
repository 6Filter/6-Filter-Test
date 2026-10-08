/**
 * Gold-set runner.
 * Without GOLD_SET_CONFIRM=1 it only prints the quote and stops.
 * The quote uses data/gold/measured-one.json when that measurement exists.
 * GOLD_SET_MAX_USD is required once a run starts. There is no default.
 * After each idea the running list-price total is checked and the file
 * written so far is kept if the cap is passed.
 *
 * First pass is 10 ideas, not 18.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { harnessQuoteFromMeasurement, readGoldBudgetCap, shouldAbortGoldRun, usdFromUsage } from "../lib/goldBudget.js";

const FIRST_PASS_IDEAS = 10;
const dir = path.join(process.cwd(), "data", "gold");
const measuredPath = path.join(dir, "measured-one.json");

let measurement = null;
try {
  measurement = JSON.parse(await readFile(measuredPath, "utf8"));
} catch {
  measurement = null;
}

if (!measurement) {
  console.log(
    "[primus/gold] No measured submission yet. The old 61k-input-token estimate is not trusted. " +
      "Run node scripts/goldSetMeasureOne.mjs and then read this quote again. " +
      "GOLD_SET_CONFIRM=1 will not start a batch until that file exists."
  );
  process.exit(0);
}

const quote = harnessQuoteFromMeasurement(measurement, { ideas: FIRST_PASS_IDEAS, baselines: 2, candidates: 1 });
console.log(
  `[primus/gold] One measured submission: in=${measurement.inputTokens} out=${measurement.outputTokens} ` +
    `cache_read=${measurement.cacheRead} cache_write=${measurement.cacheWrite} searches=${measurement.searches} ` +
    `list-price $${quote.perRunUsd.toFixed(2)}. ` +
    `First pass ${FIRST_PASS_IDEAS} ideas × 2 baselines + 1 candidate = ${quote.runs} runs, ` +
    `about $${quote.usd.toFixed(2)} at list price. Confirm rates in the Console. ` +
    `Set GOLD_SET_MAX_USD before GOLD_SET_CONFIRM=1.`
);

if (process.env.GOLD_SET_CONFIRM !== "1") {
  console.log("[primus/gold] stopped before any further model calls.");
  process.exit(0);
}

let cap;
try {
  cap = readGoldBudgetCap();
} catch (e) {
  console.error(`[primus/gold] ${e.message}`);
  process.exit(1);
}

const ideas = JSON.parse(await readFile(path.join(dir, "ideas.json"), "utf8")).slice(0, FIRST_PASS_IDEAS);
const label = process.argv[2] || "run";
const { runPropositionResearch } = await import("../lib/propositionAiFirstPass.js");
const { initDb } = await import("../lib/db.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../lib/submissionCost.js");
await initDb();
await mkdir(path.join(dir, "runs"), { recursive: true });

const results = [];
let spent = 0;
const out = path.join(dir, "runs", `${label}.json`);
for (const proposition of ideas) {
  openSubmissionCost(proposition.id);
  const research = await runPropositionResearch({
    ideaText: proposition.ideaDescription || proposition.name || "",
    proposition,
    division: proposition.division || "",
    forceFresh: true,
  });
  const bag = currentSubmissionCost() || {};
  const runUsd = usdFromUsage({
    inputTokens: bag.inputTokens,
    outputTokens: bag.outputTokens,
    cacheRead: bag.cacheRead,
    cacheWrite: bag.cacheWrite,
    searches: bag.searches,
  });
  closeSubmissionCost();
  spent += runUsd;
  const checks = await computeAllAdvisoryChecks({ ...proposition, researchFindings: research.researchFindings });
  results.push({
    id: proposition.id,
    category: proposition.category || "",
    verdict: computeGoNoGo(checks),
    score: scoreAdvisoryChecks(checks).pct,
    benchmarkVerified: research.researchFindings?.f1?.benchmarkVerified ?? null,
    noCompetitor: research.researchFindings?.f1?.noCompetitorCheck || null,
    f4: research.researchFindings?.f4 || null,
    f2: research.suggestions?.f2 || null,
    f3: research.researchFindings?.f3 || null,
    f5: research.researchFindings?.f5 || null,
    narrative: research.researchFindings?.narratives || null,
    parseFailed: Boolean(research.researchFindings?.f1?.researchFailed || research.researchFindings?.f4?.researchFailed),
    listPriceUsd: runUsd,
  });
  await writeFile(out, JSON.stringify({ spentUsd: spent, capUsd: cap, results }, null, 2));
  if (shouldAbortGoldRun(spent, cap)) {
    console.log(
      `[primus/gold] stopped at $${spent.toFixed(2)} after ${results.length} idea(s); cap is $${cap}. Kept ${out}.`
    );
    process.exit(0);
  }
}
console.log(`[primus/gold] wrote ${results.length} ideas to ${out}; list-price total $${spent.toFixed(2)}`);
