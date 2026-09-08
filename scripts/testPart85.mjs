import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIdeaWeight } from "../lib/scoring.js";
import { classifyIdeaWeight as classifyIdeaWeightUi } from "../src/scoringUi.js";
import { classifyGoNoGoFromScore } from "../lib/goNoGo.js";
import { ideaScaleLabel } from "../lib/ideaScale.js";
import {
  DECLARED_GAP_FLOOR,
  F6_CONSUMER_PANEL_MIN,
  F6_PANEL_TOTAL,
  GONOGO_SCORE_BANDS,
  IDEA_WEIGHT_BANDS,
} from "../lib/lockedConstants.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = join(ROOT, "scripts", "checkNoDuplicateThresholds.mjs");

function runChecker() {
  return spawnSync(process.execPath, [CHECKER], { encoding: "utf8", cwd: ROOT });
}

assert.equal(IDEA_WEIGHT_BANDS.TIER_10G_MAX, 1);
assert.equal(IDEA_WEIGHT_BANDS.TIER_100G_MAX, 12);
assert.equal(GONOGO_SCORE_BANDS.NOGO_MAX, 60);
assert.equal(GONOGO_SCORE_BANDS.WATCH_MAX, 80);
assert.equal(DECLARED_GAP_FLOOR, 2.0);
assert.equal(F6_CONSUMER_PANEL_MIN, 18);
assert.equal(F6_PANEL_TOTAL, 30);

assert.equal(ideaScaleLabel(1), "10g");
assert.equal(classifyIdeaWeight(1), "10g");
assert.equal(classifyIdeaWeightUi(1), "10g");
assert.equal(classifyIdeaWeight(1), classifyIdeaWeightUi(1));
assert.equal(classifyGoNoGoFromScore(60), "WATCH");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(81), "GO");

const constantsSrc = readFileSync(join(ROOT, "lib", "lockedConstants.js"), "utf8");
assert.match(constantsSrc, /TIER_10G_MAX:\s*1/);
assert.match(constantsSrc, /NOGO_MAX:\s*60/);
assert.match(constantsSrc, /WATCH_MAX:\s*80/);

const probe = join(ROOT, "lib", "_part85DriftProbe.js");
try {
  writeFileSync(probe, "export function drift(score) {\n  if (score >= 60) return true;\n  return false;\n}\n");
  const failed = runChecker();
  assert.notEqual(failed.status, 0, "checker must fail when a bare >= 60 is planted");
  assert.match(failed.stderr || failed.stdout, /_part85DriftProbe\.js/);
  assert.match(failed.stderr || failed.stdout, /bare 60/);
} finally {
  rmSync(probe, { force: true });
}

const clean = runChecker();
assert.equal(clean.status, 0, `checker must pass once the planted literal is gone\n${clean.stderr}${clean.stdout}`);
assert.match(clean.stdout, /no bare locked literals/);

console.log("Part 85: locked constants are shared; duplicate-threshold check fails then passes.");
