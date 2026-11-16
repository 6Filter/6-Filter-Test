/**
 * Part 139 — the role words live in lib/fieldRoles.js and nowhere else.
 * Fails if any src/ or lib/ file (other than fieldRoles.js) string-literals a multi-word role label
 * or a role meaning. Importing ROLE_LABEL / ROLE_MEANING / roleLabel() is the only allowed way in.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_LABEL, ROLE_MEANING } from "../lib/fieldRoles.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const EXT = /\.(js|jsx|mjs|ts|tsx)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

/** Drop comments so a "// Not in the score" note is not a string literal. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

// The multi-word role labels (single words like "Required" / "Optional" are everyday English).
const LABELS = Object.values(ROLE_LABEL).filter((v) => /\s/.test(v));
for (const required of ["Needed for a verdict", "Changes the checks", "Not in the score", "Filled by AI"]) {
  assert.ok(LABELS.includes(required), `ROLE_LABEL still has "${required}" (update this test if the word changed)`);
}
const MEANINGS = Object.values(ROLE_MEANING);

const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "lib"))].filter(
  (f) => path.basename(f) !== "fieldRoles.js" || path.basename(path.dirname(f)) !== "lib"
);
assert.ok(files.length > 50, "scanned src/ and lib/");

const problems = [];
for (const file of files) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const code = stripComments(readFileSync(file, "utf8"));
  for (const label of LABELS) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "Label", 'Label', `Label` (whole literal) or a JSX text node >Label<
    const literal = new RegExp(`(["'\`])${esc}\\1|>\\s*${esc}\\s*<`);
    if (literal.test(code)) problems.push(`${rel}: literal role label "${label}"`);
  }
  for (const meaning of MEANINGS) {
    if (code.includes(meaning)) problems.push(`${rel}: literal role meaning "${meaning}"`);
  }
}
assert.deepEqual(problems, [], `Role words must come from lib/fieldRoles.js:\n${problems.join("\n")}`);

// Part 143 — display words come from fieldRoleDisplay.js (Required / Optional only).
// Multi-word seven-role labels still must not be hard-coded (checked above).
const badge = readFileSync(path.join(root, "src/FieldRoleBadge.jsx"), "utf8");
assert.match(badge, /from "\.\.\/lib\/fieldRoleDisplay\.js"/);
assert.match(badge, /displayRole\(/);
assert.doesNotMatch(badge, /ROLE_LABEL\[/);
assert.doesNotMatch(badge, /ROLE_MEANING\[/);
const form = readFileSync(path.join(root, "src/PropositionForm.jsx"), "utf8");
assert.match(form, /from "\.\.\/lib\/fieldRoles\.js"/);
assert.match(form, /submitBarMessageTwoLabels\(doc\)/);
const display = readFileSync(path.join(root, "lib/fieldRoleDisplay.js"), "utf8");
assert.match(display, /"Required"/);
assert.match(display, /"Optional"/);

console.log(`PASS testFieldLabelsNoHardcode — ${files.length} files, ${LABELS.length} labels, ${MEANINGS.length} meanings`);
