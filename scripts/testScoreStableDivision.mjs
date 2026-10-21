/**
 * The same hair-oil numbers must score once.
 * A blank division uses the keyword match. A read does not write that division.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { computeAllAdvisoryChecks, scoreAdvisoryChecks, computeGoNoGo } = await import("../lib/propositionScoring.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");
const { divisionForScore } = await import("../lib/divisionForScore.js");

const idea = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f1: {
    declaredAttribute: "cooling feel",
    benchmark: "Parachute",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "daily oiling occasions",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: 105.9,
    qcomTrajectory: "flat",
  },
};

assert.equal(divisionForScore(idea, { division: "" }), "Personal Care");
assert.equal(divisionForScore({ ...idea, division: "Foods" }, { division: "Personal Care" }), "Foods");
assert.equal(divisionForScore({ ...idea, division: "" }, { division: "Foods" }), "Foods");

const created = await createProposition({ submitterDepartment: "NPD" });
const saved = await updateProposition(created.id, idea, { writer: "server" });
assert.equal(saved.division, "");

const expectedChecks = await computeAllAdvisoryChecks({ ...saved, division: "Personal Care" });
const expected = scoreAdvisoryChecks(expectedChecks);
const expectedClass = computeGoNoGo(expectedChecks);

function capture() {
  return { statusCode: 0, body: "", end(value) { this.body = value; } };
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
const redactSecrets = (message) => String(message || "");
const user = { department: "NPD" };

async function readScore(division) {
  const res = capture();
  await handlePropositionGoNogo(
    {
      method: "POST",
      user,
      body: { proposition: { ...saved, division } },
    },
    res,
    created.id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  return body;
}

const blank = await readScore("");
const personal = await readScore("Personal Care");
assert.equal(blank.goNoGo.classification, expectedClass);
assert.equal(blank.goNoGo.score.pct, expected.pct);
assert.equal(personal.goNoGo.classification, expectedClass);
assert.equal(personal.goNoGo.score.pct, expected.pct);
assert.equal(blank.goNoGo.score.pct, personal.goNoGo.score.pct);
assert.equal(blank.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(personal.advisoryChecks.f2.checkLabel, "Below floor");

const checkRes = capture();
await handlePropositionCheck(
  {
    method: "POST",
    user,
    body: {
      name: idea.name,
      category: idea.category,
      ideaDescription: idea.ideaDescription,
      division: "",
      f1: idea.f1,
      f2: idea.f2,
    },
  },
  checkRes,
  { propositionId: created.id, sendJson, redactSecrets }
);
assert.equal(checkRes.statusCode, 200);
const checkBody = JSON.parse(checkRes.body);
const checkScore = scoreAdvisoryChecks(checkBody.advisoryChecks);
assert.equal(checkBody.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(checkScore.pct, expected.pct);
assert.equal(computeGoNoGo(checkBody.advisoryChecks), expectedClass);

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, idea.name);
assert.equal(stored.f2.netMarginAtScale, 22);
assert.equal(stored.f2.mrpInr, 105.9);

console.log(`PASS same hair-oil numbers stay ${expectedClass} ${expected.pct}% and the read does not write the division`);
