import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCORING_RULESET_VERSION, SCORE_DENOMINATOR_MODE } from "../lib/lockedConstants.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";

const golden = JSON.parse(
  readFileSync(new URL("./golden/scoring-golden.json", import.meta.url), "utf8")
);

assert.equal(golden.rulesetVersion, SCORING_RULESET_VERSION);
assert.equal(golden.denominatorMode, SCORE_DENOMINATOR_MODE);
assert.ok(Array.isArray(golden.ideas) && golden.ideas.length >= 40, "need ≥40 golden ideas");

const failures = [];
for (const idea of golden.ideas) {
  const score = scoreAdvisoryChecks(idea.checks || {});
  const classification = computeGoNoGo(idea.checks || {});
  const exp = idea.expected || {};
  if (score.pct !== exp.pct || score.done !== exp.done || score.total !== exp.total) {
    failures.push(
      `${idea.id}: score got ${score.done}/${score.total}=${score.pct}% expected ${exp.done}/${exp.total}=${exp.pct}%`
    );
  }
  if (classification !== exp.classification) {
    failures.push(`${idea.id}: class got ${classification} expected ${exp.classification}`);
  }
  for (const [k, expF] of Object.entries(exp.byFilter || {})) {
    const got = score.byFilter?.[k] || {};
    if (Number(got.done) !== Number(expF.done) || Number(got.total) !== Number(expF.total)) {
      failures.push(
        `${idea.id}.${k}: got ${got.done}/${got.total} expected ${expF.done}/${expF.total}`
      );
    }
  }
}

assert.equal(failures.length, 0, failures.join("\n"));
console.log(`PASS testScoringGolden — ${golden.ideas.length} ideas match ${SCORING_RULESET_VERSION}`);
