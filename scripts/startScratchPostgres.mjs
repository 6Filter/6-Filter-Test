/**
 * Start a scratch Postgres on 127.0.0.1 only.
 * Never reads DATABASE_URL. Refuses any host that is not local or private.
 *
 *   npm run scratch-postgres
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
 */
import { spawn } from "node:child_process";

const BIND_HOST = "127.0.0.1";
const PORT = "5433";

function hostAllowed(host) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

const requested = process.argv.slice(2).find((arg) => !arg.startsWith("-")) || "";
if (requested) {
  let host = requested;
  try {
    host = new URL(requested).hostname || requested;
  } catch {
    host = requested;
  }
  if (!hostAllowed(host) || /render\.com|neon\.tech|supabase\.co/i.test(requested)) {
    console.error("Refusing to start: host is not local or a private scratch database.");
    process.exit(1);
  }
}

if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  console.error("Ignoring DATABASE_URL. Scratch Postgres binds to 127.0.0.1 only.");
}

const env = { ...process.env };
delete env.DATABASE_URL;
delete env.POSTGRES_URL;

console.log(`TEST_DATABASE_URL=postgresql://postgres:postgres@${BIND_HOST}:${PORT}/postgres`);

const child = spawn(
  "npx",
  ["--yes", "@electric-sql/pglite-socket", "--host", BIND_HOST, "--port", PORT, "--max-connections", "20"],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);

child.on("exit", (code) => process.exit(code ?? 1));
