/**
 * Permanent hard lock: same scoring inputs → same percent + verdict in every path
 * (gate API, DB overwrite attempts, log list projection). Score moves only when inputs change.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-hard-lock-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const {
  scoreInputKey,
  hardLockGoNoGo,
  lockedScoreFromPrior,
  resolveHardLockedGoNoGo,
} = await import("../lib/analysisStability.js");
const { scoreAdvisoryChecks, computeGoNoGo, buildGateRationale } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const {
  createProposition,
  getPropositionById,
  updateProposition,
  listPropositions,
} = await import("../lib/db.js");
const { handlePropositionGoNogo, propositionForScore } = await import("../lib/propositionGateApi.js");
const { classificationOf } = await import("../lib/logStatus.js");

const idea = {
  name: "Hard lock fixture",
  category: "Hair Oils",
  division: "Personal Care",
  ideaDescription: "cooling herbal oil hard lock",
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

const checksA = await computeAllAdvisoryChecks(idea);
const scoreA = scoreAdvisoryChecks(checksA);
const classA = computeGoNoGo(checksA);
const keyA = scoreInputKey(idea);
assert.ok(scoreA.total > 0);
assert.ok(classA);

const sealed = resolveHardLockedGoNoGo({
  doc: idea,
  prev: null,
  advisoryChecks: checksA,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
  buildRationale: buildGateRationale,
  ideaName: idea.name,
  category: idea.category,
});
assert.equal(sealed.classification, classA);
assert.equal(sealed.score.pct, scoreA.pct);
assert.equal(sealed.scoreInputKey, keyA);

// Condition: drifted advisory checks with same form inputs must not move the seal.
const driftedChecks = {
  ...checksA,
  f2: {
    checkLabel: "Cleared",
    items: Array.from({ length: 12 }, (_, i) => ({ status: "done", text: `pad ${i}` })),
  },
};
assert.notEqual(scoreAdvisoryChecks(driftedChecks).pct, scoreA.pct);
const lockedAgain = resolveHardLockedGoNoGo({
  doc: idea,
  prev: sealed,
  advisoryChecks: driftedChecks,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
});
assert.equal(lockedAgain.hardLocked, true);
assert.equal(lockedAgain.classification, classA);
assert.equal(lockedAgain.score.pct, scoreA.pct);

// Condition: DB hard lock refuses overwrite with same fingerprint.
const forged = hardLockGoNoGo(sealed, {
  classification: "GO",
  score: { pct: 100, done: 20, total: 20, scoreInputKey: keyA },
  scoreInputKey: keyA,
  rationale: "forged",
});
assert.equal(forged.classification, classA);
assert.equal(forged.score.pct, scoreA.pct);
assert.notEqual(forged.rationale, "forged");

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(
  created.id,
  { ...idea, researchRunAt: new Date().toISOString(), goNoGo: sealed },
  { writer: "server" }
);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

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
    { sendJson, redactSecrets: (m) => String(m || "") }
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

// Condition: repeated go-nogo with same inputs.
const g1 = await runGate({ ...idea });
const g2 = await runGate({
  ...idea,
  researchFindings: { f1: { benchmarkVerified: false, categorySizeFound: false } },
});
assert.equal(g1.goNoGo.score.pct, scoreA.pct);
assert.equal(g1.goNoGo.classification, classA);
assert.equal(g2.goNoGo.score.pct, scoreA.pct);
assert.equal(g2.goNoGo.classification, classA);
assert.equal(g2.goNoGo.scoreInputKey, keyA);

// Condition: explicit forged update with same key is rejected by DB hard lock.
await updateProposition(
  created.id,
  {
    goNoGo: {
      classification: "GO",
      score: { pct: 99, done: 99, total: 99, scoreInputKey: keyA },
      scoreInputKey: keyA,
      rationale: "should not stick",
    },
  },
  { writer: "server" }
);
const afterForge = await getPropositionById(created.id);
assert.equal(afterForge.goNoGo.classification, classA);
assert.equal(afterForge.goNoGo.score.pct, scoreA.pct);

// Condition: Log list projection keeps stored verdict + percent.
const listed = await listPropositions(50);
const row = listed.find((r) => r.id === created.id);
assert.ok(row, "idea must appear on the log list");
assert.equal(classificationOf(row), classA);
assert.equal(row.goNoGo.score.pct, scoreA.pct);
assert.equal(row.classification, classA);

// Condition: changing scoring inputs unlocks in the resolve path (full Evaluate uses this).
const edited = {
  ...idea,
  f1: { ...idea.f1, declaredAttribute: "", benchmark: "", declaredGap: null, growthArgument: "" },
  f2: { ...idea.f2, netMarginAtScale: 5, cogsAtScale: 95 },
};
await updateProposition(created.id, edited, { writer: "server" });
const storedAfterEdit = await getPropositionById(created.id);
const scoredEdited = propositionForScore(storedAfterEdit, edited);
const checksEdited = await computeAllAdvisoryChecks(scoredEdited);
const resealed = resolveHardLockedGoNoGo({
  doc: scoredEdited,
  prev: afterForge.goNoGo,
  advisoryChecks: checksEdited,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
  buildRationale: buildGateRationale,
  ideaName: idea.name,
  category: idea.category,
});
assert.notEqual(resealed.scoreInputKey, keyA);
assert.notEqual(resealed.score.pct, scoreA.pct);

// Part 136 — lightweight go-nogo keeps legacy prev until Submit/Evaluate seals output.
const g3 = await runGate(edited);
assert.equal(g3.goNoGo.scoreInputKey, keyA);
assert.equal(g3.goNoGo.score.pct, scoreA.pct);
await updateProposition(created.id, { goNoGo: resealed }, { writer: "server", handler: "test-reseal" });
const listed2 = await listPropositions(50);
const row2 = listed2.find((r) => r.id === created.id);
assert.equal(classificationOf(row2), resealed.classification);
assert.equal(row2.goNoGo.score.pct, resealed.score.pct);

const g4 = await runGate({ ...edited, researchFindings: {} });
assert.equal(g4.goNoGo.score.pct, resealed.score.pct);
assert.equal(g4.goNoGo.classification, resealed.classification);

const storedResealed = await getPropositionById(created.id);
assert.equal(
  lockedScoreFromPrior(storedResealed, storedResealed.goNoGo)?.score.pct,
  storedResealed.goNoGo.score.pct
);
assert.equal(
  lockedScoreFromPrior(edited, resealed)?.score.pct,
  resealed.score.pct,
  "sparse edited draft must share the sealed fingerprint"
);

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /lockedVerdict/);
assert.match(logSrc, /goNoGo\?\.score\?\.done|goNoGo\?\.output\?\.score/);
assert.match(logSrc, /Stored gate verdict/);

const stabilitySrc = readFileSync(new URL("../lib/analysisStability.js", import.meta.url), "utf8");
assert.match(stabilitySrc, /export function hardLockGoNoGo/);
assert.match(stabilitySrc, /export function resolveHardLockedGoNoGo/);
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const gateSrc = readFileSync(new URL("../lib/propositionGateApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /resolveHardLockedGoNoGo/);
assert.match(gateSrc, /resolveHardLockedGoNoGo/);
const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /hardLockGoNoGo/);

console.log(
  `PASS hard score lock: ${classA} ${scoreA.pct}% stays sealed until inputs change (then ${resealed.classification} ${resealed.score.pct}%)`
);
