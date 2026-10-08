/**
 * Load an export into an EMPTY database. Refuses when propositions has rows.
 * node scripts/importExport.mjs data/backups/<timestamp>
 *
 * Never prints idea text. Never targets a database that already has propositions.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertEmptyPropositions, importOrder, safeIdent } from "../lib/backupPlan.js";

const folder = path.resolve(process.argv[2] || "");
if (!folder || process.argv[2] == null) {
  console.error("Usage: node scripts/importExport.mjs <backup-folder>");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"));
const tables = importOrder((manifest.tables || []).map((table) => safeIdent(table.name)));
const expected = new Map((manifest.tables || []).map((table) => [table.name, table]));

const { initDb, query } = await import("../lib/db.js");
await initDb();

const existing = await query(`SELECT COUNT(*)::int AS n FROM propositions`);
assertEmptyPropositions(existing[0]?.n);

const { default: pg } = await import("pg");
const { rewriteRenderDatabaseUrl } = await import("../lib/db.js");
const connectionString = rewriteRenderDatabaseUrl(rawUrl);
const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 20000,
  ssl: /render\.com|neon\.tech/i.test(connectionString) ? { rejectUnauthorized: false } : false,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const name of [...tables].reverse()) {
    const table = safeIdent(name);
    await client.query(`DELETE FROM "${table}"`);
  }
  for (const name of tables) {
    const table = safeIdent(name);
    const meta = expected.get(table);
    const raw = await readFile(path.join(folder, meta.file), "utf8");
    const lines = raw.split(/\n/).filter((line) => line.trim());
    if (lines.length !== meta.rows) {
      throw new Error(`${table} file has ${lines.length} lines; manifest says ${meta.rows}.`);
    }
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    const have = new Set(columns.rows.map((row) => row.column_name));
    for (const line of lines) {
      const record = JSON.parse(line);
      for (const column of Object.keys(record)) {
        if (!have.has(column)) throw new Error(`target table ${table} has no column ${column}.`);
      }
      const keys = Object.keys(record);
      if (!keys.length) continue;
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
      const quoted = keys.map((column) => `"${safeIdent(column)}"`).join(", ");
      const values = keys.map((column) => {
        const value = record[column];
        if (value && typeof value === "object" && value._bytea) return Buffer.from(value._bytea, "base64");
        return value;
      });
      await client.query(
        `INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`,
        values
      );
    }
  }
  for (const name of tables) {
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM "${safeIdent(name)}"`);
    const got = Number(count.rows[0]?.n) || 0;
    const want = expected.get(name).rows;
    if (got !== want) throw new Error(`${name} count ${got} does not match manifest ${want}.`);
    console.log(`${name}=${got}`);
  }
  await client.query("COMMIT");
  console.log(`import=${folder} tables=${tables.length}`);
} catch (error) {
  try { await client.query("ROLLBACK"); } catch { /* ignore */ }
  console.error(String(error.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
