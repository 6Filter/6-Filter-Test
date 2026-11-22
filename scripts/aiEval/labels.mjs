/**
 * Parse a labelled golden-set CSV. One row per idea.
 * Example rows marked EXAMPLE are skipped unless includeExamples is true.
 */
import { parseBool, parseGst, techShiftFromRow, normalizeVerdict, normalizeYesNo } from "./fields.mjs";

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] == null ? "" : String(cells[i]).trim();
    });
    rows.push(row);
  }
  return rows;
}

export const LABEL_COLUMNS = Object.freeze([
  "id",
  "name",
  "category",
  "division",
  "ideaDescription",
  "declaredAttribute",
  "benchmark",
  "declaredGap",
  "gapDerivation",
  "parityExceptions",
  "growthRoute",
  "growthArgument",
  "packSize",
  "gstRatePct",
  "expectedGstRate",
  "benchmarkRelevant",
  "gapCredible",
  "priceEventsDatedAndSourced",
  "tech_functionalCoreStability",
  "tech_consumptionContextStability",
  "tech_manufacturingDisruptionRisk",
  "tech_userHabitShiftPotential",
  "tech_adjacentSubstitutionThreat",
  "tech_purchaseFrequencyShift",
  "tech_regulatoryDisruptionRisk",
  "routeMatches",
  "expectedVerdict",
  "actualOutcome",
  "labelledBy",
  "labelledDate",
]);

export function rowToIdea(row = {}) {
  const id = String(row.id || row.name || "").trim();
  return {
    id,
    name: String(row.name || id).trim(),
    category: String(row.category || "").trim(),
    division: String(row.division || "").trim(),
    ideaDescription: String(row.ideaDescription || "").trim(),
    f1: {
      declaredAttribute: String(row.declaredAttribute || "").trim(),
      benchmark: String(row.benchmark || "").trim(),
      declaredGap: parseGst(row.declaredGap) ?? row.declaredGap,
      gapDerivation: String(row.gapDerivation || "").trim(),
      parityExceptions: String(row.parityExceptions || "").trim(),
      growthRoute: String(row.growthRoute || "").trim(),
      growthArgument: String(row.growthArgument || "").trim(),
    },
    f2: {
      grammage: String(row.packSize || "").trim(),
      gstRatePct: parseGst(row.gstRatePct),
    },
  };
}

export function rowToLabels(row = {}) {
  return {
    gstRate: parseGst(row.expectedGstRate ?? row.gstRatePct),
    benchmarkRelevant: normalizeYesNo(row.benchmarkRelevant),
    gapCredible: normalizeYesNo(row.gapCredible),
    priceEventsDatedAndSourced: parseBool(row.priceEventsDatedAndSourced),
    techShift: techShiftFromRow(row),
    routeMatches: normalizeYesNo(row.routeMatches),
    verdictBand: normalizeVerdict(row.expectedVerdict),
    actualOutcome: String(row.actualOutcome || "").trim(),
    labelledBy: String(row.labelledBy || "").trim(),
    labelledDate: String(row.labelledDate || "").trim(),
  };
}

export function parseLabelledSet(text, { includeExamples = false } = {}) {
  const rows = parseCsv(text);
  const ideas = [];
  for (const row of rows) {
    const marker = String(row.id || "").toUpperCase();
    if (!includeExamples && marker.startsWith("EXAMPLE")) continue;
    const idea = rowToIdea(row);
    if (!idea.id) continue;
    ideas.push({
      ...idea,
      labels: rowToLabels(row),
      raw: row,
    });
  }
  return ideas;
}
