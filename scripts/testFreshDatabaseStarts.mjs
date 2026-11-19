/**
 * Part 156 — a brand-new, EMPTY database must start the app. 5 checks.
 *
 * Regression: the Part 148 backfill (UPDATE ... first_submitted_at ... go_nogo_json ...) ran before the line that
 * creates go_nogo_json, so initDb() crashed with `column "go_nogo_json" does not exist` on any new database
 * (a new install, every test, an empty Azure or Render database). Existing databases already had the column.
 *
 * Each scenario runs initDb() in its own process, because lib/db.js remembers that it is "ready".
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`  ok ${checks} — ${name}`);
}

await check("static: the first_submitted_at backfill is written after go_nogo_json and research_run_at are created", () => {
  const src = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  const at = (needle) => {
    const i = src.indexOf(needle);
    assert.ok(i >= 0, `missing: ${needle}`);
    return i;
  };
  const backfill = at("SET first_submitted_at = COALESCE(research_run_at, created_at)");
  assert.ok(backfill > at("ADD COLUMN IF NOT EXISTS go_nogo_json TEXT"), "backfill must follow go_nogo_json");
  assert.ok(backfill > at("ADD COLUMN IF NOT EXISTS research_run_at TIMESTAMPTZ"), "backfill must follow research_run_at");
  assert.ok(backfill > at("ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ"), "backfill must follow first_submitted_at");
});

const SKIP = "SKIP testFreshDatabaseStarts live checks — TEST_DATABASE_URL not set";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log(SKIP);
  console.log(`PASS testFreshDatabaseStarts (${checks} of 5 checks, static only)`);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

const { openSuiteDatabase, suiteAdminUrl } = await import("./pgSuiteDb.mjs");
suiteAdminUrl(testUrl); // refuses anything that is not a private scratch database

/** Run lib/db.js initDb() in a fresh process against one schema; the child prints one JSON line. */
function runInitDb(schema, tail) {
  const dbUrl = new URL("../lib/db.js", import.meta.url).href;
  const code = `
    const { initDb, query, closeDatabase } = await import(${JSON.stringify(dbUrl)});
    try {
      await initDb();
      const out = { started: true };
      ${tail || ""}
      console.log("RESULT " + JSON.stringify(out));
      await closeDatabase().catch(() => {});
      process.exit(0);
    } catch (e) {
      console.log("RESULT " + JSON.stringify({ started: false, error: String(e && e.message || e).slice(0, 200) }));
      process.exit(0);
    }
  `;
  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    PRIMUS_SCHEMA: schema,
    PRIMUS_DATA_DIR: path.join(os.tmpdir(), `primus-fresh-${process.pid}-${schema}`),
    REQUIRE_AUTH: "false",
  };
  delete env.POSTGRES_URL;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env, encoding: "utf8", timeout: 120000 });
  const line = String(r.stdout || "").split("\n").find((l) => l.startsWith("RESULT "));
  assert.ok(line, `no result from child: ${String(r.stderr || "").slice(0, 300)}`);
  return JSON.parse(line.slice(7));
}

const fresh = await openSuiteDatabase(testUrl);
const legacy = await openSuiteDatabase(testUrl);
const admin = new pg.Client({ connectionString: testUrl });
await admin.connect();

try {
  await check("an empty database starts (initDb finishes with no error)", () => {
    const out = runInitDb(fresh.name);
    assert.equal(out.error, undefined, `initDb failed: ${out.error}`);
    assert.equal(out.started, true);
  });

  await check("the new database has every column the app reads, including first_submitted_at and go_nogo_json", async () => {
    const cols = await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'propositions'`,
      [fresh.name]
    );
    const have = new Set(cols.rows.map((r) => r.column_name));
    for (const need of ["first_submitted_at", "go_nogo_json", "research_run_at", "research_findings_json", "proof_json", "manager_review_json"]) {
      assert.ok(have.has(need), `missing column ${need}`);
    }
  });

  // An older database (Render today): has go_nogo_json but never had first_submitted_at.
  await admin.query(`
    CREATE TABLE ${legacy.name}.propositions (
      id TEXT PRIMARY KEY, name TEXT, category TEXT, division TEXT, final_verdict TEXT, final_verdict_note TEXT,
      f1_json TEXT, f2_json TEXT, f3_json TEXT, f4_json TEXT, f5_json TEXT, f6_json TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      idea_description TEXT, attachment_json TEXT, research_run_at TIMESTAMPTZ, go_nogo_json TEXT
    )`);
  await admin.query(
    `INSERT INTO ${legacy.name}.propositions (id, name, created_at, research_run_at, go_nogo_json) VALUES
       ('old-submitted', 'Submitted idea', '2026-01-02T00:00:00Z', '2026-01-05T00:00:00Z', NULL),
       ('old-sealed-no-run', 'Sealed without a run date', '2026-02-02T00:00:00Z', NULL, '{"classification":"WATCH"}'),
       ('old-draft', 'Never submitted', '2026-03-02T00:00:00Z', NULL, NULL)`
  );

  await check("an older database still starts and the backfill dates only ideas that were submitted", async () => {
    const out = runInitDb(legacy.name);
    assert.equal(out.error, undefined, `initDb failed: ${out.error}`);
    const rows = await admin.query(`SELECT id, first_submitted_at FROM ${legacy.name}.propositions ORDER BY id`);
    const by = Object.fromEntries(rows.rows.map((r) => [r.id, r.first_submitted_at && new Date(r.first_submitted_at).toISOString()]));
    assert.equal(by["old-submitted"], "2026-01-05T00:00:00.000Z", "uses the research run date");
    assert.equal(by["old-sealed-no-run"], "2026-02-02T00:00:00.000Z", "falls back to the created date");
    assert.equal(by["old-draft"], null, "a draft stays undated");
  });

  await check("starting again changes no date (the backfill is set-once)", async () => {
    await admin.query(`UPDATE ${legacy.name}.propositions SET first_submitted_at = '2030-01-01T00:00:00Z' WHERE id = 'old-submitted'`);
    const out = runInitDb(legacy.name);
    assert.equal(out.error, undefined, `second start failed: ${out.error}`);
    const rows = await admin.query(`SELECT id, first_submitted_at FROM ${legacy.name}.propositions ORDER BY id`);
    const by = Object.fromEntries(rows.rows.map((r) => [r.id, r.first_submitted_at && new Date(r.first_submitted_at).toISOString()]));
    assert.equal(by["old-submitted"], "2030-01-01T00:00:00.000Z", "an existing date is never rewritten");
    assert.equal(by["old-draft"], null);
  });
} finally {
  await admin.end().catch(() => {});
  await fresh.drop().catch(() => {});
  await legacy.drop().catch(() => {});
}

console.log(`PASS testFreshDatabaseStarts (${checks} checks)`);
process.exit(0);
