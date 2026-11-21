/**
 * R3/R4: Settings → Roster import has the Business Head mapping screen and roster template.
 * Source contract always; live replace-all API on scratch Postgres.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(root, "src", "AdminUsersPage.jsx"), "utf8");
assert.match(page, /Business head teams/);
assert.match(page, /replaces the whole list/);
assert.match(page, /Save mapping/);
assert.match(page, /This Business Head has not signed in yet/);
assert.match(page, /Download roster template/);
assert.match(page, /\/api\/admin\/users\/roster\/template/);
assert.match(page, /previewOnly:\s*true/);
assert.match(page, /loadBhMapping/);
const csv = fs.readFileSync(path.join(root, "docs", "prompts", "Roster_Template.csv"), "utf8");
assert.match(csv, /^email,name,team,org_role,reports_to_email/m);

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("PASS testBusinessHeadMappingUi (source) — SKIP API: TEST_DATABASE_URL not set");
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `bh-map-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "bh-map-test";

const db = await import("../lib/db.js");
const auth = await import("../lib/auth.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
await db.initDb();
const admin = await db.findOrCreateSlackUser({
  email: "tanmay.v@cavinkare.com",
  name: "Tanmay Bapat",
  role: "ADMIN",
  externalId: "U_admin_bh",
});
const cookie = `primus_session=${auth.signSession({ userId: admin.id, tokenVersion: Number(admin.tokenVersion) || 1 })}`;

async function api(method, url, body) {
  const raw = body == null ? "" : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: { "content-type": "application/json", cookie },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { statusCode: 200, headers: {}, raw: "" };
  const res = {
    get statusCode() { return o.statusCode; },
    set statusCode(v) { o.statusCode = v; },
    setHeader(k, v) { o.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return o.headers[String(k).toLowerCase()]; },
    writeHead(s) { o.statusCode = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); },
  };
  await handleApiRequest(req, res);
  let json = null;
  try { json = JSON.parse(o.raw || "null"); } catch { /* csv */ }
  return { status: o.statusCode, json, raw: o.raw, headers: o.headers };
}

const first = await api("POST", "/api/admin/users/business-head-teams", {
  rows: [{ email: "head.rd@cavinkare.com", team: "R&D" }],
});
assert.equal(first.status, 200, `first save HTTP ${first.status}`);
const loaded = await api("GET", "/api/admin/users/business-head-teams");
assert.equal(loaded.status, 200);
assert.ok(loaded.json.rows.some((r) => r.email === "head.rd@cavinkare.com" && r.team === "R&D"));
const complete = [...loaded.json.rows, { email: "head.rd@cavinkare.com", team: "Ambient & Beverages" }];
const preview = await api("POST", "/api/admin/users/business-head-teams", { previewOnly: true, rows: complete });
assert.equal(preview.status, 200);
assert.equal(preview.json.count, 2);
const saved = await api("POST", "/api/admin/users/business-head-teams", { rows: complete });
assert.equal(saved.status, 200);
assert.equal(saved.json.rows.length, 2, "save must keep the loaded rows plus the new team");
const tmpl = await api("GET", "/api/admin/users/roster/template");
assert.equal(tmpl.status, 200);
assert.match(tmpl.raw, /email,name,team,org_role,reports_to_email/);
assert.match(String(tmpl.headers["content-disposition"] || ""), /Roster_Template\.csv/);
console.log("PASS testBusinessHeadMappingUi (source + replace-all API + template)");
await suite.drop().catch(() => {});
