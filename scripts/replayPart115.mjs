/**
 * Read-only replay of the narrative guard and evidence lines on the restored copy.
 * Prints counts and single tokens. Never prints a paragraph.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { numbersInChecks, validateNarrativeParagraph } from "../lib/narrativeCheck.js";
import {
  evidenceLineForFilter,
  GENERAL_KNOWLEDGE_EVIDENCE_LINE,
  PRECHANGE_EVIDENCE_LINE,
} from "../lib/evidenceProvenance.js";
import { scoreExplainerSections } from "../lib/scoreExplainer.js";

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
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const { checksumRows, readRestoredTable, withRestoredClient } = await import("./restoredCopy.mjs");
const { publicProposition } = await import("../lib/db.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");

function derivedFromChecks(value, allowed) {
  const nums = allowed.filter((candidate) => Number.isFinite(candidate) && candidate !== 0);
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = 0; j < nums.length; j += 1) {
      if (i === j) continue;
      const ratio = Math.abs((100 * (nums[i] - nums[j])) / nums[j]);
      const share = Math.abs((100 * nums[i]) / nums[j]);
      const gap = Math.abs(nums[i] - nums[j]);
      if (Math.abs(ratio - value) <= 0.5 || Math.abs(share - value) <= 0.5 || Math.abs(gap - value) <= 0.5) {
        return true;
      }
    }
  }
  return false;
}

process.env.DATABASE_URL = (await import("./restoredCopy.mjs")).restoredDatabaseUrl();
process.env.PRIMUS_SCHEMA = "primus_restored";

const beforeRows = await readRestoredTable();
const beforeChecksum = checksumRows(beforeRows);
const { initDb, closeDatabase } = await import("../lib/db.js");
await initDb();
const propositions = beforeRows.map((row) => publicProposition(row)).filter(Boolean);

const byFilter = { f1: 0, f2: 0, f3: 0, f4: 0 };
const byReason = {};
let paragraphs = 0;
let rejected = 0;
let numberRejections = 0;
let derivedRejections = 0;
const examples = [];

for (const proposition of propositions) {
  const narratives = proposition.goNoGo?.filterNarratives;
  if (!narratives) continue;
  const checks = await computeAllAdvisoryChecks(proposition);
  const competitors = Array.isArray(proposition.researchFindings?.f1?.noCompetitorCheck?.majorCompetitorsFound)
    ? proposition.researchFindings.f1.noCompetitorCheck.majorCompetitorsFound
    : [];
  for (const key of ["f1", "f2", "f3", "f4"]) {
    const text = String(narratives[key] || "").trim();
    if (!text) continue;
    paragraphs += 1;
    const verdict = validateNarrativeParagraph(text, { checks, check: checks[key] || {}, competitors });
    if (verdict.ok) continue;
    rejected += 1;
    byFilter[key] += 1;
    for (const reason of verdict.reasons) byReason[reason] = (byReason[reason] || 0) + 1;
    const numeric = verdict.reasons.some((reason) => reason === "unknown-rupee" || reason === "unknown-percent");
    if (numeric) {
      numberRejections += 1;
      const allowed = numbersInChecks(checks);
      const values = [...String(text).matchAll(/₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)|(?<![\d.])([0-9]+(?:\.[0-9]+)?)\s*%/g)]
        .map((match) => Number(String(match[1] || match[2]).replace(/,/g, "")))
        .filter((value) => Number.isFinite(value));
      if (values.some((value) => derivedFromChecks(value, allowed))) derivedRejections += 1;
    }
    if (examples.length < 10) {
      examples.push(`${key} reason=${verdict.reasons.join("|")} token=${verdict.token} check=${verdict.checkValue}`);
    }
  }
}

const lineTypes = { "pre-change": 0, "general-knowledge": 0, "web-search": 0, "local-row": 0, "no-line": 0 };
for (const proposition of propositions) {
  const lines = ["f1", "f2", "f3", "f4", "f5"].map((key) => evidenceLineForFilter(key, proposition)).filter(Boolean);
  if (!lines.length) {
    lineTypes["no-line"] += 1;
    continue;
  }
  if (lines.every((line) => line === PRECHANGE_EVIDENCE_LINE)) {
    lineTypes["pre-change"] += 1;
    continue;
  }
  if (lines.some((line) => line.includes(GENERAL_KNOWLEDGE_EVIDENCE_LINE))) {
    lineTypes["general-knowledge"] += 1;
    continue;
  }
  if (lines.some((line) => line.includes("public web search"))) {
    lineTypes["web-search"] += 1;
    continue;
  }
  lineTypes["local-row"] += 1;
}

const panelA = scoreExplainerSections().map((section) => `${section.heading}\n${section.body}`).join("\n");
const panelB = scoreExplainerSections().map((section) => `${section.heading}\n${section.body}`).join("\n");
if (panelA !== panelB) throw new Error("Explainer text changed between two renders.");

const thresholds = await withRestoredClient(async (client) => {
  const rows = (await client.query(
    `SELECT min_net_margin_pct, revenue_target_all_channels_cr, revenue_target_ecom_mt_cr FROM division_thresholds`
  )).rows;
  return rows.flatMap((row) => [row.min_net_margin_pct, row.revenue_target_all_channels_cr, row.revenue_target_ecom_mt_cr])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
});
const allowedShow = new Set([1, 2, 4, 60, 80]);
const watched = [...new Set(thresholds.map((value) => String(value)).filter((value) => !allowedShow.has(Number(value))))];
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(path.join(root, "docs", "HOW_THE_SCORE_WORKS.md"), "utf8");
const assets = readdirSync(path.join(root, "dist", "assets")).filter((name) => name.endsWith(".js"));
const bundle = assets.map((name) => readFileSync(path.join(root, "dist", "assets", name), "utf8")).join("\n");
const explainerSlice = scoreExplainerSections().map((section) => section.body).join("\n");
let bundleHits = 0;
const corpus = `${panelA}\n${doc}\n${explainerSlice}`;
for (const value of watched) {
  const pattern = new RegExp(`(?<![\\d.])${String(value).replace(".", "\\.")}(?![\\d.])`);
  if (pattern.test(corpus)) bundleHits += 1;
}

await closeDatabase();
const afterRows = await readRestoredTable();
const afterChecksum = checksumRows(afterRows);

console.log(`ideas=${propositions.length}`);
console.log(`paragraphs=${paragraphs} rejected=${rejected} fallbackRate=${paragraphs ? (rejected / paragraphs).toFixed(4) : "0"}`);
for (const key of ["f1", "f2", "f3", "f4"]) console.log(`rejected.${key}=${byFilter[key]}`);
for (const [reason, count] of Object.entries(byReason).sort()) console.log(`reason.${reason}=${count}`);
console.log(`numberRejections=${numberRejections} derivedRejections=${derivedRejections}`);
console.log("examples:");
for (const line of examples) console.log(line);
for (const [kind, count] of Object.entries(lineTypes)) console.log(`line.${kind}=${count}`);
console.log(`explainerIdentical=yes divisionNumberHits=${bundleHits} checksumSame=${beforeChecksum === afterChecksum}`);
process.exit(0);
