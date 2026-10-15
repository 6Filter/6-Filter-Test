/**
 * The same hair-oil numbers must score once.
 * A query that leaves division blank uses the keyword match Submit uses,
 * so it cannot clear the Personal Care floor that the named division hits.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionById } = await import("../lib/propositionsApi.js");

const hair = {
  name: "Division stability herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for daily scalp use.",
  submitterName: "Tester",
  submitterDepartment: "NPD",
  f1: {
    declaredAttribute: "cooling feel",
    benchmark: "Parachute",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "daily oil users",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: 105.9,
    qcomTrajectory: "flat take-rate over three years",
  },
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}
const redactSecrets = (message) => String(message || "");
const user = { department: "NPD", role: "ADMIN" };

async function readScore(id, division) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    { method: "POST", user, body: { proposition: { ...hair, division, id } } },
    res,
    id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(created.id, hair, { writer: "server" });

const blank = await readScore(created.id, "");
const named = await readScore(created.id, "Personal Care");
assert.equal(blank.goNoGo.classification, "NO-GO");
assert.equal(named.goNoGo.classification, "NO-GO");
assert.equal(blank.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(named.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(blank.goNoGo.score.pct, named.goNoGo.score.pct);
assert.equal(blank.goNoGo.score.done, named.goNoGo.score.done);
assert.equal(blank.goNoGo.score.total, named.goNoGo.score.total);

const again = await readScore(created.id, "");
assert.equal(again.goNoGo.score.pct, blank.goNoGo.score.pct);
assert.equal(again.goNoGo.classification, blank.goNoGo.classification);

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, hair.name);
assert.equal(stored.f2.mrpInr, 105.9);
assert.equal(stored.goNoGo.score.pct, blank.goNoGo.score.pct);

const getRes = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionById({ method: "GET", user }, getRes, created.id, { sendJson, redactSecrets });
assert.equal(getRes.statusCode, 200);
const loaded = JSON.parse(getRes.body);
assert.equal(loaded.proposition.goNoGo.score.pct, blank.goNoGo.score.pct);
assert.equal(loaded.proposition.goNoGo.classification, "NO-GO");
assert.equal(loaded.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(loaded.proposition.name, hair.name);
assert.equal(loaded.proposition.f2.cogsAtScale, 70);

console.log(`PASS blank division and Personal Care both score NO-GO ${blank.goNoGo.score.pct}%`);
