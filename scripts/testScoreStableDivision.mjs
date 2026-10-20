/**
 * A blank division on a follow-up read must score the same as Submit,
 * which keyword-matches the idea. The read must not write that label.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-division-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { divisionForScore } = await import("../lib/divisionForScore.js");

const idea = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  division: "",
  ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f2: {
    mrpInr: 105.9,
    grammage: "10g",
    netMarginAtScale: 22,
    qcomTrajectory: "flat",
    cogsAtScale: 70,
    gstRatePct: 18,
  },
};

assert.equal(divisionForScore(idea, { division: "" }), "Personal Care");

const created = await createProposition({ submitterDepartment: "NPD" });
const saved = await updateProposition(created.id, idea, { writer: "server" });
assert.equal(saved.division, "");

const withFloor = scoreAdvisoryChecks(
  await computeAllAdvisoryChecks({ ...saved, division: "Personal Care" })
);
const matched = scoreAdvisoryChecks(
  await computeAllAdvisoryChecks({ ...saved, division: divisionForScore(saved, { division: "" }) })
);
assert.equal(matched.pct, withFloor.pct);
assert.equal(matched.done, withFloor.done);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function readScore(division) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    {
      method: "POST",
      user: { department: "NPD" },
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
const second = await readScore("");
const named = await readScore("Personal Care");
assert.equal(first.goNoGo.classification, named.goNoGo.classification);
assert.equal(first.goNoGo.score.pct, named.goNoGo.score.pct);
assert.equal(second.goNoGo.score.pct, first.goNoGo.score.pct);
assert.equal(first.goNoGo.classification, "NO-GO");
assert.equal(first.advisoryChecks.f2.checkLabel, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "");
assert.equal(stored.name, idea.name);
assert.equal(stored.goNoGo.score.pct, first.goNoGo.score.pct);

console.log(`PASS blank division and Personal Care both score ${first.goNoGo.classification} ${first.goNoGo.score.pct}%`);
