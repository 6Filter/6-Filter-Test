/**
 * Run one saved proposition and write token totals to data/gold/measured-one.json.
 * Does not print the idea text.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnv(file) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv(".env.local");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[primus/gold] ANTHROPIC_API_KEY is not set. Nothing was sent.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "data", "gold");
await mkdir(dir, { recursive: true });
const ideasPath = path.join(dir, "ideas.json");
let ideas;
try {
  ideas = JSON.parse(await readFile(ideasPath, "utf8"));
} catch {
  const store = JSON.parse(await readFile(path.join(process.cwd(), "data", "propositions.json"), "utf8"));
  const rows = Array.isArray(store) ? store : Object.values(store);
  ideas = rows.filter((row) => row && row.ideaDescription && row.category).slice(0, 1);
  await writeFile(ideasPath, JSON.stringify(ideas, null, 2));
}
const proposition = ideas[0];
if (!proposition) {
  console.error("[primus/gold] No saved proposition to measure.");
  process.exit(1);
}

const { initDb } = await import("../lib/db.js");
const { runPropositionResearch } = await import("../lib/propositionAiFirstPass.js");
const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../lib/submissionCost.js");
const { usdFromUsage } = await import("../lib/goldBudget.js");
await initDb();
openSubmissionCost(proposition.id || "measure-one");
await runPropositionResearch({
  ideaText: proposition.ideaDescription || proposition.name || "",
  proposition,
  division: proposition.division || "",
  forceFresh: true,
});
const bag = currentSubmissionCost() || {};
closeSubmissionCost();
const measurement = {
  inputTokens: bag.inputTokens || 0,
  outputTokens: bag.outputTokens || 0,
  cacheRead: bag.cacheRead || 0,
  cacheWrite: bag.cacheWrite || 0,
  searches: bag.searches || 0,
  calls: bag.calls || 0,
  listPriceUsd: usdFromUsage({
    inputTokens: bag.inputTokens,
    outputTokens: bag.outputTokens,
    cacheRead: bag.cacheRead,
    cacheWrite: bag.cacheWrite,
    searches: bag.searches,
  }),
  measuredAt: new Date().toISOString(),
};
await writeFile(path.join(dir, "measured-one.json"), JSON.stringify(measurement, null, 2));
console.log(
  `[primus/gold] measured one submission calls=${measurement.calls} in=${measurement.inputTokens} ` +
    `out=${measurement.outputTokens} cache_read=${measurement.cacheRead} cache_write=${measurement.cacheWrite} ` +
    `searches=${measurement.searches} list-price=$${measurement.listPriceUsd.toFixed(2)}`
);
