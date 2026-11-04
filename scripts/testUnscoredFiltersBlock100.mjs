/**
 * Unscored F3/F4 must weigh against the percent — cleared F1–F2 alone must not seal at 100%.
 */
import assert from "node:assert/strict";
import {
  filterCheckScore,
  filterIsUnscoredForAggregate,
  scoreAdvisoryChecks,
  computeGoNoGo,
} from "../lib/goNoGo.js";
import { checkF3, checkF4 } from "../lib/filterChecks.js";

const clearedF1F2F3 = {
  f1: {
    checkLabel: "Cleared",
    items: [
      { status: "done", text: "Benchmark relevant", slot: "benchmark" },
      { status: "done", text: "Gap clears floor", slot: "gap" },
      { status: "done", text: "Evidence ok", slot: "attributes" },
      { status: "done", text: "Derivation ok", slot: "derivation" },
      { status: "done", text: "Route ok", slot: "route" },
      { status: "done", text: "Argument ok", slot: "argument" },
    ],
  },
  f2: {
    checkLabel: "Cleared",
    items: [
      { status: "done", text: "MRP ok" },
      { status: "done", text: "Net margin clears floor" },
      { status: "done", text: "Qcom recorded" },
      { status: "pending", text: "Finance unsigned", formAdmin: true },
    ],
  },
  f3: { checkLabel: "Cleared", items: [{ status: "done", text: "MRP in range" }] },
};

const f4Empty = checkF4({});
assert.equal(f4Empty.checkLabel, "Not yet run");
assert.equal(filterCheckScore(f4Empty).total, 0, "per-filter empty score stays 0 (Part 62)");
assert.equal(filterIsUnscoredForAggregate(f4Empty), true);

const noF4 = scoreAdvisoryChecks({ ...clearedF1F2F3, f4: f4Empty });
assert.ok(noF4.pct < 100, `cleared F1–F3 + unrun F4 must not be 100% (got ${noF4.pct})`);
assert.equal(noF4.byFilter.f4.unscored, true);
assert.equal(noF4.total, 17, "Part 133 fixed slots — denominator is always 17");
assert.equal(noF4.byFilter.f4.total, 7, "unrun F4 opens all 7 risk slots");
// Fixed slots: 10/17 ≈ 59%; unfinished F4 → INCOMPLETE (Part 129), not a NO-GO band.
assert.equal(computeGoNoGo({ ...clearedF1F2F3, f4: f4Empty }), "INCOMPLETE");

const f3Empty = checkF3({ netMarginAtScale: 40 }, {});
assert.equal(f3Empty.checkLabel, "Not yet run");
assert.equal(filterCheckScore(f3Empty).total, 0);
const noF3F4 = scoreAdvisoryChecks({ ...clearedF1F2F3, f3: f3Empty, f4: f4Empty });
assert.ok(noF3F4.pct < 100);
assert.ok(noF3F4.pct < noF4.pct, "two unscored filters must weigh more than one");
assert.equal(noF3F4.total, 17);

const formAdminOnlyF3 = {
  checkLabel: "Evidence missing",
  items: [{ status: "pending", text: "Margin elasticity not yet computed", formAdmin: true }],
};
assert.equal(filterIsUnscoredForAggregate(formAdminOnlyF3), true);
const adminOnly = scoreAdvisoryChecks({
  ...clearedF1F2F3,
  f3: formAdminOnlyF3,
  f4: f4Empty,
});
assert.ok(adminOnly.pct < 100, "form-admin-only F3 must not vanish from the aggregate");

console.log(
  `PASS unscored filters block 100%: F4-unrun=${noF4.pct}% F3+F4-unrun=${noF3F4.pct}% formAdmin-F3=${adminOnly.pct}%`
);
