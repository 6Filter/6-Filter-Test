import { detectDivision } from "./npdMaster.js";

/**
 * One division for every score of the same idea.
 * An explicit division on the row wins. Otherwise the keyword match Submit
 * already uses, so a blank division field cannot lift the floor.
 * This does not write the division. Callers that only read a score must not persist it.
 */
export function divisionForScore(proposition = {}) {
  const explicit = String(proposition?.division || "").trim();
  if (explicit) return explicit;
  const text = [proposition?.name, proposition?.category, proposition?.ideaDescription]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  return detectDivision(text) || "";
}
