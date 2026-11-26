/**
 * Screening difficulty (Rookie → Apprentice → Professional → …).
 * Browser-safe: no I/O beyond localStorage.
 * The sealed score still only moves on Submit; this only chooses which ease rules run.
 */
import { GST_STANDARD_RATES } from "./lockedConstants.js";
import { parsePackSize } from "./packSize.js";

export const DIFFICULTY_LEVELS = Object.freeze({
  1: Object.freeze({ level: 1, name: "Rookie", label: "Level 1 - Rookie" }),
  2: Object.freeze({ level: 2, name: "Apprentice", label: "Level 2 - Apprentice" }),
  3: Object.freeze({ level: 3, name: "Professional", label: "Level 3 - Professional" }),
});

export const DIFFICULTY_CHOICES = Object.freeze([1, 2, 3]);

const STORAGE_KEY = "primus.screeningDifficulty";
const PROMPT_KEY = "primus.readyForLevel2Dismissed";
const PROMPT3_KEY = "primus.readyForLevel3Dismissed";

function norm(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeDifficulty(value) {
  const n = Number(value);
  if (n === 3) return 3;
  if (n === 2) return 2;
  return 1;
}

export function difficultyMeta(level) {
  return DIFFICULTY_LEVELS[normalizeDifficulty(level)] || DIFFICULTY_LEVELS[1];
}

export function difficultyFromDoc(doc = {}) {
  return normalizeDifficulty(
    doc?.screeningDifficulty ?? doc?.researchFindings?.screeningDifficulty ?? 1
  );
}

export function readStoredDifficulty(email = "") {
  if (typeof localStorage === "undefined") return 1;
  try {
    const key = email ? `${STORAGE_KEY}:${String(email).toLowerCase()}` : STORAGE_KEY;
    return normalizeDifficulty(localStorage.getItem(key));
  } catch {
    return 1;
  }
}

export function writeStoredDifficulty(level, email = "") {
  if (typeof localStorage === "undefined") return;
  try {
    const key = email ? `${STORAGE_KEY}:${String(email).toLowerCase()}` : STORAGE_KEY;
    localStorage.setItem(key, String(normalizeDifficulty(level)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLevel2PromptDismissed(email = "") {
  if (typeof localStorage === "undefined") return false;
  try {
    const key = email ? `${PROMPT_KEY}:${String(email).toLowerCase()}` : PROMPT_KEY;
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeLevel2PromptDismissed(dismissed, email = "") {
  if (typeof localStorage === "undefined") return;
  try {
    const key = email ? `${PROMPT_KEY}:${String(email).toLowerCase()}` : PROMPT_KEY;
    if (dismissed) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readLevel3PromptDismissed(email = "") {
  if (typeof localStorage === "undefined") return false;
  try {
    const key = email ? `${PROMPT3_KEY}:${String(email).toLowerCase()}` : PROMPT3_KEY;
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeLevel3PromptDismissed(dismissed, email = "") {
  if (typeof localStorage === "undefined") return;
  try {
    const key = email ? `${PROMPT3_KEY}:${String(email).toLowerCase()}` : PROMPT3_KEY;
    if (dismissed) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Stamp the chosen level onto the idea so Submit seals with the same rules. */
export function withScreeningDifficulty(doc = {}, level) {
  const nextLevel = normalizeDifficulty(level);
  const findings =
    doc?.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  return {
    ...doc,
    screeningDifficulty: nextLevel,
    researchFindings: { ...findings, screeningDifficulty: nextLevel },
  };
}

export function packSizeClearsLevel2(grammage) {
  return parsePackSize(grammage).ok === true;
}

export function gstClearsLevel2(gstRatePct) {
  if (gstRatePct == null || String(gstRatePct).trim() === "") return false;
  const n = Number(gstRatePct);
  if (!Number.isFinite(n) || n < 0) return false;
  return GST_STANDARD_RATES.some((rate) => Number(rate) === n);
}

/**
 * Level 2 volume-loss note: how price is held for five years, and why loss stays inside 10%.
 */
export function volumeLossNoteClearsLevel2(note) {
  const text = norm(note).toLowerCase();
  if (!text) return false;
  const years = /(?:5|five)[\s-]*years?/.test(text);
  const ten = /(?:10\s*%|10\s*percent|ten\s*percent)/.test(text);
  const price = /\b(price|shelf|mrp|held|flat|inflation)\b/.test(text);
  return years && ten && price;
}
