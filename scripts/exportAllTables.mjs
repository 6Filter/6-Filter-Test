/**
 * Read-only export of every application table except research_cache.
 * node scripts/exportAllTables.mjs [--exclude-secrets] [--out data/backups/<stamp>]
 *
 * Never prints idea text. With secrets included, prints one storage warning.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { excludedTables, safeIdent, selectExportTables } from "../lib/backupPlan.js";
import { rewriteRenderDatabaseUrl } from "../lib/db.js";

const SCHEMA_VERSION = "1";
const SECRET_WARNING =
  "This export contains password hashes and encrypted keys. Store it encrypted. Never commit it or paste it anywhere.";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function gitIgnored(target) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", target], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitCommit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    let dirty = false;
    try {
      const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
      dirty = status.trim().length > 0;
    } catch {
      dirty = true;
    }
    return { commit, dirty };
  } catch {
    return { commit: "unknown", dirty: true };
  }
}

function jsonValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return { _bytea: value.toString("base64") };
  return value;
}

loadEnv(".env.local");

const excludeSecrets = process.argv.includes("--exclude-secrets");
const outDir = path.resolve(argValue("--out") || path.join("data", "backups", stamp()));
if (!gitIgnored(outDir)) {
  console.error("Refusing to export: the output folder is not gitignored.");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const connectionString = rewriteRenderDatabaseUrl(rawUrl);
const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 20000,
  ssl: /render\.com|neon\.tech/i.test(connectionString) ? { rejectUnauthorized: false } : false,
});

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const mode = await client.query("SHOW transaction_read_only");
  if (String(mode.rows[0]?.transaction_read_only) !== "on") {
    throw new Error("Export transaction is not read-only.");
  }
  const found = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const names = selectExportTables(
    found.rows.map((row) => row.table_name),
    { excludeSecrets }
  );
  await mkdir(outDir, { recursive: true });
  const tables = [];
  for (const name of names) {
    const table = safeIdent(name);
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    const columnNames = columns.rows.map((row) => safeIdent(row.column_name));
    const selected = columnNames.map((column) => `"${column}"`).join(", ");
    const data = await client.query(`SELECT ${selected} FROM "${table}"`);
    const lines = data.rows.map((row) => {
      const record = {};
      for (const column of columnNames) record[column] = jsonValue(row[column]);
      return JSON.stringify(record);
    });
    const body = lines.length ? `${lines.join("\n")}\n` : "";
    const file = `${table}.jsonl`;
    await writeFile(path.join(outDir, file), body);
    tables.push({
      name: table,
      rows: data.rows.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      file,
    });
    console.log(`${table}=${data.rows.length}`);
  }
  await client.query("COMMIT");
  const git = gitCommit();
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    commit: git.commit,
    dirty: git.dirty,
    exportedAt: new Date().toISOString(),
    excluded: excludedTables({ excludeSecrets }),
    tables,
  };
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`export=${outDir} tables=${tables.length}`);
  if (!excludeSecrets) console.log(SECRET_WARNING);
} catch (error) {
  try { await client.query("ROLLBACK"); } catch { /* ignore */ }
  console.error(String(error.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
