/**
 * The same hair-oil numbers must keep one score.
 * A blank division and Personal Care both use the keyword floor.
 * The read does not write that division onto the row.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;
delete process.env.ANTHROPIC_API_KEY;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo, propositionForScore } = await import("../lib/propositionGateApi.js");
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");

const idea = {
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for hot afternoons.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f1: {
    declaredAttribute: "cooling feel on the scalp",
    benchmark: "Parachute",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "summer scalp comfort",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    mrpInr: 105.9,
    grammage: "10g",
    qcomTrajectory: "flat for three years",
  },
};

const created = await createProposition({ submitterDepartment: "NPD" });
const saved = await updateProposition(created.id, idea, { writer: "server" });
assert.equal(saved.division, "");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}
function capture() {
  return { statusCode: 0, body: "", end(value) { this.body = value; } };
}
const user = { department: "NPD" };

const blank = capture();
await handlePropositionGoNogo(
  { method: "POST", user, body: { proposition: { ...idea, id: created.id, division: "" } } },
  blank,
  created.id,
  { sendJson, redactSecrets: (message) => String(message || "") }
);
const personal = capture();
await handlePropositionGoNogo(
  { method: "POST", user, body: { proposition: { ...idea, id: created.id, division: "Personal Care" } } },
  personal,
  created.id,
  { sendJson, redactSecrets: (message) => String(message || "") }
);

const blankBody = JSON.parse(blank.body);
const personalBody = JSON.parse(personal.body);
assert.equal(blank.statusCode, 200);
assert.equal(personal.statusCode, 200);
assert.equal(blankBody.goNoGo.classification, personalBody.goNoGo.classification);
assert.equal(blankBody.goNoGo.score.pct, personalBody.goNoGo.score.pct);
assert.equal(blankBody.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(personalBody.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(blankBody.goNoGo.classification, "NO-GO");

const check = capture();
await handlePropositionCheck(
  { method: "POST", user, body: { proposition: { ...idea, division: "" } } },
  check,
  { propositionId: created.id, sendJson, redactSecrets: (message) => String(message || "") }
);
const checkBody = JSON.parse(check.body);
const checkScore = scoreAdvisoryChecks(checkBody.advisoryChecks);
assert.equal(check.statusCode, 200);
assert.equal(checkBody.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(computeGoNoGo(checkBody.advisoryChecks), blankBody.goNoGo.classification);
assert.equal(checkScore.pct, blankBody.goNoGo.score.pct);

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, idea.name);
assert.equal(stored.f2.mrpInr, 105.9);
assert.equal(propositionForScore(stored, { division: "" }).division, "Personal Care");
assert.equal(propositionForScore(stored, { division: "Personal Care" }).division, "Personal Care");

console.log(`PASS hair-oil score stays ${blankBody.goNoGo.classification} ${blankBody.goNoGo.score.pct}% when division is blank or Personal Care`);
