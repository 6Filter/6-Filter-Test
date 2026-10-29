/**
 * The same hair-oil numbers keep one score whether the query sends a division or not.
 * A go-nogo read must not write that division onto the row.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-div-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { computeAllAdvisoryChecks, scoreAdvisoryChecks, computeGoNoGo } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

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
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "summer occasions",
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

const blank = scoreAdvisoryChecks(await computeAllAdvisoryChecks(idea));
const personal = scoreAdvisoryChecks(await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" }));
assert.equal(blank.pct, personal.pct);
assert.equal(computeGoNoGo(await computeAllAdvisoryChecks(idea)), computeGoNoGo(await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" })));
assert.equal((await computeAllAdvisoryChecks(idea)).f2.checkLabel, "Below floor");

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
      user: { department: "R&D", role: "ADMIN" },
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
const second = await readScore("Personal Care");
const third = await readScore("");
assert.equal(first.goNoGo.score.pct, second.goNoGo.score.pct);
assert.equal(second.goNoGo.score.pct, third.goNoGo.score.pct);
assert.equal(first.goNoGo.classification, second.goNoGo.classification);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");
assert.equal(second.advisoryChecks.f2.checkLabel, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(String(stored.division || ""), "");
assert.equal(stored.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(stored.name, idea.name);
assert.equal(stored.f2.mrpInr, 105.9);

console.log(`PASS score stays ${first.goNoGo.classification} ${first.goNoGo.score.pct}% when division is omitted`);
