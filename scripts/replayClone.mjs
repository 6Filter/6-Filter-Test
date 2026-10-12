/**
 * Score the restored ideas twice, on a clone schema: the 676a538 tree and HEAD.
 * primus_restored is only read. Output files go to the temp directory.
 *
 *   node scripts/replayClone.mjs .worktrees/676a538
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { checksumSchemaTables, restoredDatabaseUrl, withRestoredClient } from "./restoredCopy.mjs";

const baseRoot = path.resolve(process.argv[2] || "");
if (!baseRoot) {
  console.error("Usage: node scripts/replayClone.mjs <676a538 worktree>");
  process.exit(1);
}

const before = await withRestoredClient((client) => checksumSchemaTables(client));
const clone = `primus_clone_${randomBytes(6).toString("hex")}`;
const admin = new pg.Client({ connectionString: restoredDatabaseUrl() });
await admin.connect();
await admin.query(`CREATE SCHEMA ${clone}`);
for (const name of Object.keys(before)) {
  await admin.query(`CREATE TABLE ${clone}.${name} (LIKE primus_restored.${name} INCLUDING ALL)`);
  await admin.query(`INSERT INTO ${clone}.${name} SELECT * FROM primus_restored.${name}`);
}
await admin.end();

process.env.DATABASE_URL = restoredDatabaseUrl();
process.env.PRIMUS_SCHEMA = clone;
delete process.env.PRIMUS_REPLAY;

const { readRestoredTable } = await import("./restoredCopy.mjs");
const { publicProposition } = await import("../lib/db.js");
const rows = (await readRestoredTable()).map((row) => publicProposition(row)).filter(Boolean);

const baseDb = await import(pathToFileURL(path.join(baseRoot, "lib", "db.js")).href);
await baseDb.initDb();
const baseSchema = await baseDb.query("SELECT current_schema() AS schema");
if (baseSchema[0]?.schema !== clone) throw new Error(`Base tree schema is ${baseSchema[0]?.schema}`);
const { scoreReplayRecord: scoreBase } = await import(pathToFileURL(path.join(baseRoot, "lib", "replayScore.js")).href);
const baseRecords = [];
for (const proposition of rows) baseRecords.push(await scoreBase(proposition));

const headDb = await import("../lib/db.js");
await headDb.initDb();
const headSchema = await headDb.query("SELECT current_schema() AS schema");
if (headSchema[0]?.schema !== clone) throw new Error(`HEAD schema is ${headSchema[0]?.schema}`);
const { scoreReplayRecord: scoreHead } = await import("../lib/replayScore.js");
const headRecords = [];
for (const proposition of rows) headRecords.push(await scoreHead(proposition));

const sortById = (records) => records.sort((a, b) => String(a.id).localeCompare(String(b.id)));
const baseFile = path.join(tmpdir(), `primus-replay-676a538.json`);
const headFile = path.join(tmpdir(), `primus-replay-head.json`);
writeFileSync(baseFile, `${JSON.stringify(sortById(baseRecords), null, 2)}\n`);
writeFileSync(headFile, `${JSON.stringify(sortById(headRecords), null, 2)}\n`);

if (baseDb.closeDatabase) await baseDb.closeDatabase();
else if (baseDb.pool?.end) await baseDb.pool.end();
if (headDb.closeDatabase) await headDb.closeDatabase();

const after = await withRestoredClient((client) => checksumSchemaTables(client));
for (const name of Object.keys(before)) {
  if (before[name].checksum !== after[name].checksum) {
    throw new Error(`${name} checksum changed during replay`);
  }
}

const drop = new pg.Client({ connectionString: restoredDatabaseUrl() });
await drop.connect();
await drop.query(`DROP SCHEMA IF EXISTS ${clone} CASCADE`);
await drop.end();

console.log(`base=${baseFile}`);
console.log(`head=${headFile}`);
console.log(`ideas=${rows.length} restoredUnchanged=yes`);
process.exit(0);
