/**
 * The same hair-oil numbers score once.
 * A blank division uses the keyword match Submit uses, and a go-nogo read does not write it.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const idea = {
  name: "Division score hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for daily use.",
  submitterName: "Tester",
  submitterDepartment: "R&D",
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

const blank = await computeAllAdvisoryChecks(idea);
const personal = await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" });
assert.equal(blank.f2.checkLabel, "Below floor");
assert.equal(personal.f2.checkLabel, "Below floor");
const blankScore = scoreAdvisoryChecks(blank);
const personalScore = scoreAdvisoryChecks(personal);
assert.equal(blankScore.pct, personalScore.pct);
assert.equal(blankScore.done, personalScore.done);
assert.equal(blankScore.total, personalScore.total);
assert.equal(computeGoNoGo(blank), computeGoNoGo(personal));
assert.equal(computeGoNoGo(blank), "NO-GO");

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, idea, { writer: "server" });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function readScore(division) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    {
      method: "POST",
      user: { department: "Open", role: "ADMIN" },
      body: { proposition: { ...idea, division } },
    },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const first = await readScore("");
const storedBlank = await getPropositionById(created.id);
assert.equal(String(storedBlank.division || ""), "");
assert.equal(first.classification, "NO-GO");
assert.equal(first.goNoGo.score.pct, blankScore.pct);

const second = await readScore("Personal Care");
const storedStillBlank = await getPropositionById(created.id);
assert.equal(String(storedStillBlank.division || ""), "");
assert.equal(second.classification, first.classification);
assert.equal(second.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(second.advisoryChecks.f2.checkLabel, "Below floor");

console.log(`PASS same hair-oil numbers stay ${first.classification} ${first.goNoGo.score.pct}% without writing the division`);
