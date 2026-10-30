/**
 * Same entered values must keep the same percent and verdict.
 * Score may move only when scoring inputs change.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-score-lock-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const {
  scoreInputKey,
  scoreInputsMatch,
  lockedScoreFromPrior,
} = await import("../lib/analysisStability.js");
const { resolveOutputScore } = await import("../lib/improvementPoints.js");
const { scoreAdvisoryChecks, computeGoNoGo } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const idea = {
  name: "Score lock fixture",
  category: "Hair Oils",
  division: "Personal Care",
  ideaDescription: "cooling herbal oil for lock test",
  submitterName: "Tester",
  submitterDepartment: "R&D",
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "summer ritual",
  },
  f2: {
    mrpInr: 121,
    grammage: "100ml",
    netMarginAtScale: 22,
    qcomTrajectory: "flat",
    cogsAtScale: 70,
    gstRatePct: 18,
  },
  f3: { marginElasticity: { minMrpInr: 80, maxMrpInr: 150 } },
  f4: {
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Low", reason: "stable" },
        consumptionContextStability: { risk: "Low", reason: "stable" },
      },
    },
  },
  researchFindings: {
    f1: { benchmarkVerified: true, categorySizeFound: true, benchmarkEvidence: "shelf check" },
  },
};

const checks = await computeAllAdvisoryChecks(idea);
const firstScore = scoreAdvisoryChecks(checks);
const firstClass = computeGoNoGo(checks);
const key = scoreInputKey(idea);
assert.ok(firstScore.total > 0);
assert.ok(firstClass);

const goNoGo = {
  classification: firstClass,
  score: { ...firstScore, scoreInputKey: key },
  scoreInputKey: key,
  rationale: "locked rationale",
  at: "2026-01-01T00:00:00.000Z",
};

assert.equal(scoreInputsMatch(idea, goNoGo), true);
assert.deepEqual(lockedScoreFromPrior(idea, goNoGo)?.score.pct, firstScore.pct);

const driftedChecks = {
  ...checks,
  f1: {
    ...(checks.f1 || {}),
    checkLabel: "Cleared",
    items: Array.from({ length: 8 }, (_, i) => ({ status: "done", text: `fake ${i}` })),
  },
};
const driftedLive = scoreAdvisoryChecks(driftedChecks);
assert.notEqual(driftedLive.pct, firstScore.pct, "fixture must be able to drift if unlocked");

const pinned = resolveOutputScore(driftedChecks, goNoGo.score, idea, goNoGo.scoreInputKey);
assert.equal(pinned.pct, firstScore.pct, "output page must keep locked percent when inputs match");
assert.equal(pinned.done, firstScore.done);

const edited = {
  ...idea,
  f1: { ...idea.f1, declaredAttribute: "", benchmark: "", declaredGap: null, growthArgument: "" },
  f2: { ...idea.f2, netMarginAtScale: 5, cogsAtScale: 95 },
};
assert.equal(scoreInputsMatch(edited, goNoGo), false);
assert.equal(lockedScoreFromPrior(edited, goNoGo), null);
const unlocked = resolveOutputScore(
  await computeAllAdvisoryChecks(edited),
  goNoGo.score,
  edited,
  goNoGo.scoreInputKey
);
assert.notEqual(unlocked.pct, firstScore.pct, "cleared form inputs must unlock and recompute");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(
  created.id,
  {
    ...idea,
    researchRunAt: new Date().toISOString(),
    goNoGo,
  },
  { writer: "server" }
);

async function runGate(draft) {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  await handlePropositionGoNogo(
    {
      method: "POST",
      user: { department: "R&D", role: "ADMIN" },
      body: { proposition: draft },
    },
    res,
    created.id,
    { sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const first = await runGate({ ...idea });
assert.equal(first.goNoGo.score.pct, firstScore.pct);
assert.equal(first.goNoGo.classification, firstClass);
assert.equal(first.goNoGo.scoreInputKey, key);

const second = await runGate({
  ...idea,
  // Simulate a follow-up that would otherwise recompute differently
  researchFindings: { f1: { benchmarkVerified: false, categorySizeFound: false } },
});
assert.equal(second.goNoGo.score.pct, firstScore.pct, "second gate with same form inputs must pin score");
assert.equal(second.goNoGo.classification, firstClass);
assert.equal(second.goNoGo.rationale, "locked rationale");

const stored = await getPropositionById(created.id);
assert.equal(stored.goNoGo.score.pct, firstScore.pct);

// Persist real input edits on the server row, then gate — client-only blanks must not
// drop protected fields (same rule as score-stability follow-up reads).
await updateProposition(created.id, edited, { writer: "server" });
const third = await runGate(edited);
assert.notEqual(third.goNoGo.score.pct, firstScore.pct, "gate must recompute after input change");
assert.notEqual(third.goNoGo.scoreInputKey, key);

console.log(
  `PASS score lock holds at ${firstScore.pct}% until inputs change (then ${third.goNoGo.score.pct}%)`
);
