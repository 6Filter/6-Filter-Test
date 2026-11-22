/**
 * AI evaluation harness CLI.
 *
 *   node scripts/aiEval/index.mjs --labels path.csv --pipeline fake --out dir
 *   node scripts/aiEval/index.mjs --labels path.csv --pipeline real --live --out dir
 *
 * Fake pipeline needs no API key. Real pipeline refuses unless --live is set
 * and ANTHROPIC_API_KEY is already in the environment. Never reads eval-key.txt.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createFakePipeline, fakeFetchImpl } from "./fakePipeline.mjs";
import { createRealPipeline } from "./realPipeline.mjs";
import { runEval } from "./runEval.mjs";

function arg(flag, argv = process.argv.slice(2)) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

function has(flag, argv = process.argv.slice(2)) {
  return argv.includes(flag);
}

const argv = process.argv.slice(2);
if (has("--help", argv) || has("-h", argv)) {
  console.log(
    "Usage: node scripts/aiEval/index.mjs --labels <csv> [--pipeline fake|real] [--repeats 3] [--out dir] [--live]"
  );
  process.exit(0);
}

const labelsPath = arg("--labels", argv);
if (!labelsPath) {
  console.error("Missing --labels <csv>");
  process.exit(1);
}

const pipelineName = (arg("--pipeline", argv) || "fake").toLowerCase();
const repeats = Number(arg("--repeats", argv) || 3);
const outDir = arg("--out", argv) || "";
const live = has("--live", argv);

let pipeline;
let fetchOpts = {};
if (pipelineName === "fake") {
  pipeline = createFakePipeline();
  fetchOpts = { fetchImpl: fakeFetchImpl, skipDns: true };
} else if (pipelineName === "real") {
  pipeline = createRealPipeline({ live });
} else {
  console.error("Unknown --pipeline (use fake or real)");
  process.exit(1);
}

const labelsText = readFileSync(path.resolve(labelsPath), "utf8");
const result = await runEval({ labelsText, pipeline, repeats, outDir, fetchOpts });
const a = result.agreement;
console.log(
  `eval ${result.summary.pipeline} ideas=${result.summary.ideaCount} repeats=${result.summary.repeats} ` +
    `gst=${a.gstRate.pct}% bench=${a.benchmarkRelevance.pct}% gap=${a.gapCredibility.pct}% ` +
    `price=${a.priceEventsDatedAndSourced.pct}% tech=${a.techShiftWithinOneLevel.pct}% ` +
    `route=${a.routeMatch.pct}% verdict=${a.verdictBand.pct}% ` +
    `usd=${result.summary.totals.listPriceUsd.toFixed(4)} ms=${result.summary.totals.durationMs}`
);
if (result.paths) {
  console.log(`wrote ${result.paths.mdPath}`);
}
