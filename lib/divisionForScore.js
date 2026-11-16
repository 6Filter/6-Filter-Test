import { detectDivision } from "./npdMaster.js";

/**
 * Division the score and the Filter 2 hint use.
 * An explicit stored division wins. Otherwise the same keyword match Submit
 * uses when the model is unavailable. This never writes the division.
 */
export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  const text = [doc?.name, doc?.ideaDescription, doc?.category]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  return detectDivision(text) || "";
}
