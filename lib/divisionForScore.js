/**
 * Division used for scoring only. An explicit division wins.
 * Otherwise the same keyword match Submit uses when the model is unavailable.
 * This never writes the division onto the stored idea.
 */
import { detectDivision } from "./npdMaster.js";

export function ideaTextForDivision(proposition = {}) {
  return [proposition?.name, proposition?.ideaDescription, proposition?.category]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function divisionForScore(proposition = {}) {
  const explicit = String(proposition?.division || "").trim();
  if (explicit) return explicit;
  return detectDivision(ideaTextForDivision(proposition)) || "";
}
