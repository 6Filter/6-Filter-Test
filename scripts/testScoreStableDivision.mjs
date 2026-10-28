/**
 * The same hair-oil numbers must score once.
 * A blank division uses the keyword match. A go-nogo read does not write that division.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { computeAllAdvisoryChecks, scoreAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");

const idea = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for daily scalp use.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: 105.9,
    qcomTrajectory: "flat",
  },
};

const blank = await computeAllAdvisoryChecks(idea);
const named = await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" });
assert.equal(blank.f2.checkLabel, "Below floor");
assert.equal(named.f2.checkLabel, "Below floor");
const blankScore = scoreAdvisoryChecks(blank);
const namedScore = scoreAdvisoryChecks(named);
assert.equal(blankScore.pct, namedScore.pct);
assert.equal(blankScore.done, namedScore.done);
assert.equal(blankScore.total, namedScore.total);

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(created.id, idea, { writer: "server" });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function postGo(division) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    { method: "POST", user: { department: "NPD" } },
    res,
    created.id,
    {
      readBody: async () => ({ proposition: { ...idea, division } }),
      sendJson,
      redactSecrets: (message) => String(message || ""),
    }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function postCheck(division) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionCheck(
    { method: "POST", user: { department: "NPD" } },
    res,
    {
      propositionId: created.id,
      readBody: async () => ({ proposition: { ...idea, division } }),
      sendJson,
      redactSecrets: (message) => String(message || ""),
    }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const checkBlank = await postCheck("");
const checkNamed = await postCheck("Personal Care");
assert.equal(checkBlank.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(checkNamed.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(
  scoreAdvisoryChecks(checkBlank.advisoryChecks).pct,
  scoreAdvisoryChecks(checkNamed.advisoryChecks).pct
);

const first = await postGo("");
const second = await postGo("Personal Care");
const third = await postGo("");
assert.equal(first.goNoGo.classification, "NO-GO");
assert.equal(first.goNoGo.score.pct, second.goNoGo.score.pct);
assert.equal(second.goNoGo.score.pct, third.goNoGo.score.pct);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, idea.name);
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.netMarginAtScale, 22);
assert.equal(stored.goNoGo.score.pct, first.goNoGo.score.pct);

console.log(`PASS hair-oil score stays NO-GO ${first.goNoGo.score.pct}% when division is blank`);
