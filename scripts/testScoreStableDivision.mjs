/**
 * Same commercial inputs score once. A blank division uses the keyword match
 * Submit uses, and a go-nogo read does not write that division.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-div-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { divisionForScore } = await import("../lib/divisionForScore.js");
const { scoreInputKey } = await import("../lib/analysisStability.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");

const idea = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
  submitterName: "Live Tester",
  submitterDepartment: "R&D",
  f1: {
    declaredAttribute: "cooling feel",
    benchmark: "Parachute",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "summer ritual",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: "105.90",
    qcomTrajectory: "flat",
  },
};

assert.equal(divisionForScore(idea), "Personal Care");
assert.equal(scoreInputKey(idea), scoreInputKey({ ...idea, division: "Personal Care" }));

const blankChecks = await computeAllAdvisoryChecks(idea);
const namedChecks = await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" });
assert.equal(blankChecks.f2.checkLabel, "Below floor");
assert.equal(namedChecks.f2.checkLabel, "Below floor");
assert.equal(scoreAdvisoryChecks(blankChecks).pct, scoreAdvisoryChecks(namedChecks).pct);
assert.equal(computeGoNoGo(blankChecks), computeGoNoGo(namedChecks));

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, idea, { writer: "server" });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

async function runGate(draft) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    { method: "POST", user: { department: "R&D", role: "ADMIN" }, body: { proposition: draft } },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const first = await runGate({ ...idea, division: "" });
const storedAfterBlank = await getPropositionById(created.id);
assert.equal(String(storedAfterBlank.division || ""), "", "a go-nogo read must not write the division");

const second = await runGate({ ...idea, division: "Personal Care" });
const storedAfterNamed = await getPropositionById(created.id);
assert.equal(String(storedAfterNamed.division || ""), "");

assert.equal(first.goNoGo.classification, second.goNoGo.classification);
assert.equal(first.goNoGo.score.pct, second.goNoGo.score.pct);
assert.equal(first.goNoGo.scoreInputKey, second.goNoGo.scoreInputKey);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(second.advisoryChecks.f2.checkLabel, "Below floor");

const third = await runGate({ ...idea, division: "" });
assert.equal(third.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(third.goNoGo.classification, first.goNoGo.classification);

const checkRes = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionCheck(
  { method: "POST", body: { ...idea, division: "" } },
  checkRes,
  { readBody: async () => ({ ...idea, division: "" }), sendJson, redactSecrets: (message) => String(message || "") }
);
assert.equal(checkRes.statusCode, 200);
assert.equal(JSON.parse(checkRes.body).advisoryChecks.f2.checkLabel, "Below floor");

console.log(`PASS division-stable score ${first.goNoGo.classification} ${first.goNoGo.score.pct}%`);
