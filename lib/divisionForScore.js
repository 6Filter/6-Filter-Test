import { detectDivision } from "./npdMaster.js";

/**
 * The score uses one division for the same idea.
 * Stored wins, then a division the request already carries, then the keyword match.
 * A blank field must not skip the floor that Submit applies.
 */
export function divisionForScore(saved, draft) {
  const stored = String(saved?.division || "").trim();
  if (stored) return stored;
  const incoming = String(draft?.division || "").trim();
  if (incoming) return incoming;
  const text = [
    draft?.name || saved?.name || "",
    draft?.ideaDescription || saved?.ideaDescription || "",
    draft?.category || saved?.category || "",
  ].join("\n");
  return detectDivision(text) || "";
}
