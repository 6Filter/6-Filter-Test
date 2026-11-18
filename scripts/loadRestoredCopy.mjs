/**
 * Rebuild the primus_restored schema from the 8 Oct backup.
 * Sessions that read it set default_transaction_read_only.
 * The restored ids are removed from public so the test suite can proceed.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres node scripts/loadRestoredCopy.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  RESTORED_DATABASE,
  RESTORED_ROW_COUNT,
  checksumRows,
  checksumSchemaTables,
  readBackupRows,
} from "./restoredCopy.mjs";

const adminText = String(process.env.TEST_DATABASE_URL || "").trim();
if (!adminText) {
  console.error("TEST_DATABASE_URL is not set.");
  process.exit(1);
}

const rows = await readBackupRows();
if (rows.length !== RESTORED_ROW_COUNT) {
  console.error(`Backup row count is ${rows.length}. Expected ${RESTORED_ROW_COUNT}.`);
  process.exit(1);
}
const fileChecksum = checksumRows(rows);
const ids = rows.map((row) => row.id);

const admin = new pg.Client({ connectionString: adminText });
await admin.connect();
await admin.query(`DROP SCHEMA IF EXISTS ${RESTORED_DATABASE} CASCADE`);
await admin.query(`CREATE SCHEMA ${RESTORED_DATABASE}`);
await admin.end();

process.env.DATABASE_URL = adminText;
process.env.PRIMUS_SCHEMA = RESTORED_DATABASE;
delete process.env.POSTGRES_URL;
const db = await import("../lib/db.js");
await db.initDb();
await db.closeDatabase();

const columns = [
  "id",
  "name",
  "category",
  "division",
  "final_verdict",
  "final_verdict_note",
  "f1_json",
  "f2_json",
  "f3_json",
  "f4_json",
  "f5_json",
  "f6_json",
  "version",
  "created_at",
  "updated_at",
  "idea_description",
  "attachment_json",
  "research_run_at",
  "research_findings_json",
  "proof_json",
  "go_nogo_json",
  "research_duration_ms",
  "submitter_name",
  "submitter_department",
  "manager_review_json",
  "final_summary_json",
  "created_by_user_id",
];
const writer = new pg.Client({ connectionString: adminText });
await writer.connect();
await writer.query(`SET search_path TO ${RESTORED_DATABASE}`);
for (const row of rows) {
  const values = columns.map((column) => row[column] ?? null);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  await writer.query(
    `INSERT INTO propositions (${columns.join(", ")}) VALUES (${placeholders})`,
    values
  );
}
const stored = (await writer.query(`SELECT * FROM propositions`)).rows;
await writer.end();
if (stored.length !== RESTORED_ROW_COUNT) throw new Error(`Loaded ${stored.length} rows.`);
const storedChecksum = checksumRows(stored);
if (storedChecksum !== fileChecksum) throw new Error("Loaded checksum does not match the 8 Oct backup.");

// Advance serial counters after the load (copied rows can leave nextval behind MAX(id)).
process.env.DATABASE_URL = adminText;
process.env.PRIMUS_SCHEMA = RESTORED_DATABASE;
const dbAfter = await import("../lib/db.js");
await dbAfter.initDb();
await dbAfter.repairSerialSequences();
await dbAfter.closeDatabase();

const locker = new pg.Client({ connectionString: adminText });
await locker.connect();
const publicTable = await locker.query(`SELECT to_regclass('public.propositions') AS name`);
let removed = 0;
if (publicTable.rows[0]?.name) {
  const gone = await locker.query(`DELETE FROM public.propositions WHERE id = ANY($1::text[])`, [ids]);
  removed = gone.rowCount || 0;
}
await locker.end();

const probe = new pg.Client({ connectionString: adminText });
await probe.connect();
await probe.query(`SET search_path TO ${RESTORED_DATABASE}`);
await probe.query("SET default_transaction_read_only = on");
try {
  await probe.query("CREATE TEMP TABLE primus_restored_probe (id int)");
  throw new Error("Restored copy accepted a write.");
} catch (error) {
  if (error.message === "Restored copy accepted a write.") throw error;
  if (!/read-only|read only/i.test(String(error.message || ""))) throw error;
}
const checked = Number((await probe.query(`SELECT COUNT(*)::int AS n FROM propositions`)).rows[0].n);
await probe.query("SET default_transaction_read_only = off");
await probe.end();
if (checked !== RESTORED_ROW_COUNT) throw new Error(`Read-only copy has ${checked} rows.`);

const manifestClient = new pg.Client({ connectionString: adminText });
await manifestClient.connect();
await manifestClient.query(`SET search_path TO ${RESTORED_DATABASE}`);
const tables = await checksumSchemaTables(manifestClient);
await manifestClient.end();

const manifest = {
  backup: "20261008T093325Z",
  database: RESTORED_DATABASE,
  rows: stored.length,
  checksum: storedChecksum,
  tables,
};
const manifestDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "restored");
mkdirSync(manifestDir, { recursive: true });
writeFileSync(path.join(manifestDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`restored rows=${stored.length} checksum=${storedChecksum}`);
console.log(`public removed restored ids=${removed}`);
process.exit(0);
