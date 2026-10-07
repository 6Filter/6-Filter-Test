/**
 * Run every scripts/test*.mjs file and report every failure.
 * A live-key script is named manual-*.mjs so this glob skips it.
 */
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
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

console.log(`\n${files.length} test scripts passed.`);
