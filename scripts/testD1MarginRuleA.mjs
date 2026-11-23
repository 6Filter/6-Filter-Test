/**
 * D1 OWNER'S DECISION: A (23 Nov 2026).
 * A net margin below the division minimum is a mark-down capped at WATCH.
 * A business head / manager may approve it forward. CKR is not in the path.
 * Must not become a Filter-4-style hard NO-GO.
 */
import assert from "node:assert/strict";
import { applyFilter2Rules, F2_ITEM_CODES } from "../lib/filter2Check.js";
import { DIVISION_MIN_NET_MARGIN_PCT } from "../lib/lockedConstants.js";
import { MANAGER_APPROVE_ROLES, canApproveManagerRole, viewerCanApproveManagerReview } from "../lib/managerReview.js";

function f2(margin) {
  return { netMarginAtScale: margin, grammage: "100 g", gstRatePct: 18 };
}

const foodsBelow = applyFilter2Rules(f2(20), { floor: 35, divisionLabel: "Foods" });
assert.equal(foodsBelow.checkLabel, "Marked down");
assert.equal(foodsBelow.markedDown, true);
assert.notEqual(foodsBelow.checkLabel, "Below floor");
const foodsMargin = foodsBelow.items.find((row) => row.slot === "margin");
assert.equal(foodsMargin.code, F2_ITEM_CODES.F2_MARGIN_BELOW_MINIMUM);
assert.equal(foodsMargin.credit, 0);
assert.doesNotMatch(foodsMargin.text, /Below floor/i);

const foodsAtFloor = applyFilter2Rules(f2(35), { floor: 35, divisionLabel: "Foods" });
assert.equal(foodsAtFloor.items.find((row) => row.slot === "margin").code, F2_ITEM_CODES.F2_MARGIN_CLEARS);
assert.notEqual(foodsAtFloor.checkLabel, "Marked down");

for (const [division, floor] of Object.entries(DIVISION_MIN_NET_MARGIN_PCT)) {
  if (floor == null) {
    const pending = applyFilter2Rules(f2(20), { floor: null, divisionLabel: division });
    assert.notEqual(pending.checkLabel, "Below floor", division);
    assert.equal(pending.items.find((row) => row.slot === "margin").code, F2_ITEM_CODES.F2_MARGIN_MISSING);
    continue;
  }
  const below = applyFilter2Rules(f2(floor - 1), { floor, divisionLabel: division });
  assert.equal(below.checkLabel, "Marked down", division);
  assert.equal(below.markedDown, true, division);
  assert.equal(below.items.find((row) => row.slot === "margin").code, F2_ITEM_CODES.F2_MARGIN_BELOW_MINIMUM, division);
}

assert.deepEqual(MANAGER_APPROVE_ROLES, ["ADMIN", "BH FORUM"]);
assert.equal(canApproveManagerRole("ADMIN"), true);
assert.equal(canApproveManagerRole("BH FORUM"), true);
assert.equal(canApproveManagerRole("BM"), false);
assert.equal(canApproveManagerRole("CKR"), false);

const watchDoc = { goNoGo: { classification: "WATCH" }, createdByEmail: "owner@cavinkare.com", managerReviewState: { isOpen: true } };
assert.equal(
  viewerCanApproveManagerReview({ role: "BH FORUM", email: "head@cavinkare.com" }, watchDoc),
  true
);
assert.equal(
  viewerCanApproveManagerReview({ role: "BH FORUM", email: "owner@cavinkare.com" }, watchDoc),
  false,
  "the idea owner cannot approve their own WATCH"
);
assert.equal(viewerCanApproveManagerReview({ role: "BM", email: "peer@cavinkare.com" }, watchDoc), false);

console.log("PASS D1 margin rule A — mark-down + business-head/manager approval, not CKR hard stop");
