/**
 * Fast restore for migration only. Same guarantees as importExport.mjs:
 * refuses non-empty propositions; never prints secrets/idea text.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { assertEmptyPropositions, importOrder, safeIdent } from "../lib/backupPlan.js";
import { rewriteRenderDatabaseUrl, initDb, query } from "../lib/db.js";

const folder = path.resolve(process.argv[2] || "");
if (!folder) {
  console.error("Usage: node scripts/_fastImportExport.mjs <backup-folder>");
  process.exit(1);
}
const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const BATCH = Number(process.env.IMPORT_BATCH || 100);
const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"));
const tables = importOrder((manifest.tables || []).map((table) => safeIdent(table.name)));
const expected = new Map((manifest.tables || []).map((table) => [table.name, table]));

await initDb();
const existing = await query(`SELECT COUNT(*)::int AS n FROM propositions`);
assertEmptyPropositions(existing[0]?.n);

const connectionString = rewriteRenderDatabaseUrl(rawUrl);
const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 30000,
  ssl: /render\.com|neon\.tech/i.test(connectionString) ? { rejectUnauthorized: false } : false,
});
const client = await pool.connect();

function normalize(value) {
  if (value && typeof value === "object" && value._bytea) return Buffer.from(value._bytea, "base64");
  return value;
}

try {
  await client.query("BEGIN");
  for (const name of [...tables].reverse()) {
    await client.query(`DELETE FROM "${safeIdent(name)}"`);
  }

  for (const name of tables) {
    const table = safeIdent(name);
    const meta = expected.get(table);
    const raw = await readFile(path.join(folder, meta.file), "utf8");
    const lines = raw.split(/\n/).filter((line) => line.trim());
    if (lines.length !== meta.rows) {
      throw new Error(`${table} file has ${lines.length} lines; manifest says ${meta.rows}.`);
    }
    if (!lines.length) {
      console.log(`${table}=0`);
      continue;
    }

    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    const have = new Set(columns.rows.map((row) => row.column_name));

    const records = lines.map((line) => JSON.parse(line));
    const keys = [...new Set(records.flatMap((r) => Object.keys(r)))].filter((k) => have.has(k));
    for (const record of records) {
      for (const column of Object.keys(record)) {
        if (!have.has(column)) throw new Error(`target table ${table} has no column ${column}.`);
      }
    }
    if (!keys.length) continue;

    const quoted = keys.map((column) => `"${safeIdent(column)}"`).join(", ");
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const values = [];
      const placeholders = chunk
        .map((record, rowIndex) => {
          const base = rowIndex * keys.length;
          const parts = keys.map((key, colIndex) => {
            values.push(normalize(record[key]));
            return `$${base + colIndex + 1}`;
          });
          return `(${parts.join(", ")})`;
        })
        .join(", ");
      await client.query(`INSERT INTO "${table}" (${quoted}) VALUES ${placeholders}`, values);
    }
    console.log(`${table}=${records.length}`);
  }

  for (const name of tables) {
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM "${safeIdent(name)}"`);
    const got = Number(count.rows[0]?.n) || 0;
    const want = expected.get(name).rows;
    if (got !== want) throw new Error(`${name} count ${got} does not match manifest ${want}.`);
  }
  await client.query("COMMIT");
  console.log(`import=${folder} tables=${tables.length} ok`);
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error(String(error.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
