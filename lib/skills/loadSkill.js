import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function loadCategoryIntelligenceSkill() {
  return loadSkillText(
    "category-intelligence/SKILL.md",
    "category-intelligence/references/methods.md",
    "category-intelligence/references/sources.md",
    "category-intelligence/references/competition.md"
  );
}

export function loadSixFilterSkill() {
  return [
    loadSkillText(
      "six-filter-test/SKILL.md",
      "six-filter-test/references/filter-checklist-research.md"
    ),
    loadCategoryIntelligenceSkill(),
  ].join("\n\n---\n\n");
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

export function skillTextForProvider(...refPaths) {
  return loadSkillText(...refPaths);
}

export function sixFilterSkillForProvider() {
  return loadSixFilterSkill();
}

export function isCachedSkillSystem(value) {
  return Boolean(value && typeof value === "object" && value.type === "cached-skill-system");
}

/** Skill markdown as its own Anthropic cacheable block; task text stays uncached. */
export function cachedSkillSystem(skillText, taskText) {
  return {
    type: "cached-skill-system",
    skillText: String(skillText || ""),
    taskText: String(taskText || ""),
  };
}

export function flattenSkillSystem(system) {
  if (isCachedSkillSystem(system)) {
    return [system.skillText, system.taskText].filter((s) => String(s || "").trim()).join("\n\n---\n\n");
  }
  return String(system || "");
}

export function anthropicSystemBlocks(system) {
  if (isCachedSkillSystem(system) && String(system.skillText || "").trim()) {
    const blocks = [
      {
        type: "text",
        text: system.skillText,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (String(system.taskText || "").trim()) {
      blocks.push({ type: "text", text: system.taskText });
    }
    return blocks;
  }
  const flat = flattenSkillSystem(system);
  return flat ? flat : undefined;
}

export function sixFilterChecklistSkill() {
  return skillTextForProvider(
    "six-filter-test/SKILL.md",
    "six-filter-test/references/filter-checklist-research.md"
  );
}

export function sixFilterChecklistSystem(taskText) {
  return cachedSkillSystem(sixFilterChecklistSkill(), taskText);
}

export function sixFilterFullSystem(taskText) {
  return cachedSkillSystem(sixFilterSkillForProvider(), taskText);
}

export const SOURCE_HIERARCHY_INSTRUCTION =
  "Apply the source hierarchy from the six-filter-test skill: search for a publicly-\n" +
  "cited Nielsen or Kantar figure first: DRHPs, investor decks, credit-rating\n" +
  "rationales, trade press. If none exists, use the category-intelligence engines\n" +
  "already specified above. If neither produces anything, use digital-proxy/analog-\n" +
  "transfer as a last resort. Always report a finding — state clearly which tier it\n" +
  "came from, never omit the tier, never present a tier-3 finding as if it were tier-1.";
