/**
 * The 8 Oct restored copy lives in the database primus_restored.
 * Readers set the session read-only and refuse to continue if a write succeeds.
 * The file under data/backups is the source for a rebuild. It is not the database tests use.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const RESTORED_BACKUP_STAMP = "20261008T093325Z";
export const RESTORED_DATABASE = "primus_restored";
export const RESTORED_ROW_COUNT = 96;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function restoredBackupFile() {
  return path.join(root, "data", "backups", RESTORED_BACKUP_STAMP, "propositions.jsonl");
}

export function restoredDatabaseUrl(raw = process.env.RESTORED_DATABASE_URL || process.env.TEST_DATABASE_URL || "") {
  const text = String(raw || "").trim();
  if (!text) throw new Error("TEST_DATABASE_URL is not set. The restored copy is on the scratch server.");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("Restored database URL is not valid.");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Refusing to open the restored copy on a non-local host.");
  }
  url.pathname = `/${RESTORED_DATABASE}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  if (value == null || value === "") return "";
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return JSON.stringify(sortKeys(parsed));
}

export function isoTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

const CHECKSUM_FIELDS = [
  "id",
  "name",
  "category",
  "division",
  "idea_description",
  "submitter_name",
  "submitter_department",
  "research_run_at",
  "f1_json",
  "f2_json",
  "f3_json",
  "f4_json",
  "f5_json",
  "f6_json",
  "research_findings_json",
  "go_nogo_json",
];

function plainValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (Array.isArray(value)) return value.map(plainValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, plainValue(value[key])]));
  }
  return value;
}

export function checksumTableRows(rows) {
  const hash = createHash("sha256");
  const lines = rows.map((row) => JSON.stringify(plainValue(row))).sort();
  for (const line of lines) {
    hash.update(line);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export async function checksumSchemaTables(client) {
  const tables = (
    await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
  ).rows;
  const out = {};
  for (const { table_name: name } of tables) {
    if (!/^[a-z0-9_]+$/.test(name)) continue;
    const rows = (await client.query(`SELECT * FROM ${name}`)).rows;
    out[name] = { rows: rows.length, checksum: checksumTableRows(rows) };
  }
  return out;
}

export function checksumRows(rows) {
  const hash = createHash("sha256");
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const row of sorted) {
    for (const field of CHECKSUM_FIELDS) {
      if (field.endsWith("_json")) hash.update(stableJson(row[field]));
      else if (field === "research_run_at") hash.update(isoTime(row[field]));
      else hash.update(String(row[field] ?? ""));
      hash.update("\0");
    }
    hash.update("\n");
  }
  return hash.digest("hex");
}

export async function readBackupRows() {
  const rows = [];
  const rl = createInterface({ input: createReadStream(restoredBackupFile()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

export function restoredIdsFromBackup() {
  const ids = [];
  for (const line of readFileSync(restoredBackupFile(), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    ids.push(JSON.parse(line).id);
  }
  return ids;
}

export async function withRestoredClient(fn) {
  const client = new pg.Client({ connectionString: restoredDatabaseUrl() });
  await client.connect();
  await client.query("SET search_path TO primus_restored");
  await client.query("SET default_transaction_read_only = on");
  try {
    await client.query("CREATE TEMP TABLE primus_restored_probe (id int)");
    throw new Error("Restored copy accepted a write.");
  } catch (error) {
    if (error.message === "Restored copy accepted a write.") throw error;
    if (!/read-only|read only/i.test(String(error.message || ""))) throw error;
  }
  try {
    return await fn(client);
  } finally {
    try {
      await client.query("SET default_transaction_read_only = off");
    } catch {
      /* the shared scratch backend must not stay read-only */
    }
    await client.end();
  }
}

export async function readRestoredTable() {
  return withRestoredClient(async (client) => {
    const rows = (await client.query(`SELECT * FROM propositions ORDER BY id`)).rows;
    return rows.map((row) => ({
      ...row,
      research_run_at: row.research_run_at ? isoTime(row.research_run_at) : null,
      created_at: row.created_at ? isoTime(row.created_at) : null,
      updated_at: row.updated_at ? isoTime(row.updated_at) : null,
    }));
  });
}
