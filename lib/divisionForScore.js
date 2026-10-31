import { detectDivision } from "./npdMaster.js";

/**
 * Division the floor is screened against.
 * An explicit division wins. Otherwise the same keyword match Submit uses.
 * This never writes the row.
 */
export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  const text = [doc?.ideaDescription, doc?.category, doc?.name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
  return detectDivision(text) || "";
}
