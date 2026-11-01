/**
 * Same hair-oil numbers score once. A blank division uses the keyword match.
 * A go-nogo read does not write that division onto the row.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { divisionForScore } = await import("../lib/divisionForScore.js");
const { scoreInputKey } = await import("../lib/analysisStability.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const idea = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
  division: "",
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha",
    declaredGap: 2,
    gapDerivation: "shelf comparison",
    growthRoute: "penetration",
    growthArgument: "summer ritual",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: 105.9,
    qcomTrajectory: "flat take-rate",
  },
};

assert.equal(divisionForScore(idea), "Personal Care");
assert.equal(divisionForScore({ ...idea, division: "Foods" }), "Foods");
assert.equal(scoreInputKey(idea), scoreInputKey({ ...idea, division: "Personal Care" }));

const blankChecks = await computeAllAdvisoryChecks(idea);
const namedChecks = await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" });
assert.equal(blankChecks.f2.checkLabel, "Below floor");
assert.equal(namedChecks.f2.checkLabel, "Below floor");
const blankScore = scoreAdvisoryChecks(blankChecks);
const namedScore = scoreAdvisoryChecks(namedChecks);
assert.equal(blankScore.pct, namedScore.pct);
assert.equal(computeGoNoGo(blankChecks), computeGoNoGo(namedChecks));
assert.equal(computeGoNoGo(blankChecks), "NO-GO");

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, idea, { writer: "server" });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function readGate(draft) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    { method: "POST", user: { department: "Open", role: "BM" }, body: { proposition: draft } },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const first = await readGate({ ...idea, division: "" });
const afterBlank = await getPropositionById(created.id);
assert.equal(String(afterBlank.division || ""), "");
const second = await readGate({ ...idea, division: "Personal Care" });
const afterNamed = await getPropositionById(created.id);
assert.equal(String(afterNamed.division || ""), "");
assert.equal(first.goNoGo.classification, "NO-GO");
assert.equal(second.goNoGo.classification, "NO-GO");
assert.equal(first.goNoGo.score.pct, second.goNoGo.score.pct);
assert.equal(first.goNoGo.scoreInputKey, second.goNoGo.scoreInputKey);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");

console.log(`PASS division score stays NO-GO ${first.goNoGo.score.pct}% without writing the division`);
