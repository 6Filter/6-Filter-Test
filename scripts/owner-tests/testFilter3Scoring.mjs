/**
 * Part 135 — Filter 3 scoring: one resilience check; band scores nothing.
 * Owner source of truth. Do not edit to weaken.
 */
import assert from "node:assert/strict";
import { applyFilter3Rules, F3_ITEM_CODES } from "../../lib/priceResilience.js";
import { checkF3 } from "../../lib/filterChecks.js";
import { computeGoNoGo, goNoGoIsFloorFailure, hasGoCap } from "../../lib/goNoGo.js";
import { SCORE_CHECK_SLOTS, SCORE_CHECK_SLOTS_TOTAL } from "../../lib/lockedConstants.js";
import { resolveF2Price } from "../../lib/mrpFormula.js";

assert.equal(SCORE_CHECK_SLOTS.f3, 1);
assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);

let n = 0;
function check(cond, msg) {
  n += 1;
  assert.ok(cond, `check ${n}: ${msg}`);
}

function credit(result) {
  return (result.items || []).filter((i) => !i.formAdmin).reduce((s, i) => s + (Number(i.credit) || 0), 0);
}

const strongEvents = [
  { verified: true, crossed_point: 10, volume_change_pct: -8, quote: "8%", source_url: "https://a" },
  { verified: true, crossed_point: 10, volume_change_pct: -7, quote: "7%", source_url: "https://b" },
  { verified: true, crossed_point: 10, volume_change_pct: -9, quote: "9%", source_url: "https://c" },
];

// No price → Not yet run
{
  const r = applyFilter3Rules({ price: null, priceEvents: { annualIncreasePct: 5, events: [] } });
  check(r.checkLabel === "Not yet run" && (r.items || []).length === 0, "no price");
}

// Preview never invents a verdict
{
  const r = applyFilter3Rules({
    price: 9,
    priceEvents: { annualIncreasePct: 8, events: strongEvents },
    preview: true,
  });
  check(/assessed when you Submit/i.test(r.items[0]?.text || ""), "preview");
  check(credit(r) === 0, "preview credit 0");
}

// No crossing — pass strong, no evidence needed
{
  const r = applyFilter3Rules({
    price: 150,
    priceEvents: { annualIncreasePct: 5, events: [] },
  });
  check(r.checkLabel === "Cleared" && credit(r) === 1, "no crossing");
  check(r.items[0].code === F3_ITEM_CODES.F3_RESILIENCE_PASS, "pass code");
}

// Strong / adequate / weak
{
  const strong = applyFilter3Rules({
    price: 9,
    priceEvents: { annualIncreasePct: 8, events: strongEvents },
  });
  check(strong.checkLabel === "Cleared" && credit(strong) === 1, "strong");

  const adequate = applyFilter3Rules({
    price: 9,
    priceEvents: {
      annualIncreasePct: 8,
      events: strongEvents.slice(0, 2),
    },
  });
  check(adequate.items[0].code === F3_ITEM_CODES.F3_RESILIENCE_PASS_ADEQUATE, "adequate code");
  check(Math.abs(credit(adequate) - 2 / 3) < 1e-9, "adequate credit");
  check(adequate.capsGo !== true, "adequate does not cap GO");

  const weak = applyFilter3Rules({
    price: 9,
    priceEvents: {
      annualIncreasePct: 8,
      events: strongEvents.slice(0, 1),
    },
  });
  check(weak.items[0].code === F3_ITEM_CODES.F3_RESILIENCE_PASS_WEAK, "weak code");
  check(Math.abs(credit(weak) - 1 / 3) < 1e-9, "weak credit");
  check(weak.capsGo === true, "weak caps GO");
}

// Fail / cannot-assess = mark-down, not Below floor, not hard stop
{
  const fail = applyFilter3Rules({
    price: 9,
    priceEvents: {
      annualIncreasePct: 8,
      events: [
        { verified: true, crossed_point: 10, volume_change_pct: -20, quote: "20%", source_url: "https://a" },
        { verified: true, crossed_point: 10, volume_change_pct: -18, quote: "18%", source_url: "https://b" },
        { verified: true, crossed_point: 10, volume_change_pct: -22, quote: "22%", source_url: "https://c" },
      ],
    },
  });
  check(fail.checkLabel === "Marked down", "fail marked down");
  check(fail.checkLabel !== "Below floor", "never Below floor");
  check(fail.items[0].code === F3_ITEM_CODES.F3_RESILIENCE_FAIL, "fail code");
  check(goNoGoIsFloorFailure({ f3: fail }) === false, "not floor");
  check(credit(fail) === 0, "fail credit 0");

  const cannot = applyFilter3Rules({
    price: 9,
    priceEvents: { annualIncreasePct: 8, events: [] },
  });
  check(cannot.checkLabel === "Marked down", "cannot marked down");
  check(cannot.items[0].code === F3_ITEM_CODES.F3_RESILIENCE_CANNOT_ASSESS, "cannot code");
}

// Price is Filter 2 MRP via resolveF2Price
{
  const f2 = { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18 };
  const priced = resolveF2Price(f2);
  const viaCheck = checkF3(f2, {}, {
    priceEvents: { annualIncreasePct: 0, events: [] },
  });
  check(priced.ok && viaCheck.checkLabel === "Cleared", "F2 price, no rise clears");
}

// Old band scores nothing
{
  const viaBand = checkF3(
    { cogsAtScale: 40, netMarginAtScale: 50, gstRatePct: 18, mrpInr: 999 },
    { marginElasticity: { minMrpInr: 1, maxMrpInr: 2 } },
    { priceEvents: { annualIncreasePct: 0, events: [] } }
  );
  // Override off → MRP recomputed; with annualIncrease 0 and derived price, still clears if no crossing
  check(viaBand.checkLabel !== "Below floor", "band never Below floor");
  check(!/safe .+ range/i.test(JSON.stringify(viaBand.items)), "no safe-range text");
}

// GO capped at WATCH on mark-down / weak
{
  const cleared = {
    f1: { checkLabel: "Cleared", items: Array.from({ length: 6 }, () => ({ status: "done", credit: 1 })) },
    f2: { checkLabel: "Cleared", items: [{ status: "done", credit: 1, slot: "margin" }] },
    f3: applyFilter3Rules({
      price: 9,
      priceEvents: { annualIncreasePct: 8, events: strongEvents.slice(0, 1) },
    }),
    f4: { checkLabel: "Cleared", items: Array.from({ length: 7 }, () => ({ status: "done", credit: 1 })) },
  };
  check(hasGoCap(cleared) === true, "weak has go cap");
  const band = computeGoNoGo(cleared);
  check(band === "WATCH" || band === "INCOMPLETE" || band === "GO" || band === "NO-GO", "computes");
  if (band === "GO") check(false, "weak must not stay GO");
}

console.log(`PASS owner testFilter3Scoring (${n} checks)`);
