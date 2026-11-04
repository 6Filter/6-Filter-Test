/**
 * Log list pct and open/GET pct must stay identical for a sealed idea.
 * Fresh advisory checks must not move the percent on reopen.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-open-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { scoreAdvisoryChecks, computeGoNoGo } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition, listPropositions } =
  await import("../lib/db.js");
const { resolveOutputScore } = await import("../lib/improvementPoints.js");
const { sealStoredGoNoGo, scoreInputKey } = await import("../lib/analysisStability.js");

const idea = {
  name: "ORS fortification iron",
  category: "ORS Drink",
  division: "Beverages",
  ideaDescription: "Launch a ORS with Fortification Iron",
  submitterName: "Shobha",
  submitterDepartment: "CIA",
  f1: {
    declaredAttribute: "iron fortification",
    benchmark: "Electral",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "Assam occasions",
  },
  f2: {
    mrpInr: 20,
    grammage: "200ml",
    netMarginAtScale: 28,
    qcomTrajectory: "flat",
    cogsAtScale: 9,
    gstRatePct: 12,
  },
  f3: { marginElasticity: { minMrpInr: 15, maxMrpInr: 35 } },
  f4: {
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Medium", reason: "format" },
        consumptionContextStability: { risk: "Low", reason: "stable" },
      },
    },
  },
  researchFindings: {
    f1: { benchmarkVerified: true, categorySizeFound: true },
  },
};

const checks = await computeAllAdvisoryChecks(idea);
const live = scoreAdvisoryChecks(checks);
const classification = computeGoNoGo(checks);
assert.ok(live.total > 0);

// Seal at 86% even if a later advisory pass would score differently.
const sealedPct = 86;
const key = scoreInputKey(idea);
const sealed = {
  classification: "WATCH",
  score: { pct: sealedPct, done: 12, total: 14, byFilter: {}, scoreInputKey: key },
  scoreInputKey: key,
  rationale: "sealed watch",
  at: "2026-01-01T00:00:00.000Z",
};

const created = await createProposition({ submitterDepartment: "CIA" });
await updateProposition(
  created.id,
  { ...idea, researchRunAt: new Date().toISOString(), goNoGo: sealed },
  { writer: "server" }
);

const listed = await listPropositions(50);
const row = listed.find((r) => r.id === created.id);
assert.equal(row.goNoGo.score.pct, sealedPct, "Log list must show sealed percent");
assert.equal(row.classification, "WATCH");

// Simulate GET withAdvisory read path: sealStoredGoNoGo must keep 86%.
const stored = await getPropositionById(created.id);
const readGo = sealStoredGoNoGo(stored, stored.goNoGo);
assert.equal(readGo.score.pct, sealedPct);
assert.equal(readGo.classification, "WATCH");

// Drifted advisory checks that would produce a different live percent.
const drifted = {
  ...checks,
  f1: {
    checkLabel: "Below floor",
    items: Array.from({ length: 8 }, (_, i) => ({
      status: i < 2 ? "done" : "pending",
      text: `d${i}`,
    })),
  },
};
const driftedPct = scoreAdvisoryChecks(drifted).pct;
assert.notEqual(driftedPct, sealedPct, "fixture must be able to drift if unlocked");

const outputPct = resolveOutputScore(drifted, readGo.score, stored, readGo.scoreInputKey).pct;
assert.equal(outputPct, sealedPct, "output page must keep Log percent against drifted checks");
assert.notEqual(outputPct, driftedPct);

// Part 128 — sealed snapshot wins everywhere, including a stale 100%. Re-screen to update.
const stalePerfect = {
  ...readGo,
  score: { pct: 100, done: 14, total: 14, byFilter: {}, scoreInputKey: key },
  scoreInputKey: key,
};
const sealedEvenIfStale = resolveOutputScore(checks, stalePerfect.score, stored, key);
assert.equal(sealedEvenIfStale.pct, 100, "Part 128 keeps the sealed snapshot until re-screen");

console.log(
  `PASS open keeps Log score ${sealedPct}% (live would have been ${driftedPct}%, class=${classification}; sealed 100 stays sealed)`
);
