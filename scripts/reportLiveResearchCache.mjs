/**
 * Read-only. Matches the 14 affected ideas to a live export that includes research_cache.
 * Prints section counts only. Never prints idea text, names, or hash values.
 *
 *   node scripts/exportAllTables.mjs --include-research-cache --out data/backups/live-cache-readonly
 *   node scripts/reportLiveResearchCache.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { filterHasContent, parseFilterValue } from "../lib/filterWriteGuard.js";
import { researchHashFor } from "../lib/researchCache.js";
import { backupDir } from "./planResubmit.mjs";

const exportDir = path.resolve(process.argv[2] || path.join("data", "backups", "live-cache-readonly"));
const cacheFile = path.join(exportDir, "research_cache.jsonl");
const FILTERS = ["f1", "f2", "f3", "f4"];

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readJsonl(file) {
  if (!existsSync(file)) return null;
  const rows = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

function hashKeys(value, found, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return;
  for (const [key, child] of Object.entries(value)) {
    if (/hash/i.test(key) && child) found.push(key);
    if (child && typeof child === "object") hashKeys(child, found, depth + 1);
  }
}

function countList(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value ? 1 : 0;
}

function sections(row) {
  const payload = parse(row.research_findings_json) || {};
  const findings = payload.researchFindings || payload.f1 || payload.f2 ? payload : payload;
  const research = findings.researchFindings || findings;
  const suggestions = findings.suggestions || null;
  const f4 = research.f4?.techShiftRisk || research.techShiftRisk || null;
  const margin = research.f3?.marginElasticity || research.marginElasticity || null;
  const cost = research.f2?.costEstimate || research.costEstimate || null;
  const f5 = research.f5 || null;
  const marginRange = Boolean(
    margin && (margin.minMrpInr != null || margin.maxMrpInr != null || margin.maxMarginPct != null)
  );
  return {
    suggestions: countList(suggestions),
    f1Findings: countList(research.f1),
    f4Dimensions: countList(f4?.dimensions),
    marginRange: marginRange ? 1 : 0,
    f2Cost: countList(cost),
    f5Factors: [f5?.householdsReachedY3Mn, f5?.trialRatePct, f5?.repeatConversionPct, f5?.purchaseFrequencyYr, f5?.avgPackValueInr].filter((v) => v != null && v !== "").length,
  };
}

function stableResearchSignature(findings) {
  const research = findings?.researchFindings || findings || {};
  const cost = research.f2?.costEstimate || {};
  const f5 = research.f5 || {};
  const stable = {
    cogs: cost.cogsAtScale ?? null,
    margin: cost.netMarginAtScale ?? null,
    grammage: cost.grammage ?? null,
    estimatedMrp: cost.estimatedMrpInr ?? null,
    households: f5.householdsReachedY3Mn ?? null,
    trial: f5.trialRatePct ?? null,
    repeat: f5.repeatConversionPct ?? null,
    frequency: f5.purchaseFrequencyYr ?? null,
    pack: f5.avgPackValueInr ?? null,
  };
  if (Object.values(stable).every((value) => value == null || value === "")) return "";
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

const propositions = await readJsonl(path.join(backupDir(), "propositions.jsonl"));
const affected = [];
let benchmarkEvidence = 0;
for (const row of propositions || []) {
  if (!row.research_run_at) continue;
  const filters = {
    f1: parseFilterValue(row.f1_json),
    f2: parseFilterValue(row.f2_json),
    f3: parseFilterValue(row.f3_json),
    f4: parseFilterValue(row.f4_json),
  };
  if (FILTERS.every((key) => filterHasContent(filters[key]))) continue;
  const findings = parse(row.research_findings_json) || {};
  if (String(findings.f1?.benchmarkEvidence || "").trim()) benchmarkEvidence += 1;
  affected.push({ row, filters, findings });
}
console.log(`benchmarkEvidenceOnProposition=${benchmarkEvidence} of ${affected.length}`);

const cacheRows = await readJsonl(cacheFile);
if (!cacheRows) {
  console.error(`live-cache export missing at ${exportDir}. Content match was not run. No recovery conclusion.`);
  process.exit(1);
}

const byHash = new Map();
let oldest = "";
let newest = "";
for (const row of cacheRows) {
  const hash = String(row.input_hash || "");
  if (hash) byHash.set(hash, row);
  const at = row.created_at || "";
  if (at && (!oldest || at < oldest)) oldest = at;
  if (at && (!newest || at > newest)) newest = at;
}
console.log(`cacheRows=${cacheRows.length} oldest=${oldest || "-"} newest=${newest || "-"}`);

const bySignature = new Map();
for (const row of cacheRows) {
  const payload = parse(row.research_findings_json) || {};
  const signature = stableResearchSignature(payload);
  if (!signature) continue;
  if (!bySignature.has(signature)) bySignature.set(signature, []);
  bySignature.get(signature).push(row);
}
let contentMatches = 0;
const sectionTotals = { suggestions: 0, f1Findings: 0, f4Dimensions: 0, marginRange: 0 };
for (const item of affected) {
  const signature = stableResearchSignature(item.findings);
  const hits = signature ? bySignature.get(signature) || [] : [];
  if (!hits.length) continue;
  contentMatches += 1;
  const section = sections(hits[0]);
  if (section.suggestions) sectionTotals.suggestions += 1;
  if (section.f1Findings) sectionTotals.f1Findings += 1;
  if (section.f4Dimensions) sectionTotals.f4Dimensions += 1;
  if (section.marginRange) sectionTotals.marginRange += 1;
  console.log(
    `content-match id=${item.row.id} suggestions=${section.suggestions ? "yes" : "no"} f1Findings=${section.f1Findings ? "yes" : "no"} f4Dimensions=${section.f4Dimensions ? "yes" : "no"} marginRange=${section.marginRange ? "yes" : "no"}`
  );
}
console.log(
  `contentMatches=${contentMatches} suggestions=${sectionTotals.suggestions} f1Findings=${sectionTotals.f1Findings} f4Dimensions=${sectionTotals.f4Dimensions} marginRange=${sectionTotals.marginRange}`
);

let reported = 0;
for (const row of propositions) {
  if (!row.research_run_at) continue;
  const filters = {
    f1: parseFilterValue(row.f1_json),
    f2: parseFilterValue(row.f2_json),
    f3: parseFilterValue(row.f3_json),
    f4: parseFilterValue(row.f4_json),
  };
  if (FILTERS.every((key) => filterHasContent(filters[key]))) continue;
  reported += 1;
  const stored = [];
  hashKeys(row, stored);
  const empty = FILTERS.filter((key) => !filterHasContent(filters[key]));
  let lookup = "stored-hash-absent";
  let section = null;
  if (stored.length) {
    lookup = "stored-hash-present";
  } else if (!empty.includes("f1")) {
    const hash = researchHashFor({
      ideaDescription: row.idea_description,
      category: row.category,
      division: row.division,
      f1: filters.f1,
      attachment: parse(row.attachment_json),
    });
    const hit = byHash.get(hash);
    lookup = hit ? "surviving-f1-hash-hit" : "surviving-f1-hash-miss";
    if (hit) section = sections(hit);
  } else {
    lookup = "blank-f1-not-recomputed";
  }
  const detail = section
    ? ` suggestions=${section.suggestions} f1Findings=${section.f1Findings} f4Dimensions=${section.f4Dimensions} marginRange=${section.marginRange} f2Cost=${section.f2Cost} f5Factors=${section.f5Factors}`
    : "";
  console.log(`id=${row.id} empty=${empty.join(",") || "-"} lookup=${lookup}${detail}`);
}
console.log(`affectedReported=${reported}`);
