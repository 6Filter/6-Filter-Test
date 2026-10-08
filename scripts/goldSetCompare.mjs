/**
 * Compare two gold-set run files.
 * node scripts/goldSetCompare.mjs data/gold/runs/baseline-a.json data/gold/runs/candidate.json
 */
import { readFile } from "node:fs/promises";

const FIELDS = ["benchmarkVerified", "noCompetitor", "f4", "f2", "f3", "f5", "narrative"];

export function compareGoldRuns(baseline, candidate) {
  const byId = new Map(baseline.map((row) => [row.id, row]));
  let verdicts = 0;
  let scored = 0;
  const fieldHits = Object.fromEntries(FIELDS.map((name) => [name, { same: 0, total: 0 }]));
  let parseFailures = 0;
  for (const row of candidate) {
    const prior = byId.get(row.id);
    if (!prior) continue;
    scored += 1;
    if (row.verdict === prior.verdict && row.score === prior.score) verdicts += 1;
    if (row.parseFailed) parseFailures += 1;
    for (const name of FIELDS) {
      fieldHits[name].total += 1;
      if (JSON.stringify(row[name]) === JSON.stringify(prior[name])) fieldHits[name].same += 1;
    }
  }
  return { scored, verdicts, fieldHits, parseFailures };
}

function pct(same, total) {
  if (!total) return "n/a";
  return `${Math.round((100 * same) / total)}%`;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("goldSetCompare.mjs")) {
  const [leftPath, rightPath] = process.argv.slice(2);
  if (!leftPath || !rightPath) {
    console.error("Usage: node scripts/goldSetCompare.mjs <baseline.json> <candidate.json>");
    process.exit(1);
  }
  const left = JSON.parse(await readFile(leftPath, "utf8"));
  const right = JSON.parse(await readFile(rightPath, "utf8"));
  const report = compareGoldRuns(left, right);
  console.log(`verdict+score ${report.verdicts}/${report.scored}`);
  console.log(`parse failures in candidate ${report.parseFailures}`);
  for (const [name, hit] of Object.entries(report.fieldHits)) {
    console.log(`${name} ${pct(hit.same, hit.total)}`);
  }
}
