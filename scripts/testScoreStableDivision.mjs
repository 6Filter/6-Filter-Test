/**
 * The same hair-oil numbers must keep one percent.
 * A follow-up read with a blank division uses the keyword match Submit uses.
 * A division already stored on the row is left alone.
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
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");
const { handlePropositionById } = await import("../lib/propositionsApi.js");
const { scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");

const user = { department: "NPD", role: "ADMIN" };
const idea = {
  name: "Score stable herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
  submitterName: "Tester",
  submitterDepartment: "NPD",
  f2: {
    mrpInr: "105.90",
    grammage: "10g",
    netMarginAtScale: 22,
    qcomTrajectory: "flat",
    cogsAtScale: 70,
    gstRatePct: 18,
  },
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

async function goNogo(id, proposition) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionGoNogo(
    { method: "POST", user, body: { proposition } },
    res,
    id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return res.body;
}

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(created.id, idea, { writer: "server" });

const first = await goNogo(created.id, { ...idea, division: "" });
const second = await goNogo(created.id, { ...idea, division: "" });
assert.equal(first.goNoGo.score.pct, second.goNoGo.score.pct);
assert.equal(first.goNoGo.classification, second.goNoGo.classification);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(second.advisoryChecks.f2.checkLabel, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, idea.name);
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.netMarginAtScale, 22);
assert.equal(stored.f2.mrpInr, "105.90");

const explicit = scoreAdvisoryChecks(
  await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" })
);
assert.equal(first.goNoGo.score.pct, explicit.pct);
assert.equal(stored.goNoGo.score.pct, explicit.pct);

const checkRes = { statusCode: 0, body: null, end() {} };
await handlePropositionCheck(
  { method: "POST", user, body: { ...idea, division: "" } },
  checkRes,
  { sendJson, redactSecrets: (message) => String(message || "") }
);
assert.equal(checkRes.statusCode, 200);
assert.equal(checkRes.body.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(scoreAdvisoryChecks(checkRes.body.advisoryChecks).pct, explicit.pct);

const getRes = { statusCode: 0, body: null, end() {} };
await handlePropositionById({ method: "GET", user }, getRes, created.id, {
  sendJson,
  redactSecrets: (message) => String(message || ""),
});
assert.equal(getRes.statusCode, 200);
assert.equal(getRes.body.proposition.division, "");
assert.equal(getRes.body.proposition.goNoGo.score.pct, explicit.pct);
assert.equal(getRes.body.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(getRes.body.proposition.name, idea.name);

const locked = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  locked.id,
  { ...idea, name: "Cold chain cooling pack", division: "Cold Chain Business" },
  { writer: "server" }
);
const lockedRead = await goNogo(locked.id, {
  ...idea,
  name: "Cold chain cooling pack",
  division: "",
});
const lockedRow = await getPropositionById(locked.id);
assert.equal(lockedRow.division, "Cold Chain Business");
assert.equal(lockedRead.advisoryChecks.f2.checkLabel, "Cleared");
assert.notEqual(lockedRead.goNoGo.score.pct, explicit.pct);

console.log(
  `PASS blank-division hair oil stays ${explicit.pct}% ${first.goNoGo.classification}; stored Cold Chain is left alone`
);
