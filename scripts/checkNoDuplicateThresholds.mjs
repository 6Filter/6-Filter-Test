/**
 * Fails the build if a locked threshold is re-typed as a comparison literal
 * instead of being imported from lib/lockedConstants.js.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_FILE = "lib/lockedConstants.js";
const SCAN_DIRS = ["lib", "src"];
const EXT = new Set([".js", ".jsx"]);

const ALLOWLIST = new Set([
  ALLOWED_FILE,
  "lib/managerReview.js",
  "lib/mrpFormula.js",
  "lib/llmCatalog.js",
  "lib/gstRate.js",
  "src/specContent.js",
]);

const PATTERNS = [
  { label: "2.0", re: /(?:[<>]=?|===?|!==?)\s*2\.0\b|\b2\.0\s*(?:[<>]=?|===?|!==?)/g },
  { label: "60", re: /(?:[<>]=?|===?|!==?)\s*60\b|\b60\s*(?:[<>]=?|===?|!==?)/g },
  { label: "80", re: /(?:[<>]=?|===?|!==?)\s*80\b|\b80\s*(?:[<>]=?|===?|!==?)/g },
  { label: "18", re: /(?:[<>]=?|===?|!==?)\s*18\b|\b18\s*(?:[<>]=?|===?|!==?)/g },
  { label: "30", re: /(?:[<>]=?|===?|!==?)\s*30\b|\b30\s*(?:[<>]=?|===?|!==?)/g },
  { label: "1 (10g band)", re: /(?:<=|<)\s*1(?:\.0)?\b(?!\d)/g },
  { label: "12 (100g band)", re: /(?:[<>]=?|===?|!==?)\s*12\b|\b12\s*(?:[<>]=?|===?|!==?)/g },
  { label: "2000", re: /Math\.min\(\s*2000\b|\bfetchPropositionList\(\s*2000\b/g },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(name.slice(name.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const hits = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const key = rel(file);
    if (ALLOWLIST.has(key)) continue;
    const source = readFileSync(file, "utf8");
    const rawLines = source.split(/\r?\n/);
    const lines = stripComments(source).split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/\/\/\s*lock-ok:\s*\S/.test(rawLines[i] || "")) return;
      for (const { label, re } of PATTERNS) {
        re.lastIndex = 0;
        if (!re.test(line)) continue;
        if (label.startsWith("18") && key === "lib/gstRate.js") continue;
        if (label.startsWith("30") && /phase1/.test(line)) continue;
        hits.push(`${key}:${i + 1}  bare ${label}  ${line.trim()}`);
      }
    });
  }
}

if (hits.length) {
  console.error("Locked thresholds must be imported from lib/lockedConstants.js:\n");
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log("checkNoDuplicateThresholds: no bare locked literals in lib/ or src/");
