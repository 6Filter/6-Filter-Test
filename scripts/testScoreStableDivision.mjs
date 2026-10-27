/**
 * The same hair-oil numbers must score once.
 * A blank division uses the keyword match for the score and does not write it.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { divisionForScore } = await import("../lib/divisionForScore.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionCheck } = await import("../lib/propositionCheckApi.js");

const hair = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
  f1: { declaredAttribute: "cooling feel", benchmark: "Parachute Advansed", declaredGap: 2 },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    mrpInr: 105.9,
    grammage: "10g",
    qcomTrajectory: "flat",
  },
};

assert.equal(divisionForScore(hair, { division: "" }), "Personal Care");
assert.equal(divisionForScore({ ...hair, division: "Foods" }, { division: "" }), "Foods");
assert.equal(divisionForScore({ division: "" }, { ...hair, division: "Snacks" }), "Snacks");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

async function readGate(proposition) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionGoNogo(
    { method: "POST", user: { department: "NPD" }, body: { proposition } },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return res.body;
}

const created = await createProposition({ submitterDepartment: "NPD" });
try {
  await updateProposition(created.id, hair, { writer: "server" });
  const storedBefore = await getPropositionById(created.id);
  assert.equal(storedBefore.division, "");

  const blank = await readGate({ ...hair, division: "" });
  const personal = await readGate({ ...hair, division: "Personal Care" });
  assert.equal(blank.goNoGo.classification, personal.goNoGo.classification);
  assert.equal(blank.goNoGo.score.pct, personal.goNoGo.score.pct);
  assert.equal(blank.advisoryChecks.f2.checkLabel, "Below floor");
  assert.equal(personal.advisoryChecks.f2.checkLabel, "Below floor");
  assert.equal(blank.goNoGo.classification, "NO-GO");

  const storedAfterRead = await getPropositionById(created.id);
  assert.equal(storedAfterRead.division, "", "a go-nogo read must not write the division");
  assert.equal(storedAfterRead.name, hair.name);
  assert.equal(storedAfterRead.f2.cogsAtScale, 70);
  assert.equal(storedAfterRead.f2.mrpInr, 105.9);

  const checkRes = { statusCode: 0, body: null, end() {} };
  await handlePropositionCheck(
    { method: "POST", body: { proposition: { ...hair, division: "" } } },
    checkRes,
    { propositionId: created.id, readBody: async (req) => req.body, sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(checkRes.statusCode, 200);
  assert.equal(checkRes.body.advisoryChecks.f2.checkLabel, "Below floor");
  const checkScore = scoreAdvisoryChecks(checkRes.body.advisoryChecks);
  assert.equal(computeGoNoGo(checkRes.body.advisoryChecks), blank.goNoGo.classification);
  assert.equal(checkScore.pct, blank.goNoGo.score.pct);

  const direct = await computeAllAdvisoryChecks({ ...hair, division: divisionForScore(hair, hair) });
  assert.equal(direct.f2.checkLabel, "Below floor");
  assert.equal(scoreAdvisoryChecks(direct).pct, blank.goNoGo.score.pct);
} finally {
  await deleteProposition(created.id, "NPD");
}

console.log("PASS same hair-oil values keep one score, and a read does not write the division");
