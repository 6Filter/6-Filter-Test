/**
 * ≥5000 random advisory boards: independent oracle vs production scoreAdvisoryChecks + computeGoNoGo.
 * Does not edit scoring. Failures are evidence of drift, not a licence to change the lock.
 */
import fc from "fast-check";
import { scoreAdvisoryChecks, computeGoNoGo } from "../../lib/goNoGo.js";
import { SCORE_DENOMINATOR_MODE, SCORING_MODEL, SCORING_RULESET_VERSION } from "../../lib/lockedConstants.js";
import { F1_SLOTS, F2_SLOTS, F3_SLOTS, F4_SLOTS, oracleScore } from "./scoringOracle.mjs";

const creditArb = fc.double({ min: 0, max: 1, noNaN: true }).map((n) => Math.round(n * 1000) / 1000);
const itemArb = (slot) => fc.record({
  slot: fc.constant(slot),
  status: fc.constantFrom("done", "pending", "fail"),
  credit: creditArb,
});

const boardArb = fc.record({
  f1Exempt: fc.boolean(),
  f1: fc.tuple(...F1_SLOTS.map(itemArb)),
  f2: fc.tuple(...F2_SLOTS.map(itemArb)),
  f3: fc.tuple(...F3_SLOTS.map(itemArb)),
  f4: fc.tuple(...F4_SLOTS.map(itemArb)),
}).map(({ f1Exempt, f1, f2, f3, f4 }) => ({
  f1: { checkLabel: f1Exempt ? "Exempt" : "Cleared", items: f1 },
  f2: { checkLabel: "Cleared", items: f2 },
  f3: { checkLabel: "Cleared", items: f3 },
  f4: { checkLabel: "Cleared", items: f4 },
}));

let compared = 0;
const mismatches = [];
fc.assert(
  fc.property(boardArb, (advisory) => {
    compared += 1;
    const live = scoreAdvisoryChecks(advisory);
    const klass = computeGoNoGo(advisory);
    const oracle = oracleScore(advisory);
    const pctOk = live.pct === oracle.pct;
    const totalOk = live.total === oracle.total;
    if (!pctOk || !totalOk) {
      mismatches.push({ pct: [live.pct, oracle.pct], total: [live.total, oracle.total], exempt: oracle.exemptF1 });
      return false;
    }
    if (klass === "INCOMPLETE") return true;
    return klass === oracle.classification;
  }),
  { numRuns: 5000, seed: 20261120 }
);

console.log(`PASS scoring oracle ${compared} boards vs ${SCORING_RULESET_VERSION} (${SCORING_MODEL}, ${SCORE_DENOMINATOR_MODE})`);
if (mismatches.length) {
  console.error(mismatches.slice(0, 5));
  process.exit(1);
}
