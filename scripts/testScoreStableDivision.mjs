/**
 * The same hair-oil numbers score once. A blank division uses the keyword
 * match. A go-nogo read does not write that division onto the row.
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
const { computeGoNoGo } = await import("../lib/goNoGo.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const fields = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
  division: "",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    mrpInr: 105.9,
    grammage: "10g",
    qcomTrajectory: "flat",
  },
};

const blank = await computeAllAdvisoryChecks(fields);
const named = await computeAllAdvisoryChecks({ ...fields, division: "Personal Care" });
const blankScore = scoreAdvisoryChecks(blank);
const namedScore = scoreAdvisoryChecks(named);
assert.equal(blank.f2.checkLabel, "Below floor");
assert.equal(named.f2.checkLabel, "Below floor");
assert.equal(computeGoNoGo(blank), computeGoNoGo(named));
assert.equal(blankScore.pct, namedScore.pct);
assert.equal(computeGoNoGo(blank), "NO-GO");

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(created.id, fields, { writer: "server" });

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

async function readGate(division) {
  const res = { statusCode: 0, body: null, end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    {
      method: "POST",
      user: { department: "NPD" },
      body: { proposition: { ...fields, division } },
    },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const first = await readGate("");
const second = await readGate("Personal Care");
const third = await readGate("");
assert.equal(first.goNoGo.classification, "NO-GO");
assert.equal(first.goNoGo.score.pct, namedScore.pct);
assert.equal(second.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(third.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(String(stored.division || ""), "");
assert.equal(stored.name, fields.name);
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.mrpInr, 105.9);

console.log(`PASS stable division score ${first.goNoGo.score.pct}% NO-GO, division not written`);
