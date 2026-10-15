import { detectDivision } from "./npdMaster.js";

/**
 * The division a score is allowed to use.
 * Stored wins, then the division in this query, then the keyword match Submit
 * uses. A blank division must not drop the floor and move the percent.
 */
export function divisionForScore(saved, draft) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const incoming = String(draft?.division || "").trim();
  if (incoming) return incoming;
  const text = `${draft?.ideaDescription || saved?.ideaDescription || ""}\n${
    draft?.category || saved?.category || ""
  }`.trim();
  return detectDivision(text) || "";
}
