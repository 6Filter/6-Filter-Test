/**
 * Part 135 — pure cliff arithmetic. Owner source of truth. Do not edit to weaken.
 */
import assert from "node:assert/strict";
import {
  FIXED_PRICE_POINTS,
  priceCrossings,
  cliffLossFromEvents,
  evaluatePriceResilience,
  crossedPointFromPrices,
  quoteContainsFigure,
} from "../../lib/priceResilience.js";
import { F3_HORIZON_YEARS, VOLUME_LOSS_CEILING_PCT } from "../../lib/lockedConstants.js";

assert.deepEqual([...FIXED_PRICE_POINTS], [1, 2, 5, 10, 20, 50, 100]);
assert.equal(F3_HORIZON_YEARS, 5);
assert.equal(VOLUME_LOSS_CEILING_PCT, 10);

let n = 0;
function check(cond, msg) {
  n += 1;
  assert.ok(cond, `check ${n}: ${msg}`);
}

// Needs price / inflation
{
  const a = priceCrossings({ launchPrice: null, annualIncreasePct: 5 });
  check(a.ok === false && a.reason === "NEEDS_PRICE", "needs price");
  const b = priceCrossings({ launchPrice: 9, annualIncreasePct: null });
  check(b.ok === false && b.reason === "NEEDS_INFLATION_COVER", "needs inflation");
}

// No rise → no crossings
{
  const c = priceCrossings({ launchPrice: 9, annualIncreasePct: 0, horizonYears: 5 });
  check(c.ok && c.crossings.length === 0, "zero rise");
}

// On a point — first increase crosses it
{
  const c = priceCrossings({ launchPrice: 10, annualIncreasePct: 5, horizonYears: 5 });
  check(c.ok && c.crossings.some((x) => x.point === 10 && x.year === 1), "on-point exposed year 1");
}

// Below 10, rises across 10
{
  const c = priceCrossings({ launchPrice: 9, annualIncreasePct: 8, horizonYears: 5 });
  check(c.ok && c.crossings.some((x) => x.point === 10), "crosses 10");
  check(!c.crossings.some((x) => x.point === 5), "already above 5 does not cross 5");
}

// Two crossings
{
  const c = priceCrossings({ launchPrice: 9, annualIncreasePct: 40, horizonYears: 5 });
  const points = c.crossings.map((x) => x.point);
  check(points.includes(10) && points.includes(20), "two crossings");
}

// Above last point — nothing to cross
{
  const c = priceCrossings({ launchPrice: 150, annualIncreasePct: 10, horizonYears: 5 });
  check(c.ok && c.crossings.length === 0, "above last");
}

// Horizon matters
{
  const short = priceCrossings({ launchPrice: 9.5, annualIncreasePct: 2, horizonYears: 1 });
  const long = priceCrossings({ launchPrice: 9.5, annualIncreasePct: 2, horizonYears: 5 });
  check(long.crossings.length >= short.crossings.length, "longer horizon ≥ crossings");
}

// cliffLossFromEvents — verified only; same-point beats analogous
{
  const events = [
    { verified: false, crossed_point: 10, volume_change_pct: -40, quote: "40%", source_url: "https://a" },
    { verified: true, crossed_point: 10, volume_change_pct: -8, quote: "lost 8%", source_url: "https://b" },
    { verified: true, crossed_point: 10, volume_change_pct: -6, quote: "down 6 percent", source_url: "https://c" },
    { verified: true, crossed_point: 10, volume_change_pct: -12, quote: "12% drop", source_url: "https://d" },
  ];
  const loss = cliffLossFromEvents(events, 10);
  check(loss.ok && loss.evidenceLevel === "strong", "3 same-point = strong");
  check(loss.n === 3, "unverified ignored");
  check(Math.abs(loss.medianPct - 8) < 1e-9, "median 8");
  check(loss.worstPct === 12, "worst shown");
}

