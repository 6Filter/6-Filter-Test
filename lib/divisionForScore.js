/**
 * Division used only to score. An explicit division wins.
 * Otherwise the same keyword match Submit uses when the model is unavailable.
 * Never writes the row — a read must not change the stored division.
 */
import { detectDivision } from "./npdMaster.js";

export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  const text = [doc?.name, doc?.ideaDescription, doc?.category]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) return "";
  return detectDivision(text) || "";
}
