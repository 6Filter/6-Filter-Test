import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadSkillText(...refPaths) {
  const fromLoader = path.join(path.dirname(fileURLToPath(import.meta.url)), "category-intelligence");
  const fromCwd = path.join(process.cwd(), "lib/skills/category-intelligence");
  const base = fs.existsSync(path.join(fromLoader, "SKILL.md")) ? fromLoader : fromCwd;
  return refPaths
    .map((p) => fs.readFileSync(path.join(base, p), "utf8"))
    .join("\n\n---\n\n");
}
