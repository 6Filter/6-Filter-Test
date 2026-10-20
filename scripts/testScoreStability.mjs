/**
 * The same saved idea must keep one percent.
 * A follow-up read that sends an empty safe-MRP range must not drop that line.
 * The browser preview must count the same category line the server counts.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-score-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;

const { previewAdvisoryChecks, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { divisionForScore } = await import("../lib/divisionForScore.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const idea = {
  name: "Score stability fixture",
  category: "Iced tea",
  division: "",
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
    grammage: "250ml",
    netMarginAtScale: 30,
    qcomTrajectory: "flat",
    cogsAtScale: 8,
    gstRatePct: 12,
  },
  f3: { marginElasticity: { minMrpInr: 15, maxMrpInr: 40 } },
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
  },
};

const preview = scoreAdvisoryChecks(previewAdvisoryChecks(idea));
const server = scoreAdvisoryChecks(await computeAllAdvisoryChecks(idea));
assert.equal(preview.done, server.done);
assert.equal(preview.total, server.total);
assert.equal(preview.pct, server.pct);

const created = await createProposition({ submitterDepartment: "R&D" });
const saved = await updateProposition(
  created.id,
  {
    ...idea,
    researchRunAt: new Date().toISOString(),
    goNoGo: { classification: "NO-GO", score: { pct: 1, done: 1, total: 1 } },
  },
  { writer: "server" }
);
assert.equal(saved.f3.marginElasticity.minMrpInr, 15);

const full = scoreAdvisoryChecks(await computeAllAdvisoryChecks(saved));
const withoutRange = scoreAdvisoryChecks(
  await computeAllAdvisoryChecks({ ...saved, f3: { forumVerdict: "", verdictNote: "" } })
);
assert.notEqual(full.pct, withoutRange.pct, "dropping the safe MRP range must be able to move the percent");

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
const stableSource = { ...saved, division: divisionForScore(saved, { division: "" }) };
const stable = scoreAdvisoryChecks(await computeAllAdvisoryChecks(stableSource));
assert.equal(body.goNoGo.score.pct, stable.pct);
assert.equal(body.goNoGo.score.done, stable.done);
assert.equal(body.goNoGo.score.total, stable.total);

const stored = await getPropositionById(created.id);
assert.equal(stored.f3.marginElasticity.minMrpInr, 15);
assert.equal(stored.goNoGo.score.pct, stable.pct);
assert.equal(stored.category, "Iced tea");
assert.equal(stored.division, "");

console.log(`PASS score stays ${stable.pct} when the follow-up read omits the safe MRP range`);