{
  const one = cliffLossFromEvents(
    [{ verified: true, crossed_point: 10, volume_change_pct: -5, quote: "5%", source_url: "https://x" }],
    10
  );
  check(one.evidenceLevel === "weak", "one = weak");
  const two = cliffLossFromEvents(
    [
      { verified: true, crossed_point: 10, volume_change_pct: -5, quote: "5%", source_url: "https://x" },
      { verified: true, crossed_point: 10, volume_change_pct: -7, quote: "7%", source_url: "https://y" },
    ],
    10
  );
  check(two.evidenceLevel === "adequate", "two = adequate");
}

{
  const none = cliffLossFromEvents([], 10);
  check(!none.ok && String(none.reason).includes("NO_EVIDENCE_FOR_POINT_10"), "no evidence");
}

{
  const gain = cliffLossFromEvents(
    [{ verified: true, crossed_point: 10, volume_change_pct: 5, quote: "grew 5%", source_url: "https://x" }],
    10
  );
  check(gain.ok && gain.lossPct === 0, "gain counts as no loss");
}

// evaluatePriceResilience
{
  const noCross = evaluatePriceResilience({
    launchPrice: 150,
    annualIncreasePct: 3,
    events: [],
  });
  check(noCross.status === "pass" && noCross.level === "strong" && noCross.credit === 1, "no crossing full credit");
}

{
  const pass = evaluatePriceResilience({
    launchPrice: 9,
    annualIncreasePct: 8,
    events: [
      { verified: true, crossed_point: 10, volume_change_pct: -8, quote: "8%", source_url: "https://a" },
      { verified: true, crossed_point: 10, volume_change_pct: -7, quote: "7%", source_url: "https://b" },
      { verified: true, crossed_point: 10, volume_change_pct: -9, quote: "9%", source_url: "https://c" },
    ],
  });
  check(pass.status === "pass" && pass.credit === 1, "≤10% strong pass");
}

{
  const atTen = evaluatePriceResilience({
    launchPrice: 9,
    annualIncreasePct: 8,
    events: [
      { verified: true, crossed_point: 10, volume_change_pct: -10, quote: "10%", source_url: "https://a" },
      { verified: true, crossed_point: 10, volume_change_pct: -10, quote: "10%", source_url: "https://b" },
      { verified: true, crossed_point: 10, volume_change_pct: -10, quote: "10%", source_url: "https://c" },
    ],
  });
  check(atTen.status === "pass", "exactly 10% allowed");
}

{
  const fail = evaluatePriceResilience({
    launchPrice: 9,
    annualIncreasePct: 8,
    events: [
      { verified: true, crossed_point: 10, volume_change_pct: -15, quote: "15%", source_url: "https://a" },
      { verified: true, crossed_point: 10, volume_change_pct: -18, quote: "18%", source_url: "https://b" },
      { verified: true, crossed_point: 10, volume_change_pct: -12, quote: "12%", source_url: "https://c" },
    ],
  });
  check(fail.status === "fail" && fail.credit === 0 && fail.worstPoint === 10, "above 10% fails");
}

{
  const cannot = evaluatePriceResilience({
    launchPrice: 9,
    annualIncreasePct: 8,
    events: [],
  });
  check(cannot.status === "cannot-assess" && cannot.credit === 0, "crossing without evidence");
}

{
  const failBeats = evaluatePriceResilience({
    launchPrice: 9,
    annualIncreasePct: 40,
    events: [
      { verified: true, crossed_point: 10, volume_change_pct: -20, quote: "20%", source_url: "https://a" },
      { verified: true, crossed_point: 10, volume_change_pct: -22, quote: "22%", source_url: "https://b" },
      { verified: true, crossed_point: 10, volume_change_pct: -18, quote: "18%", source_url: "https://c" },
      // 20 has no evidence — cannot — but fail at 10 wins
    ],
  });
  check(failBeats.status === "fail", "fail beats cannot-assess");
}

// crossed_point / quote helpers
check(crossedPointFromPrices(9, 11) === 10, "single cross");
check(crossedPointFromPrices(9, 25) === null, "several → null");
check(crossedPointFromPrices(11, 12) === null, "none");
check(quoteContainsFigure("lost about 8% volume", -8), "quote has figure");
check(!quoteContainsFigure("volume softened", -8), "quote missing figure");

console.log(`PASS owner testFilter3Cliff (${n} checks)`);
