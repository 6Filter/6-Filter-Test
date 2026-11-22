/**
 * R1: the Log list SELECT includes created_by_email so Team Leads see reports' ideas.
 * Adding one column does not add queries. Scratch Postgres only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbSrc = fs.readFileSync(path.join(root, "lib", "db.js"), "utf8");
const listFn = dbSrc.slice(dbSrc.indexOf("export async function listPropositions"), dbSrc.indexOf("export async function countIncompleteResearch"));
assert.match(
  listFn,
  /SELECT[\s\S]*created_by_user_id,\s*created_by_email[\s\S]*FROM propositions/,
  "listPropositions SELECT must include created_by_email next to created_by_user_id"
);
assert.match(listFn, /createdByEmail:\s*normalizeEmailLocal\(r\.created_by_email/);

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("PASS testListCreatedByEmail (source) — SKIP live list: TEST_DATABASE_URL not set");
  process.exit(0);
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `list-email-${process.pid}`);

const db = await import("../lib/db.js");
await db.initDb();
const owner = await db.findOrCreateSlackUser({
  email: "lead.report@cavinkare.com",
  name: "Report One",
  role: "BM",
  externalId: "U_report_one",
});
const created = await db.createProposition({
  createdByEmail: owner.email,
  createdByUserId: owner.id,
  submitterName: "Report One",
  submitterDepartment: "R&D",
  name: "Report idea",
  category: "Serum",
  ideaDescription: "A leave-on serum that visibly reduces hair fall in eight weeks",
});
const listed = await db.listPropositions(100);
const row = listed.find((p) => p.id === created.id);
assert.ok(row, "created idea is in the list");
assert.equal(String(row.createdByEmail || "").toLowerCase(), owner.email.toLowerCase());
const bytes = Buffer.byteLength(JSON.stringify(listed), "utf8");
assert.ok(bytes > 0, "list payload is measurable");
console.log(`PASS testListCreatedByEmail (source + live list createdByEmail, payload ${bytes} bytes for ${listed.length} rows)`);
await suite.drop().catch(() => {});
