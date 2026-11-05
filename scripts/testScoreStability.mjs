/**
 * The same saved idea must keep one percent.
 * A follow-up read that drops cliff research must not drop that line.
 * The browser preview must count the same category line the server counts.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { previewAdvisoryChecks, scoreAdvisoryChecks, computeGoNoGo, buildGateRationale } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo, propositionForScore } = await import("../lib/propositionGateApi.js");
const { resolveHardLockedGoNoGo } = await import("../lib/analysisStability.js");

const priceEvents = { annualIncreasePct: 0, events: [] };

const idea = {
  name: "Score stability fixture",
  category: "Iced tea",
  division: "Beverages",
  ideaDescription: "Ready to drink tea for the score test.",
  submitterName: "Tester",
  submitterDepartment: "R&D",
  f1: {
    declaredAttribute: "less sugar",
    benchmark: "Lipton",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "youth occasions",
  },
  f2: {
    mrpInr: 20,
    grammage: "250 ml",
    netMarginAtScale: 30,
    qcomTrajectory: "flat",
    qcomPlan: [
      { year: 1, mrpInr: 20 },
      { year: 2, mrpInr: 20 },
      { year: 3, mrpInr: 21 },
    ],
    cogsAtScale: 8,
    gstRatePct: 12,
  },
  f3: {
    marginElasticity: {
      minMrpInr: 10,
      maxMrpInr: 40,
      liftPct: 25,
      volumeLossPriceIncreasePct: 25,
    },
  },
  f4: {
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Low", reason: "stable" },
        consumptionContextStability: { risk: "Medium", reason: "shift" },
      },
    },
  },
  researchFindings: {
    f1: { benchmarkVerified: false, categorySizeFound: false, benchmarkEvidence: "not found" },
    f3: { priceEvents },
  },
};

const previewChecks = previewAdvisoryChecks(idea);
const serverChecks = await computeAllAdvisoryChecks(idea);
assert.equal(previewChecks.f3.checkLabel, "Evidence missing", "browser preview must not invent F3 cliff credit");
assert.equal(serverChecks.f3.checkLabel, "Cleared");
const server = scoreAdvisoryChecks(serverChecks);
assert.equal(server.total, scoreAdvisoryChecks(previewChecks).total);

const created = await createProposition({ submitterDepartment: "R&D" });
const saved = await updateProposition(
  created.id,
  {
    ...idea,
    researchFindings: idea.researchFindings,
    researchRunAt: new Date().toISOString(),
    goNoGo: { classification: "NO-GO", score: { pct: 1, done: 1, total: 1 } },
  },
  { writer: "server" }
);
assert.equal(saved.f3.marginElasticity.minMrpInr, 10);

const full = scoreAdvisoryChecks(await computeAllAdvisoryChecks({ ...saved, researchFindings: idea.researchFindings }));
const withoutCliffResearch = scoreAdvisoryChecks(
  await computeAllAdvisoryChecks({
    ...saved,
    researchFindings: { ...idea.researchFindings, f3: {} },
  })
);
assert.notEqual(full.pct, withoutCliffResearch.pct, "dropping priceEvents must move the percent");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionGoNogo(
  {
    method: "POST",
    user: { department: "R&D", role: "ADMIN" },
    body: {
      proposition: {
        ...saved,
        researchFindings: idea.researchFindings,
        f3: { forumVerdict: "", verdictNote: "" },
        f4: { forumVerdict: "", verdictNote: "" },
        category: "",
        division: "",
      },
    },
  },
  res,
  created.id,
  { sendJson, redactSecrets: (message) => String(message || "") }
);
assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
// Part 136 — go-nogo keeps legacy stub until Evaluate; hard lock resolves on matching inputs.
const scoredFollowUp = propositionForScore(saved, {
  ...saved,
  researchFindings: idea.researchFindings,
  f3: { forumVerdict: "", verdictNote: "" },
  f4: { forumVerdict: "", verdictNote: "" },
  category: "",
  division: "",
});
const followChecks = await computeAllAdvisoryChecks(scoredFollowUp);
const resolved = resolveHardLockedGoNoGo({
  doc: scoredFollowUp,
  prev: saved.goNoGo,
  advisoryChecks: followChecks,
  computeClassification: computeGoNoGo,
  computeScore: scoreAdvisoryChecks,
  buildRationale: buildGateRationale,
  ideaName: saved.name,
  category: "Iced tea",
});
assert.equal(resolved.score.pct, full.pct);
assert.equal(resolved.score.done, full.done);
assert.equal(resolved.score.total, full.total);
assert.equal(body.goNoGo?.score?.pct ?? saved.goNoGo.score.pct, saved.goNoGo.score.pct);

const stored = await getPropositionById(created.id);
assert.equal(stored.f3.marginElasticity.minMrpInr, 10);
assert.equal(stored.category, "Iced tea");

console.log(`PASS score stays ${full.pct} when the follow-up read omits cliff research on the payload`);
