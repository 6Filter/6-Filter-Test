/**
 * Local Nielsen/Kantar rows, evidence lines, and narrative checks.
 * Postgres import runs only when TEST_DATABASE_URL points at a local scratch server.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lookupSyndicatedData, maxUsesForMatch } from "../lib/syndicatedLookup.js";
import { normalizeSyndicatedImport, previewSyndicatedImport } from "../lib/syndicatedImport.js";
import {
  evidenceLineForFilter,
  formatEvidenceLine,
  GENERAL_KNOWLEDGE_EVIDENCE_LINE,
  markEvidenceCacheHit,
  PRECHANGE_EVIDENCE_LINE,
} from "../lib/evidenceProvenance.js";
import {
  deterministicFilterParagraph,
  validateNarrativeParagraph,
} from "../lib/narrativeCheck.js";
import { scoreExplainerMarkdown, scoreExplainerSections } from "../lib/scoreExplainer.js";
import { generateFilterNarratives } from "../lib/filterNarratives.js";
import { selectExportTables } from "../lib/backupPlan.js";

const nielsen = [
  { category: "Juice", categoryFamily: "Beverages", as_of: "2024", period: "2024", categoryValueCr: 10 },
];
const kantar = [
  { category: "Juice", categoryFamily: "Beverages", as_of: "2024", householdsMn: 1 },
];
const exact = lookupSyndicatedData(nielsen, { category: "Juice" });
const family = lookupSyndicatedData(nielsen, { category: "Tea" });
assert.equal(exact.matchedOn, "category");
assert.equal(family.matchedOn, "family");
assert.equal(maxUsesForMatch(exact.matchedOn, lookupSyndicatedData(kantar, { category: "Juice" }).matchedOn, 4), 1);
assert.equal(maxUsesForMatch(family.matchedOn, family.matchedOn, 4), 4);
assert.equal(maxUsesForMatch("none", "none", 4), 4);

assert.throws(() => normalizeSyndicatedImport([{ category: "Juice" }]), /source and as_of/);
const imported = normalizeSyndicatedImport({
  source: "nielsen",
  asOf: "2024",
  rows: [{ category: "Juice", categoryFamily: "Beverages" }],
});
assert.equal(imported[0].source, "nielsen");
assert.equal(imported[0].asOf, "2024");
assert.equal(previewSyndicatedImport(imported).byCategory["nielsen:Juice"], 1);

const saved = "2026-10-08T09:00:00.000Z";
const hit = markEvidenceCacheHit(
  { nielsenMatchedOn: "none", kantarMatchedOn: "none", searchesUsed: 3, sourceCount: 2, asOf: saved, cacheHit: false },
  "2026-10-12T00:00:00.000Z"
);
assert.equal(hit.cacheHit, true);
assert.equal(hit.asOf, saved);
const line = formatEvidenceLine(hit);
assert.match(line, /public web search, India, 3 searches/);
assert.match(line, /No local Nielsen or Kantar row/);
assert.match(line, /8 Oct 2026/);
assert.doesNotMatch(line, /12 Oct 2026/);
const quiet = formatEvidenceLine({ nielsenMatchedOn: "none", kantarMatchedOn: "none", searchesUsed: 0, sourceCount: 0, asOf: saved });
assert.equal(quiet, GENERAL_KNOWLEDGE_EVIDENCE_LINE);
assert.doesNotMatch(quiet, /public web search/);
const oldIdea = evidenceLineForFilter("f1", { researchRunAt: saved });
assert.equal(oldIdea, PRECHANGE_EVIDENCE_LINE);
assert.doesNotMatch(oldIdea, /20\d\d/);
assert.equal(evidenceLineForFilter("f1", {}), "");
assert.equal(scoreExplainerSections().map((section) => section.body).join("\n"), scoreExplainerSections().map((section) => section.body).join("\n"));
const derived = validateNarrativeParagraph("Lipton sits about 15% above the ₹85 pack.", {
  checks: {
    f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named (Lipton) at ₹100 versus ₹85" }] },
  },
  check: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named (Lipton) at ₹100 versus ₹85" }] },
  competitors: [],
});
assert.equal(derived.ok, true);
assert.equal(
  validateNarrativeParagraph("The oil is Purastone in a roll-on.", {
    checks: { f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named: Purastone after shave roll on" }] } },
    check: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named: Purastone after shave roll on" }] },
    competitors: [],
  }).ok,
  true
);

const checks = {
  f1: {
    checkLabel: "Evidence missing",
    items: [{ status: "pending", text: "Benchmark named (Lipton) but not verified — listing" }],
  },
  f3: {
    checkLabel: "Cleared",
    items: [{ status: "done", text: "Filter 2 MRP sits within the safe ₹15–₹40 range" }],
  },
};
const bad = validateNarrativeParagraph("Maggi leads the category at ₹99.", {
  checks,
  check: checks.f1,
  competitors: [],
});
assert.equal(bad.ok, false);
assert.ok(bad.reasons.includes("foreign-brand"));
assert.ok(bad.reasons.includes("unknown-rupee"));
assert.ok(bad.reasons.includes("missing-benchmark"));
const contradict = validateNarrativeParagraph("Lipton clears the floor and the range is within the safe ₹15 band.", {
  checks,
  check: { checkLabel: "Below floor", items: checks.f3.items },
  competitors: ["Lipton"],
});
assert.ok(contradict.reasons.includes("contradicts-status"));
const fallback = deterministicFilterParagraph(checks.f1);
const kept = validateNarrativeParagraph(fallback, { checks, check: checks.f1, competitors: [] });
assert.equal(kept.ok, true);
assert.match(fallback, /Lipton/);

delete process.env.NARRATIVE_GUARD;
const shadowLogs = [];
const originalLog = console.log;
console.log = (...args) => shadowLogs.push(args.join(" "));
try {
  const written = "Maggi leads the category at ₹99.";
  const savedNarrative = await generateFilterNarratives({
    advisoryChecks: checks,
    researchFindings: {},
    callNarrative: async () => ({
      f1: written,
      f2: "Margin is recorded.",
      f3: "The range is ₹15 to ₹40.",
      f4: "Low risk is recorded.",
    }),
  });
  assert.equal(savedNarrative.f1, written);
  assert.ok(shadowLogs.some((line) => line.includes("[primus/narrative-guard-shadow]") && line.includes("filter=f1")));
} finally {
  console.log = originalLog;
}

const doc = readFileSync(new URL("../docs/HOW_THE_SCORE_WORKS.md", import.meta.url), "utf8");
assert.equal(doc.trim(), scoreExplainerMarkdown().trim());
assert.match(doc, /no live Nielsen or Kantar feed/i);
assert.ok(selectExportTables(["propositions", "syndicated_rows"]).includes("syndicated_rows"));

const pgUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!pgUrl) {
  console.log("PASS part 114 evidence checks (postgres import skipped)");
  process.exit(0);
}

const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(pgUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
const { replaceSyndicatedRows, listSyndicatedBySource } = await import("../lib/syndicatedStore.js");
const { closeDatabase, query } = await import("../lib/db.js");
try {
  const rows = normalizeSyndicatedImport({
    rows: [
      { source: "nielsen", as_of: "2024", category: "Juice", categoryFamily: "Beverages", categoryValueCr: 10 },
      { source: "kantar", as_of: "2023", category: "Juice", categoryFamily: "Beverages", householdsMn: 2 },
    ],
  });
  const preview = previewSyndicatedImport(rows);
  assert.equal(preview.rows, 2);
  await replaceSyndicatedRows(rows, { actor: "part114" });
  const nielsenRows = await listSyndicatedBySource("nielsen");
  assert.equal(lookupSyndicatedData(nielsenRows, { category: "Juice" }).matchedOn, "category");
  assert.equal(lookupSyndicatedData(nielsenRows, { category: "Tea" }).matchedOn, "family");
  const bothExact = maxUsesForMatch("category", "category", 4);
  assert.equal(bothExact, 1);
  const audit = await query(
    `SELECT action, row_count FROM proposition_audit WHERE action = 'syndicated-import'`
  );
  assert.ok(audit.some((row) => row.action === "syndicated-import" && Number(row.row_count) === 2));
  console.log("PASS part 114 evidence checks, postgres import included");
} finally {
  await closeDatabase();
  await suite.drop();
}
process.exit(0);
