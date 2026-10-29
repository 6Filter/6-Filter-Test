/**
 * Fresh-clone CI dry run (matches Scoring Regression Suite without Postgres):
 *   git clone <repo> <tmpdir> && cd <tmpdir> && npm ci && npm run test:regression
 *
 * Uses a local clone of HEAD so unpushed commits are covered. Clears DATABASE_URL /
 * TEST_DATABASE_URL / REQUIRE_POSTGRES_TESTS so the run matches GitHub Actions.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cloneDir = mkdtempSync(path.join(tmpdir(), "primus-ci-dry-"));

function run(cmd, args, { cwd, env } = {}) {
  console.log(`ci-dry-run: ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: cwd || root,
    env: env || process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

const cleanEnv = { ...process.env };
for (const key of [
  "DATABASE_URL",
  "POSTGRES_URL",
  "TEST_DATABASE_URL",
  "RESTORED_DATABASE_URL",
  "REQUIRE_POSTGRES_TESTS",
  "PRIMUS_SCHEMA",
  "PRIMUS_DATA_DIR",
]) {
  delete cleanEnv[key];
}

let code = 1;
try {
  code = run("git", ["clone", "--local", "--no-hardlinks", root, cloneDir]);
  if (code !== 0) {
    console.error("ci-dry-run: git clone failed");
    process.exit(code);
  }
  code = run("npm", ["ci"], { cwd: cloneDir, env: cleanEnv });
  if (code !== 0) {
    console.error("ci-dry-run: npm ci failed");
    process.exit(code);
  }
  code = run("npm", ["run", "test:regression"], { cwd: cloneDir, env: cleanEnv });
  if (code !== 0) {
    console.error("ci-dry-run: test:regression failed (this is what CI would fail on)");
    process.exit(code);
  }
  console.log("PASS ci-dry-run — fresh clone regression matches CI (no Postgres)");
  process.exit(0);
} finally {
  try {
    rmSync(cloneDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}
