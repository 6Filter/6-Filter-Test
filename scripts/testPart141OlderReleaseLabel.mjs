/**
 * Part 141 — an idea sealed under an older ruleset keeps its stored percentage and verdict,
 * is labelled "older-ruleset", and the UI shows "Scored under an older release".
 *
 * UI copy lives inline in src/PropositionForm.jsx (scoreStatusBanner) and LogPage.jsx (badge title);
 * both are JSX so we assert the string + the data-score-status hook from source, and test the
 * real status logic (lib/scoringRuleset.js) behaviourally.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCORING_RULESET_VERSION } from "../lib/lockedConstants.js";
import {
  computeScoreStatus,
  annotateSealedGoNoGo,
  effectiveRulesetVersion,
} from "../lib/scoringRuleset.js";
import { scoreInputKey } from "../lib/analysisStability.js";
import { buildPathToGo, resolveOutputScore } from "../lib/improvementPoints.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

const OLD = "v5.6";
assert.notEqual(OLD, SCORING_RULESET_VERSION, "fixture must be an older release");

const doc = {
  name: "Older release idea",
  category: "Hair oils",
  ideaDescription: "A menthol hair oil for summer.",
  f1: { benchmark: "Parachute Cooling 100 ml", declaredGap: 3 },
};

const sealedScore = { pct: 72, done: 13, total: 18, byFilter: {} };
const stored = {
  classification: "WATCH",
  rulesetVersion: OLD,
  score: { ...sealedScore, rulesetVersion: OLD },
  scoreInputKey: scoreInputKey(doc),
  output: {
    sealedAt: "2026-10-01T10:00:00.000Z",
    rulesetVersion: OLD,
    scoreInputKey: scoreInputKey(doc),
    score: { ...sealedScore },
    classification: "WATCH",
    filters: {},
  },
};

ok(() => {
  assert.equal(effectiveRulesetVersion(stored), OLD);
  assert.equal(computeScoreStatus(doc, stored), "older-ruleset");
  assert.equal(computeScoreStatus({ ...doc, goNoGo: stored }), "older-ruleset");
});

ok(() => {
  // Even when inputs are unchanged, the older version wins over "current".
  const same = { ...stored, scoreInputKey: scoreInputKey(doc) };
  assert.equal(computeScoreStatus(doc, same), "older-ruleset");
  // Edited inputs on an older release are still reported as older-ruleset (version checked first).
  assert.equal(computeScoreStatus({ ...doc, name: "Edited" }, same), "older-ruleset");
});

ok(() => {
  // A current-release seal with the same inputs is "current" (control).
  const cur = {
    ...stored,
    rulesetVersion: SCORING_RULESET_VERSION,
    score: { ...stored.score, rulesetVersion: SCORING_RULESET_VERSION },
  };
  assert.equal(computeScoreStatus(doc, cur), "current");
});

ok(() => {
  // Read path never rewrites the stored pct / classification.
  const before = JSON.stringify(stored);
  const annotated = annotateSealedGoNoGo(doc, stored);
  assert.equal(JSON.stringify(stored), before, "input not mutated");
  assert.equal(annotated.score.pct, 72);
  assert.equal(annotated.score.done, 13);
  assert.equal(annotated.classification, "WATCH");
  assert.equal(annotated.output.score.pct, 72);
  assert.equal(annotated.rulesetVersion, OLD);
  assert.equal(annotated.scoreStatus, "older-ruleset");
});

ok(() => {
  // A very different live check set must not replace the sealed number.
  const live = {
    f1: { checkLabel: "Not yet run", items: [] },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  };
  const resolved = resolveOutputScore(live, stored.score, doc);
  assert.equal(resolved.pct, 72, "sealed pct is shown, never recomputed from live checks");

  const path = buildPathToGo({
    advisoryChecks: live,
    sealedScore: stored.score,
    scoreStatus: "older-ruleset",
    screenedAt: null,
  });
  assert.equal(path.kind, "recompute");
  assert.equal(path.currentPct, 72, "path to GO keeps the stored pct");
  assert.match(path.headline, /older release|Recompute/i);
});

ok(() => {
  // UI copy — PropositionForm banner + data-score-status hook; LogPage badge.
  const form = read("../src/PropositionForm.jsx");
  assert.match(form, /scoreStatus === "older-ruleset"[\s\S]{0,80}\? "Scored under an older release"/);
  assert.match(form, /data-score-status=\{scoreStatus\}/);
  const log = read("../src/LogPage.jsx");
  assert.match(log, /title="Scored under an older release"/);
  assert.match(log, /older release/);
});

console.log(`PASS testPart141OlderReleaseLabel (${checks} checks)`);
