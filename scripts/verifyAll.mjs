/**
 * Phase 0 entry point. Runs the supplied coverage gate when it is present.
 * Does not change application behaviour and does not invent a passing result.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "scripts", "coverage", "testCoverageMap.mjs");
const inventory = path.join(root, "scripts", "coverage", "inventory.mjs");

const missing = [gate, inventory].filter((file) => !existsSync(file));
if (missing.length) {
  console.error("verify:all cannot run the coverage gate. These supplied files are not in the repo:");
  for (const file of missing) console.error("  " + path.relative(root, file));
  console.error("Place the owner's copies in scripts/coverage/ and run npm run verify:all again.");
  process.exit(1);
}

const run = spawnSync(process.execPath, [gate], { cwd: root, stdio: "inherit" });
process.exit(run.status ?? 1);
