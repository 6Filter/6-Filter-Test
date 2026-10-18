import { detectDivision } from "./npdMaster.js";

function ideaText(doc) {
  if (!doc || typeof doc !== "object") return "";
  return [doc.name, doc.category, doc.ideaDescription]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * One division for every score of the same idea.
 * Stored label wins, then a label on this request, then the keyword match
 * Submit already uses. A blank follow-up does not drop a stored label,
 * and a read does not write the match back onto the row.
 */
export function divisionForScore(saved, incoming) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const next = String(incoming?.division || "").trim();
  if (next) return next;
  return detectDivision(`${ideaText(incoming)}\n${ideaText(saved)}`) || "";
}
