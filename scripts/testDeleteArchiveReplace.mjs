/**
 * Re-delete after restore must not trip deleted_propositions_pkey.
 * With TEST_DATABASE_URL: uses a scratch schema and forces the live-style
 * PRIMARY KEY (id) that caused the 500. Without it: file-store path only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /DELETE FROM deleted_propositions WHERE id = \$1/);
assert.match(dbSrc, /pgArchiveAndAudit/);

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (testUrl) {
  function hostAllowed(raw) {
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      return false;
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
    return false;
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
  process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-pg-del-${process.pid}`);
}

const {
  createProposition,
  deleteProposition,
  getPropositionById,
  restoreDeletedProposition,
  updateProposition,
  initDb,
  query,
} = await import("../lib/db.js");

await initDb();

if (testUrl) {
  // Match the live constraint that surfaced as deleted_propositions_pkey on id.
  await query(`DROP TABLE IF EXISTS deleted_propositions`);
  await query(`
    CREATE TABLE deleted_propositions (
      id TEXT PRIMARY KEY,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_by TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL
    )
  `);
}

const row = await createProposition({ submitterDepartment: "CIA", submitterName: "Delete Fix" });
await updateProposition(row.id, { ...row, name: "re-delete-me", ideaDescription: "archive replace" });
assert.equal(await deleteProposition(row.id, "test-delete-archive"), true);
assert.equal(await getPropositionById(row.id), null);
assert.equal(await restoreDeletedProposition(row.id), row.id);
assert.equal((await getPropositionById(row.id))?.name, "re-delete-me");
assert.equal(
  await deleteProposition(row.id, "test-delete-archive"),
  true,
  "second delete after restore must succeed"
);
assert.equal(await getPropositionById(row.id), null);

console.log(`PASS testDeleteArchiveReplace (${testUrl ? "postgres id-pkey" : "file-store"})`);
