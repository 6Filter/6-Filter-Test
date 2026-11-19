/**
 * Part 152 (my own counting test; the owner's testQueryCount.mjs is separate and untouched).
 * The Log makes a small, constant number of database calls however many ideas there are; no CREATE/ALTER/DROP runs
 * while a request is served; one idea opens in a few calls; the list shows the same review state as the idea page.
 * Real Postgres (scratch schema). Counts every statement that reaches the driver.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP testQueryCount152 — TEST_DATABASE_URL not set");
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-qc152-${process.pid}`);
process.env.NODE_ENV = "test";

const pg = (await import("pg")).default;
const log = [];
let delayMs = 0;
const origQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function patched(...args) {
  const first = args[0];
  const text = typeof first === "string" ? first : first?.text || "";
  log.push(text.replace(/\s+/g, " ").trim().slice(0, 90));
  const out = origQuery.apply(this, args);
  if (delayMs && out && typeof out.then === "function") return out.then(async (r) => { await new Promise((ok) => setTimeout(ok, delayMs)); return r; });
  return out;
};
const mark = () => log.length;
const since = (n) => log.slice(n);
const ddl = (stmts) => stmts.filter((s) => /^(CREATE|ALTER|DROP)\b/i.test(s));

const { createProposition, updateProposition, initDb, closeDatabase } = await import("../lib/db.js");
const { appendManagerReviewEvent } = await import("../lib/managerReviewEvents.js");
const { handlePropositionsCollection, handlePropositionById, handlePropositionDraft } = await import("../lib/propositionsApi.js");
const { handleHealth } = await import("../lib/healthApi.js");
await initDb();

function sendJson(res, status, body) { res.statusCode = status; res.end(JSON.stringify(body)); }
function capture() {
  const out = [];
  return { out, res: { statusCode: 0, setHeader() {}, end(body) { out.push({ status: this.statusCode, body }); } } };
}
const user = { department: "R&D", email: "qc152@example.com", role: "MEMBER" };
const deps = { sendJson, redactSecrets: (m) => String(m || ""), readBody: async (req) => req.body };

let seeded = 0;
async function seed(n) {
  const ids = [];
  while (seeded < n) {
    const row = await createProposition({ submitterDepartment: "R&D", submitterName: "QC 152" });
    await updateProposition(row.id, { ...row, name: `Idea ${seeded + 1}`, category: "Hair oils", ideaDescription: "A light hair oil for the scalp in summer." });
    if (seeded % 3 === 0) await appendManagerReviewEvent({ ideaId: row.id, event: "requested", actorEmail: "qc152@example.com", actorName: "QC" });
    ids.push(row.id);
    seeded += 1;
  }
  return ids;
}
async function getList() {
  const c = capture();
  const before = mark();
  await handlePropositionsCollection({ method: "GET", user, url: "/api/propositions?limit=200" }, c.res, deps);
  const stmts = since(before);
  assert.equal(c.out[0].status, 200, c.out[0].body.slice(0, 200));
  return { body: JSON.parse(c.out[0].body), stmts };
}
async function getOne(id) {
  const c = capture();
  const before = mark();
  await handlePropositionById({ method: "GET", user }, c.res, id, deps);
  const stmts = since(before);
  assert.equal(c.out[0].status, 200, c.out[0].body.slice(0, 200));
  return { body: JSON.parse(c.out[0].body), stmts };
}

async function saveDraft(id, text) {
  const c = capture();
  const before = mark();
  await handlePropositionDraft({ method: "POST", user, body: { proposition: { ideaDescription: text } } }, c.res, id, deps);
  const stmts = since(before);
  assert.equal(c.out[0].status, 200, c.out[0].body.slice(0, 200));
  return { stmts };
}
async function getHealth() {
  const c = capture();
  const before = mark();
  await handleHealth({ method: "GET", headers: {} }, c.res);
  const stmts = since(before);
  assert.equal(c.out[0].status, 200, c.out[0].body.slice(0, 200));
  return { stmts };
}

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`  ok ${checks} — ${name}`);
}

await seed(6);
const small = await getList(); // first call after start-up warms nothing the test relies on
const small2 = await getList();
await seed(36);
const big = await getList();
const smallIds = small2.body.propositions.map((p) => p.id);
const bigIds = big.body.propositions.map((p) => p.id);
const draftSmall = await saveDraft(smallIds[0], "A light hair oil, first save.");
const draftBig = await saveDraft(bigIds[bigIds.length - 1], "A light hair oil, second save.");
const healthSmall = await getHealth();
console.log(`  (draft save=${draftSmall.stmts.length}/${draftBig.stmts.length}, health=${healthSmall.stmts.length})`);
console.log(`  (calls: Log 6 ideas=${small2.stmts.length}, Log 36 ideas=${big.stmts.length})`);

await check("the Log makes the same small number of calls for 6 ideas and for 36 (at most 15)", () => {
  assert.equal(small2.body.propositions.length, 6);
  assert.equal(big.body.propositions.length, 36);
  assert.ok(small2.stmts.length <= 15, `6 ideas: ${small2.stmts.length} calls\n${small2.stmts.join("\n")}`);
  assert.equal(big.stmts.length, small2.stmts.length, `36 ideas: ${big.stmts.length} calls, 6 ideas: ${small2.stmts.length}`);
});

await check("no CREATE, ALTER or DROP runs while a request is served (including the very first one after start-up)", () => {
  assert.deepEqual(ddl(small.stmts), [], ddl(small.stmts).join("\n"));
  assert.deepEqual(ddl(big.stmts), [], ddl(big.stmts).join("\n"));
});

await check("saving a draft takes at most 14 calls, the same however many ideas exist, and runs no set-up statement", () => {
  assert.ok(draftSmall.stmts.length <= 14, `${draftSmall.stmts.length} calls\n${draftSmall.stmts.join("\n")}`);
  assert.equal(draftBig.stmts.length, draftSmall.stmts.length);
  assert.deepEqual(ddl(draftSmall.stmts), []);
});

await check("the health check runs no set-up statement and no per-idea calls", () => {
  assert.deepEqual(ddl(healthSmall.stmts), [], ddl(healthSmall.stmts).join("\n"));
  assert.ok(healthSmall.stmts.length <= 20, `${healthSmall.stmts.length} calls\n${healthSmall.stmts.join("\n")}`);
});

const sampleId = big.body.propositions.find((p) => p.managerReviewState?.openRequest)?.id || big.body.propositions[0].id;
const one = await getOne(sampleId);
await check("opening one idea takes at most 6 calls and runs no set-up statement", () => {
  assert.ok(one.stmts.length <= 6, `${one.stmts.length} calls\n${one.stmts.join("\n")}`);
  assert.deepEqual(ddl(one.stmts), []);
});

await check("the list shows exactly the review state the idea page shows", async () => {
  for (const p of big.body.propositions.slice(0, 12)) {
    const single = (await getOne(p.id)).body.proposition;
    assert.deepEqual(p.managerReviewState, single.managerReviewState, `state differs for ${p.id}`);
    assert.deepEqual(p.managerReviewEvents, single.managerReviewEvents, `events differ for ${p.id}`);
    assert.deepEqual(p.managerReview, single.managerReview, `managerReview differs for ${p.id}`);
  }
  assert.ok(big.body.propositions.some((p) => p.managerReviewState?.openRequest), "fixture has open reviews");
});

await check("with the database 250 ms away, the Log of 36 ideas loads in under 4 seconds", async () => {
  delayMs = 250;
  const t0 = Date.now();
  const r = await getList();
  const ms = Date.now() - t0;
  delayMs = 0;
  assert.equal(r.body.propositions.length, 36);
  console.log(`  (36 ideas at 250 ms per call: ${r.stmts.length} calls, ${ms} ms)`);
  assert.ok(ms < 4000, `${ms} ms`);
});

pg.Client.prototype.query = origQuery;
await closeDatabase().catch(() => {});
await suite.drop().catch(() => {});
console.log(`PASS testQueryCount152 (${checks} checks)`);
process.exit(0);
