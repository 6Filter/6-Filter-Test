/**
 * The supplied verifyDatabaseCopy.mjs: --timestamps ms and --ignore-table.
 * Needs TEST_DATABASE_URL on the scratch server. Never prints a connection string.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

const url = String(process.env.TEST_DATABASE_URL || "").trim();
if (!url) {
  console.log("SKIP testVerifyDatabaseCopy — TEST_DATABASE_URL is not set");
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(url)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  [" + detail + "]" : ""}`);
  if (!ok) failed += 1;
};

const id = randomBytes(6).toString("hex");
const src = `vdc_src_${id}`;
const tgt = `vdc_tgt_${id}`;
const ident = (name) => {
  if (!/^vdc_(src|tgt)_[a-f0-9]{12}$/.test(name)) throw new Error("unexpected schema");
  return `"${name}"`;
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query("SET default_transaction_read_only = off");
await admin.query(`CREATE SCHEMA ${ident(src)}`);
await admin.query(`CREATE SCHEMA ${ident(tgt)}`);
await admin.query(`CREATE TABLE ${ident(src)}.items (id serial PRIMARY KEY, name text, created_at timestamptz)`);
await admin.query(`CREATE TABLE ${ident(src)}.backup_exports (id serial PRIMARY KEY, note text)`);
await admin.query(`INSERT INTO ${ident(src)}.items (name, created_at) VALUES ('one', '2026-01-01 12:00:00.435971+00')`);
await admin.query(`INSERT INTO ${ident(src)}.backup_exports (note) VALUES ('src-only')`);
await admin.query(`CREATE TABLE ${ident(tgt)}.items (id serial PRIMARY KEY, name text, created_at timestamptz)`);
await admin.query(`CREATE TABLE ${ident(tgt)}.backup_exports (id serial PRIMARY KEY, note text)`);
await admin.query(`INSERT INTO ${ident(tgt)}.items (name, created_at) VALUES ('one', '2026-01-01 12:00:00.435+00')`);
await admin.query(`INSERT INTO ${ident(tgt)}.backup_exports (note) VALUES ('src-only')`);
await admin.query(`INSERT INTO ${ident(tgt)}.backup_exports (note) VALUES ('extra')`);
await admin.query(`SELECT setval(pg_get_serial_sequence('${src}.items', 'id'), 1, true)`);
await admin.query(`SELECT setval(pg_get_serial_sequence('${tgt}.backup_exports', 'id'), 2, true)`);

function runHere(args) {
  const r = spawnSync(process.execPath, ["scripts/verifyDatabaseCopy.mjs", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const sameUrl = url;
const raw = runHere(["--source", sameUrl, "--target", sameUrl, "--source-schema", src, "--target-schema", tgt]);
await admin.query("SET default_transaction_read_only = off");
check(
  "without flags a microsecond timestamp and an extra backup_exports row are reported as different",
  raw.code === 1 && /DATA DIFFERS/.test(raw.out) && /backup_exports/.test(raw.out),
  `exit ${raw.code}`
);

const flagged = runHere([
  "--source", sameUrl,
  "--target", sameUrl,
  "--source-schema", src,
  "--target-schema", tgt,
  "--timestamps", "ms",
  "--ignore-table", "backup_exports",
]);
await admin.query("SET default_transaction_read_only = off");
check(
  "--timestamps ms and --ignore-table backup_exports report ALL MATCH",
  flagged.code === 0 && /RESULT: ALL MATCH/.test(flagged.out) && /millisecond/.test(flagged.out),
  `exit ${flagged.code}`
);
await admin.query(`DROP SCHEMA IF EXISTS ${ident(src)} CASCADE`);
await admin.query(`DROP SCHEMA IF EXISTS ${ident(tgt)} CASCADE`);
await admin.end();

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS testVerifyDatabaseCopy");
process.exit(failed ? 1 : 0);
