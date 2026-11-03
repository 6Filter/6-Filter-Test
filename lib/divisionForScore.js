import { detectDivision } from "./npdMaster.js";

/**
 * Division used for the margin floor and the score fingerprint.
 * An explicit division wins. Otherwise the same keyword match Submit uses.
 * This does not write the division onto the saved idea.
 */
export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  const text = `${doc?.ideaDescription || ""}\n${doc?.category || ""}`.trim();
  return detectDivision(text) || "";
}
