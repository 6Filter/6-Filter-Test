import { detectDivision } from "./npdMaster.js";

function ideaText(doc) {
  if (!doc || typeof doc !== "object") return "";
  return [doc.name, doc.category, doc.ideaDescription]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Division for a score only. A read must not write this onto the row.
 * Stored label, else the label on this request, else the keyword match.
 */
export function divisionForScore(saved, incoming) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const fromRequest = String(incoming?.division || "").trim();
  if (fromRequest) return fromRequest;
  const text = [ideaText(incoming), ideaText(saved)].filter(Boolean).join("\n");
  return detectDivision(text) || "";
}
