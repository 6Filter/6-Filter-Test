import { detectDivision } from "./npdMaster.js";

/** Text the keyword match reads. Same fields the form and the gate use. */
export function divisionScoreText(doc = {}) {
  return [doc?.name, doc?.category, doc?.ideaDescription]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Division used to score. A stored label wins, then a label already on this
 * payload, then the keyword match for the same text. This does not write the row.
 */
export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  return detectDivision(divisionScoreText(doc)) || "";
}
