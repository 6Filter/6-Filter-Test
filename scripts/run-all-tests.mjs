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
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const files = readdirSync(scriptsDir)
  .filter((name) => /^test.*\.mjs$/i.test(name))
  .sort();

if (!files.length) {
  console.error("No test scripts found.");
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(scriptsDir, file)], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) failures.push(file);
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
