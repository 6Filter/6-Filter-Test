/**
 * Part 134 revised — Filter 2 scoring: net margin only (mark-down, not hard stop).
 * Owner source of truth. Do not edit to weaken.
 */
import assert from "node:assert/strict";
import { applyFilter2Rules, F2_ITEM_CODES } from "../../lib/filter2Check.js";
import { computeGoNoGo, goNoGoIsFloorFailure, filterBlocksGo } from "../../lib/goNoGo.js";
import {
  DIVISION_MIN_NET_MARGIN_PCT,
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
} from "../../lib/lockedConstants.js";
import { TECH_SHIFT_DIMENSIONS } from "../../lib/techShiftRisk.js";

assert.equal(SCORE_CHECK_SLOTS.f2, 1);
assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);

let n = 0;
function check(cond, msg) {
  n += 1;
  assert.ok(cond, `check ${n}: ${msg}`);
}

function credit(result) {
  return (result.items || []).filter((i) => !i.formAdmin).reduce((s, i) => s + (Number(i.credit) || 0), 0);
}

const baseCtx = { floor: 35, divisionLabel: "Foods" };

// Only margin scored
{
  const a = applyFilter2Rules(
    {
      netMarginAtScale: 40,
      cogsAtScale: 10,
      gstRatePct: 18,
      grammage: "100 g",
      mrpInr: 100,
      qcomTrajectory: "q",
    },
    baseCtx
  );
  check(credit(a) === 1, "full margin = 1");
  check(a.items.filter((i) => !i.formAdmin).length === 1, "one analytical item");
  check(a.checkLabel === "Cleared", "cleared");

  const b = applyFilter2Rules(
    { netMarginAtScale: 40, cogsAtScale: "", gstRatePct: "", grammage: "x", qcomTrajectory: "anything" },
    baseCtx
  );
  check(credit(b) === 1, "junk COGS/pack/qcom still 1");
}

// Margin boundary in five divisions — mark-down, not Below floor
for (const [div, floor] of [
  ["Foods", 35],
  ["Snacks", 30],
  ["Beverages", 25],
  ["Personal Care", 50],
  ["Cold Chain Business", 12],
]) {
  assert.equal(DIVISION_MIN_NET_MARGIN_PCT[div], floor);
  const below = applyFilter2Rules({ netMarginAtScale: floor - 0.1 }, { floor, divisionLabel: div });
  check(below.checkLabel === "Marked down", `${div} marked down`);
  check(below.checkLabel !== "Below floor", `${div} never Below floor`);
  check(below.items[0].code === F2_ITEM_CODES.F2_MARGIN_BELOW_MINIMUM, `${div} code`);
  check(credit(below) === 0, `${div} earns 0`);
  check(goNoGoIsFloorFailure({ f2: below }) === false, `${div} not floor failure`);

  const at = applyFilter2Rules({ netMarginAtScale: floor }, { floor, divisionLabel: div });
  check(at.checkLabel === "Cleared", `${div} at clears`);
  check(credit(at) === 1, `${div} at credit`);
}

// Blank = Evidence missing, not Marked down
{
  const miss = applyFilter2Rules({}, baseCtx);
  check(miss.checkLabel === "Evidence missing", "blank missing");
  check(miss.items[0].code === F2_ITEM_CODES.F2_MARGIN_MISSING, "missing code");
}

// Overridden MRP checked through implied margin
{
  const low = applyFilter2Rules(
    {
      cogsAtScale: 100,
      gstRatePct: 18,
      netMarginAtScale: 60,
      mrpOverride: true,
      mrpInr: 150,
    },
    { floor: 50, divisionLabel: "Personal Care" }
  );
  // preTax ≈ 127.12; margin ≈ 21.3% → below 50 → marked down
  check(low.checkLabel === "Marked down", "override below → marked down");
  check(credit(low) === 0, "override below earns 0");

  const ok = applyFilter2Rules(
    {
      cogsAtScale: 50,
      gstRatePct: 18,
      netMarginAtScale: 10,
      mrpOverride: true,
      mrpInr: 236,
    },
    { floor: 50, divisionLabel: "Personal Care" }
  );
  // preTax = 200; margin = 75% → clears
  check(ok.checkLabel === "Cleared", "override high clears");
  check(credit(ok) === 1, "override high credit");
}

// Mark-down caps GO at WATCH
{
  const f2 = applyFilter2Rules({ netMarginAtScale: 20 }, { floor: 35, divisionLabel: "Foods" });
  check(f2.checkLabel === "Marked down", "markdown label");
  const checks = {
    f1: {
      checkLabel: "Cleared",
      items: Array(6)
        .fill(null)
        .map((_, i) => ({ status: "done", credit: 1, slot: ["benchmark", "gap", "attributes", "derivation", "route", "argument"][i] })),
    },
    f2,
    f3: { checkLabel: "Cleared", items: [{ status: "done", credit: 1, slot: "mrpInSafeRange" }] },
    f4: {
      checkLabel: "Cleared",
      items: TECH_SHIFT_DIMENSIONS.map((d) => ({ status: "done", credit: 1, text: d })),
    },
  };
  check(computeGoNoGo(checks) === "WATCH", "GO capped at WATCH");
  check(goNoGoIsFloorFailure(checks) === false, "not NO-GO floor");
  check(filterBlocksGo(f2) === false, "mark-down does not unfinished-block");
}

// Property: only margin (and MRP override via implied margin) change the score
{
  const base = { netMarginAtScale: 40 };
  const baseCredit = credit(applyFilter2Rules(base, baseCtx));
  for (const [key, val] of [
    ["cogsAtScale", 1],
    ["gstRatePct", 28],
    ["grammage", "x"],
    ["qcomTrajectory", "q"],
    ["financeSigned", true],
  ]) {
    check(
      credit(applyFilter2Rules({ ...base, [key]: val }, baseCtx)) === baseCredit,
      `${key} must not change score`
    );
  }
  check(credit(applyFilter2Rules({ netMarginAtScale: 20 }, baseCtx)) === 0, "low margin changes score");
}

console.log(`PASS owner testFilter2Scoring (${n} checks)`);
