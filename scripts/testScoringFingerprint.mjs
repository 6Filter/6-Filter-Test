import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCORING_RULESET_VERSION } from "../lib/lockedConstants.js";
import {
  computeScoringFingerprint,
  hashScoringFile,
  SCORING_FINGERPRINT_FILES,
} from "../lib/scoringRuleset.js";

const stored = JSON.parse(
  readFileSync(new URL("./scoringFingerprint.json", import.meta.url), "utf8")
);

assert.equal(stored.rulesetVersion, SCORING_RULESET_VERSION);
const live = computeScoringFingerprint();
const changed = [];
for (const rel of SCORING_FINGERPRINT_FILES) {
  const now = hashScoringFile(rel);
  const was = stored.files?.[rel];
  if (was !== now) changed.push(rel);
}

if (changed.length) {
  assert.notEqual(
    stored.rulesetVersion,
    SCORING_RULESET_VERSION,
    `Scoring files changed without a new SCORING_RULESET_VERSION + golden update. Changed: ${changed.join(", ")}`
  );
}

assert.equal(
  live,
  stored.fingerprint,
  `Scoring fingerprint drift. Changed files: ${changed.join(", ") || "(hash mismatch)"}. Bump SCORING_RULESET_VERSION, regenerate golden + fingerprint with owner approval.`
);

console.log(
  `PASS testScoringFingerprint — ${SCORING_RULESET_VERSION} ${live.slice(0, 8)} (${SCORING_FINGERPRINT_FILES.length} files)`
);
