/** Browser-safe Filter 4 structural obsolescence helpers. No DB, no Node APIs. */

export const TECH_SHIFT_DIMENSIONS = [
  "functionalCoreStability",
  "consumptionContextStability",
  "manufacturingDisruptionRisk",
  "userHabitShiftPotential",
  "adjacentSubstitutionThreat",
  "purchaseFrequencyShift",
  "regulatoryDisruptionRisk",
];

export const DIMENSION_LABELS = {
  functionalCoreStability: "Functional core stability",
  consumptionContextStability: "Consumption context stability",
  manufacturingDisruptionRisk: "Manufacturing disruption risk",
  userHabitShiftPotential: "User habit shift potential",
  adjacentSubstitutionThreat: "Adjacent substitution threat",
  purchaseFrequencyShift: "Purchase frequency shift",
  regulatoryDisruptionRisk: "Regulatory disruption risk",
};

const RISK_LEVELS = new Set(["Low", "Medium", "High"]);

export function normalizeRiskLevel(value) {
  const s = String(value || "").trim();
  if (s.toLowerCase() === "low") return "Low";
  if (s.toLowerCase() === "medium") return "Medium";
  if (s.toLowerCase() === "high") return "High";
  return "";
}

export function aggregateTechShiftRisk(dimensions = {}) {
  const risks = Object.values(dimensions || {}).map((d) => normalizeRiskLevel(d?.risk));
  const highCount = risks.filter((r) => r === "High").length;
  const mediumCount = risks.filter((r) => r === "Medium").length;
  if (highCount >= 2) return "High";
  if (highCount === 1) return "Medium";
  if (mediumCount >= 3) return "Medium";
  return "Low";
}

export function isTechShiftRiskUnfilled(value) {
  if (!value || typeof value !== "object") return true;
  return value.dimensions == null;
}

export function effectiveOverallRisk(risk = {}) {
  const stored = normalizeRiskLevel(risk.overallRisk);
  if (stored) return stored;
  if (risk.dimensions) return aggregateTechShiftRisk(risk.dimensions);
  return "";
}

function emptyDimension() {
  return { risk: "Low", reason: "Low risk — no destabilizing signal found" };
}

export function normalizeDimensions(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const d = src[key] && typeof src[key] === "object" ? src[key] : {};
    const risk = normalizeRiskLevel(d.risk) || "Low";
    const reason = String(d.reason || "").replace(/\s+/g, " ").trim();
    out[key] = {
      risk,
      reason: reason || (risk === "Low" ? "Low risk — no destabilizing signal found" : `${risk} risk`),
    };
  }
  return out;
}

export function normalizeTechShiftRisk(raw, { aiSourced = true } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const hasShape =
    raw.dimensions != null ||
    TECH_SHIFT_DIMENSIONS.some((k) => raw[k] && typeof raw[k] === "object");
  if (!hasShape) return null;
  const dimensions = normalizeDimensions(raw.dimensions || raw);
  const sources = Array.isArray(raw.sources)
    ? raw.sources.filter((s) => s && typeof s === "object")
    : [];
  return {
    dimensions,
    overallRisk: aggregateTechShiftRisk(dimensions),
    sources,
    aiSourced: raw.aiSourced !== false && aiSourced,
  };
}

export function drivingDimensions(dimensions = {}) {
  const entries = Object.entries(dimensions || {})
    .map(([key, d]) => ({
      key,
      label: DIMENSION_LABELS[key] || key,
      risk: normalizeRiskLevel(d?.risk),
      reason: String(d?.reason || "").trim(),
    }))
    .filter((d) => d.risk === "High" || d.risk === "Medium");
  const high = entries.filter((d) => d.risk === "High");
  if (high.length) return high;
  return entries.filter((d) => d.risk === "Medium");
}

/** Plain-language F4 lead. overallRisk must already be the AI aggregate — never the model's own roll-up. */
export function formatObsolescenceVerdict({ overallRisk = "", dimensions = null } = {}) {
  const level = normalizeRiskLevel(overallRisk);
  if (!level) return null;
  if (level === "High") {
    const drivers = drivingDimensions(dimensions || {})
      .filter((d) => d.risk === "High")
      .map((d) => d.label.toLowerCase());
    const tail = drivers.length ? ` Driven by ${drivers.join(", ")}.` : "";
    return `Structurally exposed on multiple fronts — a genuine obsolescence pattern, not just today's trend line.${tail}`;
  }
  if (level === "Medium") {
    const drivers = drivingDimensions(dimensions || {});
    const oneHigh = drivers.find((d) => d.risk === "High");
    if (oneHigh) {
      return `One real vulnerability worth watching: ${oneHigh.label.toLowerCase()} — ${oneHigh.reason}`;
    }
    const labels = drivers.map((d) => d.label.toLowerCase());
    const tail = labels.length ? ` Soft signals in ${labels.join(", ")}.` : "";
    return `One real vulnerability worth watching — several soft structural signals, not yet a hard obsolescence pattern.${tail}`;
  }
  return "No material structural exposure found — the format is not sitting on a shift that has already been invented elsewhere.";
}

export { emptyDimension };
