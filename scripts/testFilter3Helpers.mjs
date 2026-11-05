/**
 * Part 135 — quote-contains-figure, crossed_point awkward pairs, and a property
 * that only price / inflation cover / verified events change the Filter 3 score.
 */
import assert from "node:assert/strict";
import {
  crossedPointFromPrices,
  quoteContainsFigure,
  applyFilter3Rules,
} from "../lib/priceResilience.js";

assert.equal(crossedPointFromPrices(4.9, 5.1), 5);
assert.equal(crossedPointFromPrices(5, 5.01), 5);
assert.equal(crossedPointFromPrices(49, 51), 50);
assert.equal(crossedPointFromPrices(1, 100), null, "many points → null");
assert.equal(crossedPointFromPrices(0.5, 0.9), null);

assert.equal(quoteContainsFigure("volume fell by 12.5%", -12.5), true);
assert.equal(quoteContainsFigure("down 12 percent", -12), true);
assert.equal(quoteContainsFigure("unchanged", -12), false);
assert.equal(quoteContainsFigure("volume 120 units", -12), false);

const verified = [
  { verified: true, crossed_point: 10, volume_change_pct: -8, quote: "8%", source_url: "https://a" },
  { verified: true, crossed_point: 10, volume_change_pct: -6, quote: "6%", source_url: "https://b" },
  { verified: true, crossed_point: 10, volume_change_pct: -7, quote: "7%", source_url: "https://c" },
];

function scoreOf(price, annual, events) {
  return applyFilter3Rules({
    price,
    priceEvents: { annualIncreasePct: annual, events },
  });
}

const base = scoreOf(9, 8, verified);
for (const junk of [
  verified.map((e) => ({ ...e, brand: "ZZZ", date: "2099", product: "noise" })),
  verified.map((e) => ({ ...e, unverified_note: "x" })),
]) {
  const next = scoreOf(9, 8, junk);
  assert.equal(next.items[0].credit, base.items[0].credit, "non-scoring event fields");
  assert.equal(next.checkLabel, base.checkLabel);
}

const unverifiedNoise = scoreOf(9, 8, [
  ...verified,
  { verified: false, crossed_point: 10, volume_change_pct: -90, quote: "90%", source_url: "https://z" },
]);
assert.equal(unverifiedNoise.items[0].credit, base.items[0].credit, "unverified ignored");

const movedPrice = scoreOf(150, 8, verified);
assert.equal(movedPrice.checkLabel, "Cleared");
assert.equal(movedPrice.items[0].credit, 1, "high price no crossing");

const zeroInflation = scoreOf(9, 0, verified);
assert.equal(zeroInflation.items[0].credit, 1, "no rise");

console.log("PASS testFilter3Helpers");
