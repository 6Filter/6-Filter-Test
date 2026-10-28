import { detectDivision } from "./npdMaster.js";

function ideaText(doc) {
  if (!doc || typeof doc !== "object") return "";
  return [doc.name, doc.category, doc.ideaDescription]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Division used only to score. A read must not write it.
 * Stored division wins, then the division on this request, then the keyword match.
 * The same idea text and the same margin therefore keep one floor.
 */
export function divisionForScore(saved, incoming) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const draft = String(incoming?.division || "").trim();
  if (draft) return draft;
  return detectDivision(`${ideaText(incoming)}\n${ideaText(saved)}`) || "";
}
