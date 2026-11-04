/**
 * Part 133 D18 — ADMIN scoring comparison (legacy binary vs relevance).
 * Browser-safe pure helpers.
 */
import { CHECK_WEIGHTS, RELEVANCE_SHADOW_MODE, SCORE_CHECK_SLOTS_TOTAL } from "./lockedConstants.js";
import { scoreFixedSlots, expectedSlotKeys, creditSlots, countDoneSlots } from "./scoreSlots.js";
import { classifyGoNoGoFromBands } from "./lockedConstants.js";

export function compareScoringModels(advisoryChecks = {}) {
  const scored = scoreFixedSlots(advisoryChecks);
  const relevancePct = scored.relevancePct;
  const legacyPct = scored.legacyPct;
  const moved = [];
  for (const fk of ["f1", "f2", "f3", "f4"]) {
    const keys = expectedSlotKeys()[fk] || [];
    const credit = creditSlots(fk, advisoryChecks[fk]);
    const binary = countDoneSlots(fk, advisoryChecks[fk]);
    if (Math.abs(credit - binary) > 0.01) {
      moved.push({
        filter: fk,
        credit: Math.round(credit * 1000) / 1000,
        binary,
        delta: Math.round((credit - binary) * 1000) / 1000,
      });
    }
    void keys;
  }
  return {
    shadowMode: RELEVANCE_SHADOW_MODE,
    total: SCORE_CHECK_SLOTS_TOTAL,
    legacy: {
      pct: legacyPct,
      verdict: classifyGoNoGoFromBands(legacyPct),
      done: scored.legacyDone,
    },
    relevance: {
      pct: relevancePct,
      verdict: classifyGoNoGoFromBands(relevancePct),
      points: scored.points,
    },
    moved,
    weights: CHECK_WEIGHTS,
    weightEffectNote:
      "Filter 4 is 7/17 ≈ 41% at equal weights; five judged Filter 1 checks are 5/17 ≈ 29%.",
  };
}
