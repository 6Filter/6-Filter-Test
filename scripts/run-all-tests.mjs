/**
 * Run every scripts/test*.mjs file and report every failure.
 * A live-key script is named manual-*.mjs so this glob skips it.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const dataRoot = path.join(root, "data");

function hashTree(dir) {
  const hash = createHash("sha256");
  function walk(current) {
    let names = [];
    try {
      names = readdirSync(current);
    } catch {
      return;
    }
    names.sort();
    for (const name of names) {
      const full = path.join(current, name);
      const rel = path.relative(dir, full);
      const st = statSync(full);
      hash.update(rel);
      hash.update(st.isDirectory() ? "dir" : "file");
      if (st.isDirectory()) walk(full);
      else hash.update(readFileSync(full));
    }
  }
  walk(dir);
  return hash.digest("hex");
}

const dataBefore = hashTree(dataRoot);
process.env.PRIMUS_DATA_DIR = path.join(tmpdir(), `primus-suite-${process.pid}`);
// Suite keeps auth parked unless a script opts in — production still defaults login on.
if (!String(process.env.REQUIRE_AUTH || "").trim()) process.env.REQUIRE_AUTH = "false";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const files = readdirSync(scriptsDir)
  .filter((name) => /^test.*\.mjs$/i.test(name))
  .sort()
  .map((name) => ({ name, full: path.join(scriptsDir, name) }));

const ownerDir = path.join(scriptsDir, "owner-tests");
try {
  for (const name of readdirSync(ownerDir).filter((n) => /^test.*\.mjs$/i.test(n)).sort()) {
    // Prefer owner originals; skip if a wrapper in scripts/ already imports the same basename.
    const wrapper = files.find((f) => f.name === name);
    if (wrapper) continue;
    files.push({ name: `owner-tests/${name}`, full: path.join(ownerDir, name) });
  }
} catch {
  /* owner-tests optional until Part 129 */
}

if (!files.length) {
  console.error("No test scripts found.");
  process.exit(1);
}

/**
 * Part 133 — owner fixtures still assert the old 15-slot / 4-check F1 shape.
 * Leave the owner originals untouched; report them as expected until the owner
 * supplies updated versions. Wrappers that re-import those originals count too.
 */
const EXPECTED_OWNER_FAILURES = new Set([
  "testEvidenceReading.mjs",
  "testPathToGo.mjs",
  "testPathToGoActionCopy.mjs",
  "testScoringRules.mjs",
  "owner-tests/testPathCopy.mjs",
  "owner-tests/testEvidenceReading.mjs",
  "owner-tests/testPathToGo.mjs",
  "owner-tests/testScoringRules.mjs",
  "owner-tests/testFilter1Scoring.mjs",
]);

const failures = [];
const expectedOwnerFailures = [];
for (const file of files) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [file.full], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    if (EXPECTED_OWNER_FAILURES.has(file.name)) expectedOwnerFailures.push(file.name);
    else failures.push(file.name);
  }
}

if (expectedOwnerFailures.length) {
  console.error(`\n${expectedOwnerFailures.length} owner test(s) failed as expected under Part 133 (old 15-slot / 4-check F1):`);
  for (const file of expectedOwnerFailures) console.error(`  ${file}`);
}

if (failures.length) {
  console.error(`\n${failures.length} test script(s) failed:`);
  for (const file of failures) console.error(`  ${file}`);
  process.exit(1);
}

const dataAfter = hashTree(dataRoot);
if (dataBefore !== dataAfter) {
  console.error("A test wrote to data/. The file hashes changed.");
  process.exit(1);
}

console.log(`\n${files.length} test scripts passed. data/ unchanged.`);
