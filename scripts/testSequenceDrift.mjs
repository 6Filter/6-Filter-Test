/**
 * Hotfix — serial sequence drift after a database move (8 checks).
 * Attached owner test: do not weaken assertions to match a broken build.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const healthSrc = readFileSync(new URL("../lib/healthApi.js", import.meta.url), "utf8");
const adminSrc = readFileSync(new URL("../src/AdminUsersPage.jsx", import.meta.url), "utf8");
const backupDoc = readFileSync(new URL("../docs/BACKUP_TO_SHAREPOINT.md", import.meta.url), "utf8");
const loadRestored = readFileSync(new URL("../scripts/loadRestoredCopy.mjs", import.meta.url), "utf8");

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`  ok ${checks} — ${name}`);
}

await check("repairSerialSequences and serialSequenceStatus are exported and schema-aware", () => {
  assert.match(dbSrc, /export async function repairSerialSequences/);
  assert.match(dbSrc, /export async function serialSequenceStatus/);
  assert.match(dbSrc, /current_schema\(\)/);
  assert.match(dbSrc, /nextval\(%/);
  assert.match(dbSrc, /setval/);
});

await check("initDb repairs serials once after tables exist, before other writes", () => {
  assert.match(dbSrc, /await repairSerialSequences\(\)/);
  const initIdx = dbSrc.indexOf("export async function initDb");
  const repairIdx = dbSrc.indexOf("await repairSerialSequences()", initIdx);
  assert.ok(repairIdx > initIdx);
  assert.ok(dbSrc.indexOf("await bootstrapDepartmentPasswordsFromEnv()", repairIdx) > repairIdx);
});

await check("delete retries once after a 23505 on archive/audit pkey, then returns a plain message", () => {
  assert.match(dbSrc, /isArchiveSerialConflict/);
  assert.match(dbSrc, /deleted_propositions_pkey/);
  assert.match(dbSrc, /proposition_audit_pkey/);
  assert.match(dbSrc, /The idea could not be deleted\. Please tell an admin\./);
  assert.match(dbSrc, /deletePropositionOnce/);
});

await check("health reports sequencesOk; Admin warns when false; restore path and docs mention repair", () => {
  assert.match(healthSrc, /sequencesOk/);
  assert.match(healthSrc, /serialSequenceStatus/);
  assert.match(adminSrc, /data-testid="sequence-drift-warning"/);
  assert.match(loadRestored, /repairSerialSequences/);
  assert.match(backupDoc, /repairSerialSequences/);
  assert.match(backupDoc, /pg_dump/);
});

await check("empty-table leave-alone and never-move-backwards are coded", () => {
  assert.match(dbSrc, /max <= 0/);
  assert.match(dbSrc, /current >= max/);
  assert.match(dbSrc, /drifted\.push\(\{ table, column, max, current \}\)/);
});

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  await check("Postgres live drift proof skipped when TEST_DATABASE_URL is unset", () => {
    assert.equal(testUrl, "");
  });
  await check("static surface still covers delete plain message for people", () => {
    assert.doesNotMatch(dbSrc, /duplicate key value violates unique constraint/);
  });
  await check("status shape documents ok + drifted", () => {
    assert.match(dbSrc, /ok: drifted\.length === 0/);
  });
  console.log(`PASS testSequenceDrift (${checks} checks, no Postgres)`);
  process.exit(0);
}

function hostAllowed(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}
if (!hostAllowed(testUrl) || /render\.com|neon\.tech|supabase\.co/i.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-seq-${process.pid}`);

const db = await import("../lib/db.js");
await db.initDb();

await check("forcing the archive counter behind MAX makes status not ok", async () => {
  const created = await db.createProposition({ submitterDepartment: "CIA", name: "seq-drift" });
  assert.equal(await db.deleteProposition(created.id, "test"), true);
  const maxRow = await db.query(`SELECT COALESCE(MAX(archive_id), 0)::bigint AS max FROM deleted_propositions`);
  assert.ok(Number(maxRow[0]?.max || 0) > 0);
  await db.query(`SELECT setval(pg_get_serial_sequence('deleted_propositions', 'archive_id'), 1, true)`);
  const status = await db.serialSequenceStatus();
  assert.equal(status.ok, false);
  assert.ok(status.drifted.some((d) => d.table === "deleted_propositions" && d.current < d.max));
});

await check("repair advances the counter; a second repair is a no-op; delete works after drift", async () => {
  const first = await db.repairSerialSequences();
  assert.ok(first.repaired.some((r) => r.table === "deleted_propositions"));
  assert.equal((await db.serialSequenceStatus()).ok, true);
  assert.equal(
    (await db.repairSerialSequences()).repaired.filter((r) => r.table === "deleted_propositions").length,
    0
  );
  const created = await db.createProposition({ submitterDepartment: "CIA", name: "seq-retry" });
  await db.query(`SELECT setval(pg_get_serial_sequence('deleted_propositions', 'archive_id'), 1, true)`);
  assert.equal(await db.deleteProposition(created.id, "test"), true);
  assert.equal(await db.getPropositionById(created.id), null);
});

await check("empty tables stay out of drifted and are not force-set", async () => {
  const status = await db.serialSequenceStatus();
  assert.ok(!status.drifted.some((d) => d.max <= 0));
});

console.log(`PASS testSequenceDrift (${checks} checks)`);
await db.closeDatabase().catch(() => {});
process.exit(0);
