import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export function loadNamedSkill(dirName, ...refPaths) {
  const fromLoader = path.join(SKILLS_ROOT, dirName);
  const fromCwd = path.join(process.cwd(), "lib/skills", dirName);
  const base = fs.existsSync(path.join(fromLoader, "SKILL.md")) ? fromLoader : fromCwd;
  return refPaths
    .map((p) => fs.readFileSync(path.join(base, p), "utf8"))
    .join("\n\n---\n\n");
}

export function loadSkillText(...refPaths) {
  return loadNamedSkill("category-intelligence", ...refPaths);
}

export function loadSixFilterSkill() {
  return [
    loadNamedSkill(
      "six-filter-test",
      "SKILL.md",
      "references/nielsen-kantar.md",
      "references/filter-evidence.md",
      "references/playbook-formulas.md"
    ),
    loadNamedSkill("category-intelligence", "references/sources.md"),
  ].join("\n\n---\n\n");
}
