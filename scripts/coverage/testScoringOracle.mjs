/**
 * Independent oracle vs production scoring and verdict.
 * Independence: the oracle never imports goNoGo.js, scoreSlots.js or the filter checkers;
 * it only reads lockedConstants.js numbers and restates the written band / hard-stop / cap rules.
 */
import assert from "node:assert/strict";
import fc from "fast-check";
import { scoreAdvisoryChecks, computeGoNoGo } from "../../lib/goNoGo.js";
import {
  GONOGO_SCORE_BANDS,
  SCORE_DENOMINATOR_MODE,
  SCORING_MODEL,
  SCORING_RULESET_VERSION,
} from "../../lib/lockedConstants.js";
import {
  F1_SLOTS,
  F2_SLOTS,
  F3_SLOTS,
  F4_SLOTS,
  oracleScore,
  oracleVerdict,
} from "./scoringOracle.mjs";

function item(slot, credit, extra = {}) {
  return { slot, status: credit > 0 ? "done" : "pending", credit, ...extra };
}

function boardFromCredits(credits, labels = {}) {
  const take = (slots, start) => slots.map((slot, i) => item(slot, credits[start + i]));
  return {
    f1: { checkLabel: labels.f1 || "Cleared", items: take(F1_SLOTS, 0) },
    f2: { checkLabel: labels.f2 || "Cleared", items: take(F2_SLOTS, 7) },
    f3: { checkLabel: labels.f3 || "Cleared", items: take(F3_SLOTS, 10) },
    f4: { checkLabel: labels.f4 || "Cleared", items: take(F4_SLOTS, 11) },
  };
}

function creditsForPct(pct) {
  const total = 18;
  const points = Math.round((pct * total) / 100 * 1000) / 1000;
  const full = Math.floor(points);
  const rem = Math.round((points - full) * 1000) / 1000;
  const credits = Array(total).fill(0);
  for (let i = 0; i < full; i++) credits[i] = 1;
  if (full < total) credits[full] = rem;
  return credits;
}

function check(name, ok, detail = "") {
  if (!ok) {
    console.error(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
    process.exit(1);
  }
  console.log(`PASS  ${name}${detail ? `  [${detail}]` : ""}`);
}

for (const pct of [59, 60, 80, 81]) {
  const advisory = boardFromCredits(creditsForPct(pct));
  const live = scoreAdvisoryChecks(advisory);
  const klass = computeGoNoGo(advisory);
  const oracle = oracleScore(advisory);
  const verdict = oracleVerdict(advisory);
  check(`band ${pct}% score`, live.pct === pct && oracle.pct === pct, `live=${live.pct} oracle=${oracle.pct}`);
  const expect = pct > GONOGO_SCORE_BANDS.WATCH_MAX ? "GO" : pct >= GONOGO_SCORE_BANDS.NOGO_MAX ? "WATCH" : "NO-GO";
  check(`band ${pct}% verdict`, klass === expect && verdict === expect, `${klass}/${verdict}`);
}

{
  const advisory = boardFromCredits(Array(18).fill(1), { f4: "Below floor" });
  check("F4 hard stop is NO-GO even at 100%", computeGoNoGo(advisory) === "NO-GO" && oracleVerdict(advisory) === "NO-GO");
}

{
  const advisory = boardFromCredits(Array(18).fill(1), { f4: "Not yet run" });
  advisory.f4.items = [];
  check("unfinished filter is INCOMPLETE", computeGoNoGo(advisory) === "INCOMPLETE" && oracleVerdict(advisory) === "INCOMPLETE");
}

{
  const advisory = boardFromCredits(Array(18).fill(1), { f2: "Marked down" });
  check("mark-down caps GO at WATCH", computeGoNoGo(advisory) === "WATCH" && oracleVerdict(advisory) === "WATCH");
}

{
  const advisory = boardFromCredits(Array(18).fill(1));
  advisory.f1.capsGo = true;
  check("GO cap (capsGo) is WATCH", computeGoNoGo(advisory) === "WATCH" && oracleVerdict(advisory) === "WATCH");
}

{
  const advisory = boardFromCredits(creditsForPct(81));
  const first = { pct: oracleScore(advisory).pct, klass: oracleVerdict(advisory) };
  for (let i = 0; i < 25; i++) {
    const again = JSON.parse(JSON.stringify(advisory));
    assert.equal(oracleScore(again).pct, first.pct);
    assert.equal(oracleVerdict(again), first.klass);
    assert.equal(scoreAdvisoryChecks(again).pct, first.pct);
    assert.equal(computeGoNoGo(again), first.klass);
  }
  check("25 identical repeats are stable", true, `${first.pct}% ${first.klass}`);
}

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

const mutationRun = process.env.SCORING_MUTATION === "1";
const oracleRuns = mutationRun ? 80 : 5000;
let compared = 0;
fc.assert(
  fc.property(boardArb, (advisory) => {
    compared += 1;
    const live = scoreAdvisoryChecks(advisory);
    const klass = computeGoNoGo(advisory);
    const oracle = oracleScore(advisory);
    const verdict = oracleVerdict(advisory);
    if (live.pct !== oracle.pct || live.total !== oracle.total) return false;
    return klass === verdict;
  }),
  { numRuns: oracleRuns, seed: 20261120 }
);

{
  const adequate = boardFromCredits(Array(18).fill(1));
  check("adequate evidence does not cap GO", computeGoNoGo(adequate) === "GO" && oracleVerdict(adequate) === "GO");
}

fc.assert(
  fc.property(boardArb, fc.integer({ min: 0, max: 17 }), creditArb, (advisory, idx, bump) => {
    const filters = ["f1", "f2", "f3", "f4"];
    const slots = [F1_SLOTS, F2_SLOTS, F3_SLOTS, F4_SLOTS];
    let n = idx;
    let filter = 0;
    while (n >= slots[filter].length) { n -= slots[filter].length; filter += 1; }
    const key = filters[filter];
    const raised = JSON.parse(JSON.stringify(advisory));
    const item = raised[key].items[n];
    const next = Math.min(1, Number(item.credit || 0) + bump);
    item.credit = next;
    if (next > 0) item.status = "done";
    return scoreAdvisoryChecks(raised).pct >= scoreAdvisoryChecks(advisory).pct;
  }),
  { numRuns: mutationRun ? 40 : 200, seed: 20261120 }
);
check("property: more credit never lowers the score", true);

{
  const advisory = boardFromCredits(creditsForPct(73));
  const reordered = { f4: advisory.f4, f1: advisory.f1, f3: advisory.f3, f2: advisory.f2 };
  check(
    "key order independence",
    scoreAdvisoryChecks(reordered).pct === scoreAdvisoryChecks(advisory).pct &&
      computeGoNoGo(reordered) === computeGoNoGo(advisory)
  );
}

console.log(`PASS scoring+verdict oracle ${compared} boards vs ${SCORING_RULESET_VERSION} (${SCORING_MODEL}, ${SCORE_DENOMINATOR_MODE})`);
