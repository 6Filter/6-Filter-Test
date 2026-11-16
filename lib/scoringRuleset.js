/**
 * Part 128 — ruleset version, scoreStatus, and scoring file fingerprint.
 * Node-only helpers for health / audit / fingerprint tests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCORING_RULESET_VERSION,
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  F3_MRP_RANGE_TOLERANCE_INR,
  GONOGO_SCORE_BANDS,
  DECLARED_GAP_FLOOR,
  DIVISION_MIN_NET_MARGIN_PCT,
} from "./lockedConstants.js";
import { scoreInputKey, storedScoreInputKey } from "./analysisStability.js";

export const SCORING_FINGERPRINT_FILES = Object.freeze([
  "lib/lockedConstants.js",
  "lib/goNoGo.js",
  "lib/filterChecks.js",
  "lib/propositionScoring.js",
  "lib/analysisStability.js",
  "lib/techShiftRisk.js",
  "lib/scoreSlots.js",
  "lib/mrpFormula.js",
  "lib/packSize.js",
  "lib/gstRate.js",
  "lib/filter2Check.js",
  "lib/priceResilience.js",
  "lib/divisionMargin.js",
  "lib/improvementPoints.js",
  "lib/propositionGateApi.js",
  "lib/inputReview.js",
  "lib/itemCopy.js",
  "lib/filter1Check.js",
  "lib/f1ResearchSafeguards.js",
  "lib/relevanceGrade.js",
  "lib/evaluationStatus.js",
  "lib/filterNarrativeText.js",
  "lib/assessmentResult.js",
  "lib/f4Assessment.js",
  "lib/inputCoverage.js",
  "lib/researchProgress.js",
  // Part 141 — guard (D73) and improvement headline from verdict (D72).
  "lib/sealOutput.js",
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function hashScoringFile(relPath) {
  // Normalize CRLF→LF so Windows working copies and Linux CI clones match.
  const body = readFileSync(join(ROOT, relPath), "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(body).digest("hex");
}

export function computeScoringFingerprint() {
  const parts = SCORING_FINGERPRINT_FILES.map((rel) => `${rel}:${hashScoringFile(rel)}`);
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export function scoringFingerprintShort(fp = computeScoringFingerprint()) {
  return String(fp || "").slice(0, 8);
}

export function effectiveRulesetVersion(goNoGo = null) {
  const raw = String(goNoGo?.rulesetVersion || goNoGo?.score?.rulesetVersion || "").trim();
  return raw || "legacy";
}

/**
 * @returns {"current"|"edited-since-evaluation"|"edited-since-screening"|"older-ruleset"}
 * Part 136 prefers "edited-since-evaluation"; "edited-since-screening" kept as an alias for older clients.
 */
export function computeScoreStatus(doc = {}, goNoGo = null) {
  const snap = goNoGo || doc?.goNoGo || null;
  if (!snap?.classification || !(Number(snap?.score?.total) > 0)) return "current";
  const version = effectiveRulesetVersion(snap);
  if (version !== SCORING_RULESET_VERSION) return "older-ruleset";
  const key = storedScoreInputKey(snap) || snap?.output?.scoreInputKey;
  if (key && scoreInputKey(doc) !== key) {
    return snap?.output?.sealedAt ? "edited-since-evaluation" : "edited-since-screening";
  }
  return "current";
}

/** Read-path: never rewrite stored pct; only annotate status + legacy version label. */
export function annotateSealedGoNoGo(doc = {}, goNoGo = null) {
  if (!goNoGo || typeof goNoGo !== "object") return goNoGo;
  if (!String(goNoGo.classification || "").trim()) return goNoGo;
  if (!(Number(goNoGo?.score?.total) > 0)) return goNoGo;
  const rulesetVersion = effectiveRulesetVersion(goNoGo);
  const scoreStatus = computeScoreStatus(doc, { ...goNoGo, rulesetVersion });
  return {
    ...goNoGo,
    rulesetVersion,
    scoreStatus,
    screenedAt: goNoGo.screenedAt || goNoGo.at || null,
  };
}

/** Write-path stamp on Submit / Run missing steps. */
export function stampScreenedGoNoGo(goNoGo = {}, doc = {}) {
  const inputKey = goNoGo.scoreInputKey || scoreInputKey(doc);
  const at = goNoGo.at || new Date().toISOString();
  return {
    ...goNoGo,
    scoreInputKey: inputKey,
    rulesetVersion: SCORING_RULESET_VERSION,
    screenedAt: goNoGo.screenedAt || at,
    at,
    scoreStatus: "current",
    score: goNoGo.score
      ? {
          ...goNoGo.score,
          scoreInputKey: inputKey,
          rulesetVersion: SCORING_RULESET_VERSION,
        }
      : goNoGo.score,
  };
}

export function scoringSpecSnapshot() {
  return {
    rulesetVersion: SCORING_RULESET_VERSION,
    denominatorMode: SCORE_DENOMINATOR_MODE,
    slots: { ...SCORE_CHECK_SLOTS },
    slotsTotal: SCORE_CHECK_SLOTS_TOTAL,
    f3MrpRangeToleranceInr: F3_MRP_RANGE_TOLERANCE_INR,
    bands: { ...GONOGO_SCORE_BANDS },
    declaredGapFloor: DECLARED_GAP_FLOOR,
    divisionMinNetMarginPct: { ...DIVISION_MIN_NET_MARGIN_PCT },
  };
}
