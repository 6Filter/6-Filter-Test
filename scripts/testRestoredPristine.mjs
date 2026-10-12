/**
 * App start runs against a clone schema. primus_restored checksums stay equal to the manifest.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PRECHANGE_EVIDENCE_LINE, evidenceLineForFilter } from "../lib/evidenceProvenance.js";
import { checksumSchemaTables, restoredDatabaseUrl, withRestoredClient } from "./restoredCopy.mjs";

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

loadEnv(".env.local");

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "restored", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(manifest.tables && Object.keys(manifest.tables).length > 1, "manifest lists a checksum per table");

function sameTables(live) {
  const names = Object.keys(manifest.tables).sort();
  assert.deepEqual(Object.keys(live).sort(), names);
  for (const name of names) {
    assert.equal(live[name].rows, manifest.tables[name].rows, `${name} row count`);
    assert.equal(live[name].checksum, manifest.tables[name].checksum, `${name} checksum`);
  }
}

const before = await withRestoredClient((client) => checksumSchemaTables(client));
sameTables(before);

const clone = `primus_clone_${randomBytes(6).toString("hex")}`;
const admin = new pg.Client({ connectionString: restoredDatabaseUrl() });
await admin.connect();
await admin.query(`CREATE SCHEMA ${clone}`);
const tableNames = Object.keys(manifest.tables);
for (const name of tableNames) {
  await admin.query(`CREATE TABLE ${clone}.${name} (LIKE primus_restored.${name} INCLUDING ALL)`);
  await admin.query(`INSERT INTO ${clone}.${name} SELECT * FROM primus_restored.${name}`);
}
await admin.end();

process.env.DATABASE_URL = restoredDatabaseUrl();
process.env.PRIMUS_SCHEMA = clone;
const db = await import("../lib/db.js");
await db.initDb();
await db.closeDatabase();

const after = await withRestoredClient((client) => checksumSchemaTables(client));
sameTables(after);

const drop = new pg.Client({ connectionString: restoredDatabaseUrl() });
await drop.connect();
await drop.query(`DROP SCHEMA IF EXISTS ${clone} CASCADE`);
await drop.end();

assert.doesNotMatch(PRECHANGE_EVIDENCE_LINE, /20\d\d/);
const { publicProposition } = await import("../lib/db.js");
const { readRestoredTable } = await import("./restoredCopy.mjs");
const rows = await readRestoredTable();
let notRecorded = 0;
for (const row of rows) {
  const proposition = publicProposition(row);
  for (const key of ["f1", "f2", "f3", "f4", "f5"]) {
    const line = evidenceLineForFilter(key, proposition);
    if (line === PRECHANGE_EVIDENCE_LINE) notRecorded += 1;
    if (line) assert.doesNotMatch(line, /before 8 Oct/);
  }
}
assert.ok(notRecorded > 0, "restored copy still has research whose evidence was not recorded");
console.log("PASS restored copy stays pristine and the evidence line has no date");
process.exit(0);
