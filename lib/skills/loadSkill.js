import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentLlm } from "../llmContext.js";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

function resolveSkillsBase() {
  const fromLoader = SKILLS_ROOT;
  const fromCwd = path.join(process.cwd(), "lib/skills");
  return fs.existsSync(path.join(fromLoader, "category-intelligence", "SKILL.md"))
    ? fromLoader
    : fromCwd;
}

/**
 * Load skill markdown. Paths may be:
 * - relative to a named skill dir via loadNamedSkill("category-intelligence", "SKILL.md")
 * - or "six-filter-test/SKILL.md" style paths under lib/skills/
 * Legacy: bare "SKILL.md" still means category-intelligence/SKILL.md
 */
export function loadSkillText(...refPaths) {
  const base = resolveSkillsBase();
  return refPaths
    .map((p) => {
      const rel = String(p || "").replace(/\\/g, "/");
      const full =
        rel.includes("/")
          ? path.join(base, ...rel.split("/"))
          : path.join(base, "category-intelligence", rel);
      return fs.readFileSync(full, "utf8");
    })
    .join("\n\n---\n\n");
}

export function loadNamedSkill(dirName, ...refPaths) {
  return loadSkillText(...refPaths.map((p) => `${dirName}/${p}`));
}

export function loadSixFilterSkill() {
  return [
    loadSkillText(
      "six-filter-test/SKILL.md",
      "six-filter-test/references/filter-checklist-research.md"
    ),
    loadSkillText("category-intelligence/references/methods.md", "category-intelligence/references/sources.md"),
  ].join("\n\n---\n\n");
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

export const GROQ_TPM_LIMIT = 8000;
export const GROQ_SAFETY_MARGIN = 0.85;

export function shouldSkipGroqForSize(promptText) {
  return estimateTokens(promptText) > GROQ_TPM_LIMIT * GROQ_SAFETY_MARGIN;
}

/** Groq-only: SKILL.md core sections, no long reference files. */
export function loadSkillTextCompact(...refPaths) {
  const skillOnly = refPaths.filter((p) => /SKILL\.md$/i.test(String(p)));
  const paths = skillOnly.length ? skillOnly : refPaths.slice(0, 1);
  const raw = loadSkillText(...paths);
  const maxChars = 2800;
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n\n[compact skill — reference files omitted for Groq TPM]`;
}

export function loadSixFilterSkillCompact() {
  return loadSkillTextCompact("six-filter-test/SKILL.md");
}

export function skillTextForProvider(...refPaths) {
  return currentLlm() === "groq" ? loadSkillTextCompact(...refPaths) : loadSkillText(...refPaths);
}

export function sixFilterSkillForProvider() {
  return currentLlm() === "groq" ? loadSixFilterSkillCompact() : loadSixFilterSkill();
}

export const SOURCE_HIERARCHY_INSTRUCTION =
  "Apply the source hierarchy from the six-filter-test skill: search for a publicly-\n" +
  "cited Nielsen or Kantar figure first: DRHPs, investor decks, credit-rating\n" +
  "rationales, trade press. If none exists, use the category-intelligence engines\n" +
  "already specified above. If neither produces anything, use digital-proxy/analog-\n" +
  "transfer as a last resort. Always report a finding — state clearly which tier it\n" +
  "came from, never omit the tier, never present a tier-3 finding as if it were tier-1.";
