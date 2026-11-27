/**
 * Every verdict shows its level and basis (owner approval 27 Nov 2026).
 * Example: "GO at Level 1 - Rookie (typed answers accepted, not web-verified)"
 */
import { difficultyFromDoc, difficultyMeta } from "./difficultyLevel.js";

function hasExplicitLevel(doc = {}) {
  if (!doc || typeof doc !== "object") return false;
  if (
    Object.prototype.hasOwnProperty.call(doc, "screeningDifficulty") &&
    doc.screeningDifficulty != null &&
    doc.screeningDifficulty !== ""
  ) {
    return true;
  }
  const findings = doc.researchFindings;
  return Boolean(
    findings &&
      typeof findings === "object" &&
      Object.prototype.hasOwnProperty.call(findings, "screeningDifficulty") &&
      findings.screeningDifficulty != null &&
      findings.screeningDifficulty !== ""
  );
}

function levelLabel(doc = {}) {
  if (!hasExplicitLevel(doc)) return "Before levels";
  return difficultyMeta(difficultyFromDoc(doc)).label;
}

export function verdictBasisForLevel(doc = {}) {
  if (!hasExplicitLevel(doc)) {
    return "before levels — stored rules at the time of screening";
  }
  const level = difficultyFromDoc(doc);
  if (level <= 1) return "typed answers accepted, not web-verified";
  if (level === 2) return "typed answers and local rules; soft-pass slots are not web-verified";
  return "web-checked where this level requires it";
}

/** Full line for page, Log, PDF, export. */
export function verdictWithLevelBasis(classification, doc = {}) {
  const band = String(classification || "").trim().toUpperCase();
  if (!band || !/^(GO|NO-GO|WATCH)$/.test(band)) return "";
  const level = levelLabel(doc);
  const basis = verdictBasisForLevel(doc);
  return `${band} at ${level} (${basis})`;
}
