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

/** Reassessed rating wins once it exists — original `risk` is never overwritten. */
export function effectiveDimensionRisk(dimension) {
  return normalizeRiskLevel(dimension?.reassessedRisk) || normalizeRiskLevel(dimension?.risk);
}

export function hasReassessedDimension(dimensions = {}) {
  return Object.values(dimensions || {}).some((d) => Boolean(normalizeRiskLevel(d?.reassessedRisk)));
}

/** Same Part 52 rule (2+ High, 1 High, 3+ Medium) on effective ratings. */
export function aggregateTechShiftRiskWithResponses(dimensions = {}) {
  const effective = Object.fromEntries(
    Object.entries(dimensions || {}).map(([k, d]) => [k, { risk: effectiveDimensionRisk(d) }])
  );
  return aggregateTechShiftRisk(effective);
}

export function isTechShiftRiskUnfilled(value) {
  if (!value || typeof value !== "object") return true;
  return value.dimensions == null;
}

/** Empty editable shell for the form display only — do not persist until a dimension is rated. */
export function blankTechShiftRisk() {
  const dimensions = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    dimensions[key] = { risk: "", reason: "" };
  }
  return { dimensions, overallRisk: "", sources: [], aiSourced: false };
}

export function effectiveOverallRisk(risk = {}) {
  if (risk?.dimensions) {
    return hasReassessedDimension(risk.dimensions)
      ? aggregateTechShiftRiskWithResponses(risk.dimensions)
      : aggregateTechShiftRisk(risk.dimensions);
  }
  return normalizeRiskLevel(risk?.overallRisk);
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
    const cell = {
      risk,
      reason: reason || (risk === "Low" ? "Low risk — no destabilizing signal found" : `${risk} risk`),
    };
    const userResponse = String(d.userResponse || "").trim();
    if (userResponse) cell.userResponse = userResponse;
    const reassessedRisk = normalizeRiskLevel(d.reassessedRisk);
    if (reassessedRisk) {
      cell.reassessedRisk = reassessedRisk;
      const reassessedReason = String(d.reassessedReason || "").replace(/\s+/g, " ").trim();
      cell.reassessedReason = reassessedReason || `${reassessedRisk} risk after response`;
    }
    out[key] = cell;
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
    overallRisk: hasReassessedDimension(dimensions)
      ? aggregateTechShiftRiskWithResponses(dimensions)
      : aggregateTechShiftRisk(dimensions),
    sources,
    aiSourced: raw.aiSourced !== false && aiSourced,
  };
}

/** Safe list for UI — missing dimensions or a null cell must not throw. */
export function listTechShiftDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== "object") return [];
  return Object.entries(dimensions).map(([key, d]) => {
    const cell = d && typeof d === "object" ? d : {};
    const original = normalizeRiskLevel(cell.risk) || String(cell.risk || "").trim() || "unassessed";
    const reassessedRisk = normalizeRiskLevel(cell.reassessedRisk);
    return {
      key,
      label: DIMENSION_LABELS[key] || key,
      risk: original,
      reason: String(cell.reason || "").trim() || "—",
      userResponse: String(cell.userResponse || "").trim(),
      reassessedRisk,
      reassessedReason: String(cell.reassessedReason || "").trim(),
      effectiveRisk: reassessedRisk || original,
    };
  });
}

export function drivingDimensions(dimensions = {}) {
  const entries = Object.entries(dimensions || {})
    .map(([key, d]) => ({
      key,
      label: DIMENSION_LABELS[key] || key,
      risk: effectiveDimensionRisk(d),
      reason: String(d?.reassessedReason || d?.reason || "").trim(),
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

/* ------------------------------------------------------------------ */
/* Part 140 C (D63) — the person's own rating and view, per dimension   */
/* f4.userInputs.<dimension> = { rating, pov, at }                      */
/* Lives beside techShiftRisk, never inside it. Research cannot touch it. */
/* ------------------------------------------------------------------ */

/** Clean a stored userInputs map: known dimensions only, { rating, pov, at }, empty entries dropped. */
export function normalizeF4UserInputs(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const cell = raw[key];
    if (!cell || typeof cell !== "object") continue;
    const rating = normalizeRiskLevel(cell.rating);
    const pov = String(cell.pov ?? "");
    if (!rating && !pov.trim()) continue;
    const at = cell.at ? String(cell.at) : null;
    out[key] = { rating, pov, at };
  }
  return out;
}

/** One dimension's input, always in shape (blank when the person has said nothing). */
export function userInputFor(userInputs, key) {
  const cell = userInputs && typeof userInputs === "object" ? userInputs[key] : null;
  return {
    rating: normalizeRiskLevel(cell?.rating),
    pov: String(cell?.pov ?? ""),
    at: cell?.at ? String(cell.at) : null,
  };
}

/** New userInputs map with `patch` ({ rating?, pov? }) applied to one dimension. Does not mutate. */
export function patchF4UserInput(userInputs, key, patch = {}, at = new Date().toISOString()) {
  if (!TECH_SHIFT_DIMENSIONS.includes(key)) return normalizeF4UserInputs(userInputs);
  const base = normalizeF4UserInputs(userInputs);
  const prev = userInputFor(base, key);
  const next = {
    rating: Object.prototype.hasOwnProperty.call(patch, "rating") ? normalizeRiskLevel(patch.rating) : prev.rating,
    pov: Object.prototype.hasOwnProperty.call(patch, "pov") ? String(patch.pov ?? "") : prev.pov,
    at,
  };
  const out = { ...base };
  if (!next.rating && !next.pov.trim()) delete out[key];
  else out[key] = next;
  return out;
}
