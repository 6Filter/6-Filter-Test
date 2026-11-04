/**
 * Part 128 — list and get-by-id must surface the same sealed percent for one idea.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { scoreInputKey } from "../lib/analysisStability.js";
import { annotateSealedGoNoGo, stampScreenedGoNoGo } from "../lib/scoringRuleset.js";
import { SCORING_RULESET_VERSION } from "../lib/lockedConstants.js";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (testUrl) {
  const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
  const suite = await openSuiteDatabase(testUrl);
  process.env.DATABASE_URL = suite.url;
  process.env.PRIMUS_SCHEMA = suite.name;
  process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-one-score-${process.pid}`);
}

const { createProposition, updateProposition, getPropositionById, listPropositions } = await import("../lib/db.js");

const idea = {
  name: "One score everywhere",
  submitterDepartment: "R&D",
  f2: { cogsAtScale: 12, netMarginAtScale: 40, gstRatePct: 18, grammage: "50g", mrpInr: 99 },
};
const key = scoreInputKey(idea);
const goNoGo = stampScreenedGoNoGo(
  {
    classification: "WATCH",
    score: { pct: 35, done: 6, total: 17, scoreInputKey: key, byFilter: {} },
    scoreInputKey: key,
    rationale: "sealed fixture",
    at: "2026-03-01T08:00:00.000Z",
  },
  idea
);

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, { ...idea, goNoGo, researchRunAt: "2026-03-01T08:00:00.000Z" }, { writer: "server" });

const byId = await getPropositionById(created.id);
const listed = (await listPropositions(2000)).find((row) => row.id === created.id);
assert.ok(byId && listed, "fixture idea must exist on list and by-id");

const fromList = annotateSealedGoNoGo(listed, listed.goNoGo);
const fromGet = annotateSealedGoNoGo(byId, byId.goNoGo);
assert.equal(Number(fromList.score.pct), 35);
assert.equal(Number(fromGet.score.pct), Number(fromList.score.pct));
assert.equal(fromGet.classification, fromList.classification);
assert.equal(fromGet.rulesetVersion, SCORING_RULESET_VERSION);

console.log("PASS testOneScoreEverywhere — list and get-by-id share sealed 35%");
