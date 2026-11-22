/**
 * CSV and Markdown reports with stable column order so runs are comparable.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCORE_FIELDS } from "./fields.mjs";

function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells) {
  return cells.map(csvCell).join(",");
}

const IDEA_HEADERS = Object.freeze([
  "runIndex",
  "ideaId",
  "gstRateMatch",
  "benchmarkRelevanceMatch",
  "gapCredibilityMatch",
  "priceEventsDatedAndSourcedMatch",
  "techShiftWithinOneLevel",
  "routeMatch",
  "verdictBandMatch",
  "agreementPct",
  "citationChecked",
  "citationFound",
  "citationMissing",
  "citationBlocked",
  "durationMs",
  "inputTokens",
  "outputTokens",
  "listPriceUsd",
]);

const SUMMARY_HEADERS = Object.freeze(["field", "agreementPct", "stableAcrossRunsPct", "same", "total"]);

export function ideaRow(entry) {
  const f = entry.score?.fields || {};
  const audit = entry.citationAudit || {};
  const usage = entry.predicted?.usage || {};
  return {
    runIndex: entry.runIndex,
    ideaId: entry.ideaId,
    gstRateMatch: f.gstRate ? 1 : 0,
    benchmarkRelevanceMatch: f.benchmarkRelevance ? 1 : 0,
    gapCredibilityMatch: f.gapCredibility ? 1 : 0,
    priceEventsDatedAndSourcedMatch: f.priceEventsDatedAndSourced ? 1 : 0,
    techShiftWithinOneLevel: f.techShiftWithinOneLevel ? 1 : 0,
    routeMatch: f.routeMatch ? 1 : 0,
    verdictBandMatch: f.verdictBand ? 1 : 0,
    agreementPct: entry.score?.agreementPct ?? 0,
    citationChecked: audit.checked ?? 0,
    citationFound: audit.found ?? 0,
    citationMissing: audit.missing ?? 0,
    citationBlocked: audit.blocked ?? 0,
    durationMs: entry.predicted?.durationMs ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    listPriceUsd: Number(entry.listPriceUsd || 0).toFixed(6),
  };
}

export function renderIdeaCsv(entries) {
  const lines = [csvLine(IDEA_HEADERS)];
  for (const entry of entries) {
    const row = ideaRow(entry);
    lines.push(csvLine(IDEA_HEADERS.map((h) => row[h])));
  }
  return `${lines.join("\n")}\n`;
}

export function renderSummaryCsv(agreement, stability) {
  const lines = [csvLine(SUMMARY_HEADERS)];
  for (const field of SCORE_FIELDS) {
    const a = agreement[field] || { pct: 0, same: 0, total: 0 };
    const s = stability[field] || { pct: 0 };
    lines.push(csvLine([field, a.pct, s.pct, a.same, a.total]));
  }
  return `${lines.join("\n")}\n`;
}

function mdTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

export function renderMarkdown(summary) {
  const {
    startedAt = "",
    pipeline = "",
    repeats = 0,
    ideaCount = 0,
    agreement = {},
    stability = {},
    totals = {},
  } = summary;
  const fieldRows = SCORE_FIELDS.map((field) => {
    const a = agreement[field] || { pct: 0, same: 0, total: 0 };
    const s = stability[field] || { pct: 0 };
    return [field, `${a.pct}%`, `${s.pct}%`, `${a.same}/${a.total}`];
  });
  return [
    "# AI evaluation harness report",
    "",
    `- Started (UTC): ${startedAt}`,
    `- Pipeline: ${pipeline}`,
    `- Ideas: ${ideaCount}`,
    `- Repeats: ${repeats}`,
    `- Total duration (ms): ${totals.durationMs ?? 0}`,
    `- List-price USD (not an invoice): ${Number(totals.listPriceUsd || 0).toFixed(4)}`,
    `- Citations checked / found / missing / blocked: ${totals.citationChecked ?? 0} / ${totals.citationFound ?? 0} / ${totals.citationMissing ?? 0} / ${totals.citationBlocked ?? 0}`,
    "",
    "## Agreement with labels",
    "",
    mdTable(["field", "agreement", "stable across repeats", "hits"], fieldRows),
    "",
    "Proposed thresholds (owner sets the bar): GST and benchmark relevance ≥ 85%; tech-shift within one level ≥ 90%; invented sources = 0.",
    "",
  ].join("\n");
}

export function writeReports(outDir, { entries, agreement, stability, summary }) {
  mkdirSync(outDir, { recursive: true });
  const ideasPath = path.join(outDir, "eval-ideas.csv");
  const summaryPath = path.join(outDir, "eval-summary.csv");
  const mdPath = path.join(outDir, "eval-report.md");
  writeFileSync(ideasPath, renderIdeaCsv(entries), "utf8");
  writeFileSync(summaryPath, renderSummaryCsv(agreement, stability), "utf8");
  writeFileSync(mdPath, renderMarkdown({ ...summary, agreement, stability }), "utf8");
  return { ideasPath, summaryPath, mdPath };
}
