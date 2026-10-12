/**
 * A normal save cannot set probe. Only PRIMUS_PROBE_TOKEN can.
 * Flagging rows does not change the full count the health alarm uses.
 * Skips when TEST_DATABASE_URL is unset so the file-mode suite still passes.
 */
import assert from "node:assert/strict";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP Part 113 probe flag — TEST_DATABASE_URL is not set");
  process.exit(0);
}
let host = "";
try {
  host = new URL(testUrl).hostname;
} catch {
  host = "";
}
if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
  console.error("Refusing a non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
process.env.PRIMUS_PROBE_TOKEN = "part113-probe-token";
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;

const {
  closeDatabase,
  countPropositions,
  countProbePropositions,
  createProposition,
  flagPropositionsAsProbe,
  getPropositionById,
  notePropositionCountForHealth,
  query,
  updateProposition,
} = await import("../lib/db.js");
const { handleHealth } = await import("../lib/healthApi.js");
const { handlePropositionDraft, handlePropositionsCollection } = await import("../lib/propositionsApi.js");

const user = { department: "NPD", role: "NPD" };
const token = process.env.PRIMUS_PROBE_TOKEN;

function sendJson(target, status, body) {
  target.statusCode = status;
  target.body = body;
}

async function createRow(headers) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionsCollection(
    { method: "POST", user, headers: headers || {} },
    res,
    { sendJson, redactSecrets: (message) => message }
  );
  assert.equal(res.statusCode, 201, res.body?.error || "create failed");
  return res.body.proposition;
}

async function draft(id, body, headers) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionDraft(
    { method: "POST", user, headers: headers || {} },
    res,
    id,
    { readBody: async () => body, sendJson, redactSecrets: (message) => message }
  );
  return res;
}

const plain = await createRow({ "x-primus-probe": "1" });
assert.equal(plain.probe, false, "plain probe header must not flag a new row");

const saved = await draft(plain.id, { proposition: { name: "kept name", probe: true } }, {});
assert.equal(saved.statusCode, 200, saved.body?.error || "draft failed");
assert.equal(saved.body.proposition.probe, false);
assert.equal((await getPropositionById(plain.id)).probe, false);

const headed = await draft(plain.id, { proposition: { probe: true } }, { "x-primus-probe": "1" });
assert.equal(headed.statusCode, 200);
assert.equal((await getPropositionById(plain.id)).probe, false);

const wrong = await draft(plain.id, { proposition: { name: "kept name" } }, { "x-primus-probe-token": "wrong-token" });
assert.equal(wrong.statusCode, 403);
assert.match(wrong.body.error, /Probe token rejected/);
assert.equal((await getPropositionById(plain.id)).probe, false);

const direct = await updateProposition(plain.id, { name: "kept name", probe: true }, { handler: "part113", bumpVersion: false });
assert.equal(direct.probe, false);

const right = await draft(plain.id, { proposition: { name: "kept name" } }, { "x-primus-probe-token": token });
assert.equal(right.statusCode, 200, right.body?.error || "token draft failed");
assert.equal((await getPropositionById(plain.id)).probe, true);

const extra = [];
for (let n = 0; n < 5; n += 1) extra.push(await createRow({ "x-primus-probe-token": token }));
assert.equal(extra.every((row) => row.probe === true), true);

const full = await countPropositions();
const probes = await countProbePropositions();
const visible = full - probes;
assert.ok(probes >= 6);
assert.equal(full, visible + probes);

const healthRes = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
await handleHealth({ method: "GET" }, healthRes);
const health = JSON.parse(healthRes.body);
assert.equal(health.propositions, full);
assert.equal(health.probes, probes);
assert.equal(health.propositions, visible + health.probes);

const today = new Date(Date.UTC(2200, 0, 1) + (Date.now() % 20000) * 86400000);
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
function dayKey(when) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}
await query(`DELETE FROM proposition_count_log WHERE day IN ($1::date, $2::date)`, [dayKey(yesterday), dayKey(today)]);
await notePropositionCountForHealth(full, { now: yesterday, force: true });
const quiet = await notePropositionCountForHealth(full, { now: today, force: true });
assert.equal(quiet.alarm, null);
const drop = await notePropositionCountForHealth(full - 6, { now: today, force: true });
assert.match(String(drop.alarm || ""), /dropped from/);
const deletes = await query(
  `SELECT COALESCE(SUM(row_count), 0)::int AS n FROM proposition_audit WHERE action LIKE 'delete%' AND at >= $1::date`,
  ["2200-01-01"]
);
assert.equal(Number(deletes[0]?.n || 0), 0);

const untouched = await createProposition({ submitterDepartment: "NPD" });
const listed = await createProposition({ submitterDepartment: "NPD" });
await flagPropositionsAsProbe([listed.id]);
assert.equal((await getPropositionById(listed.id)).probe, true);
assert.equal((await getPropositionById(untouched.id)).probe, false);
const audits = await query(
  `SELECT action, ids_json FROM proposition_audit WHERE action = 'flag-probe' AND ids_json = $1`,
  [JSON.stringify([listed.id])]
);
assert.equal(audits.length, 1);
assert.equal(audits[0].action, "flag-probe");
assert.equal(audits[0].ids_json.includes("name"), false);

const beforeMiss = await getPropositionById(untouched.id);
await assert.rejects(() => flagPropositionsAsProbe([untouched.id, "not-in-the-table"]), /not in the table/);
const afterMiss = await getPropositionById(untouched.id);
assert.equal(afterMiss.probe, false);
assert.equal(afterMiss.version, beforeMiss.version);

console.log("PASS Part 113 probe flag");
await closeDatabase();
await suite.drop();
process.exit(0);
