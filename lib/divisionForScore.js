import { detectDivision } from "./npdMaster.js";

function textOf(source, key) {
  return String(source?.[key] || "").trim();
}

/** Idea text used only to pick a division when neither copy already has one. */
export function ideaTextForDivision(saved, incoming) {
  const parts = [];
  for (const source of [incoming, saved]) {
    if (!source || typeof source !== "object") continue;
    for (const key of ["name", "category", "ideaDescription"]) {
      const value = textOf(source, key);
      if (value && !parts.includes(value)) parts.push(value);
    }
  }
  return parts.join("\n");
}

/**
 * One division for every score of the same idea.
 * Stored wins, then the division on this request, then the keyword match.
 * Callers that only read a score must not write this value back.
 */
export function divisionForScore(saved, incoming) {
  const stored = textOf(saved, "division");
  if (stored) return stored;
  const fromRequest = textOf(incoming, "division");
  if (fromRequest) return fromRequest;
  return detectDivision(ideaTextForDivision(saved, incoming)) || "";
}
