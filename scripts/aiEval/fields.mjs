/** Stable field ids for labelled evaluation. Do not reorder — reports compare run to run. */

export const TECH_SHIFT_DIMS = Object.freeze([
  "functionalCoreStability",
  "consumptionContextStability",
  "manufacturingDisruptionRisk",
  "userHabitShiftPotential",
  "adjacentSubstitutionThreat",
  "purchaseFrequencyShift",
  "regulatoryDisruptionRisk",
]);

export const SCORE_FIELDS = Object.freeze([
  "gstRate",
  "benchmarkRelevance",
  "gapCredibility",
  "priceEventsDatedAndSourced",
  "techShiftWithinOneLevel",
  "routeMatch",
  "verdictBand",
]);

export const VERDICT_BANDS = Object.freeze(["GO", "WATCH", "NO-GO", "INCOMPLETE"]);

const RISK_RANK = { low: 0, medium: 1, high: 2 };

export function parseBool(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (["yes", "y", "true", "1", "relevant", "credible", "match", "matches"].includes(s)) return true;
  if (["no", "n", "false", "0", "not-relevant", "not relevant", "not-found", "unclear"].includes(s)) {
    return false;
  }
  return null;
}

export function parseGst(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function gstRatesEqual(a, b) {
  const x = parseGst(a);
  const y = parseGst(b);
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  return Math.abs(x - y) < 0.01;
}

export function normalizeRisk(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "low") return "Low";
  if (s === "medium" || s === "med") return "Medium";
  if (s === "high") return "High";
  return "";
}

export function riskRank(value) {
  const n = normalizeRisk(value);
  if (!n) return null;
  return RISK_RANK[n.toLowerCase()];
}

/** Adjacent levels count as a match (Low↔Medium, Medium↔High). Low↔High does not. */
export function withinOneLevel(predicted, labelled) {
  const a = riskRank(predicted);
  const b = riskRank(labelled);
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1;
}

export function normalizeVerdict(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
  if (s === "NOGO" || s === "NO-GO") return "NO-GO";
  if (s === "GO" || s === "WATCH" || s === "INCOMPLETE") return s;
  return "";
}

export function normalizeYesNo(value) {
  const b = parseBool(value);
  if (b == null) return "";
  return b ? "yes" : "no";
}

export function techShiftFromRow(row = {}) {
  const out = {};
  for (const dim of TECH_SHIFT_DIMS) {
    const raw = row[`tech_${dim}`] ?? row[dim] ?? row.techShift?.[dim];
    const n = normalizeRisk(raw);
    if (n) out[dim] = n;
  }
  return out;
}
