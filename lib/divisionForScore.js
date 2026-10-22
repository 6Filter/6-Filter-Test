import { detectDivision } from "./npdMaster.js";

/**
 * One division for every score of the same idea.
 * Stored division wins, then a division the caller sent, then the keyword match.
 * A read uses this for the floor and does not write it back.
 */
export function divisionForScore(saved, incoming) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const sent = String(incoming?.division || "").trim();
  if (sent) return sent;
  const text = ["name", "category", "ideaDescription"]
    .flatMap((key) => [incoming?.[key], saved?.[key]])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  return detectDivision(text) || "";
}
