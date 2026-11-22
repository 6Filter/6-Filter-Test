/**
 * Design evidence for option A (not a product change): filling net margin with
 * the locked division floor makes the locked Filter 2 margin check pass.
 * Scoring files are imported, never edited.
 */
import assert from "node:assert/strict";
import { applyDivisionMinimumMargin } from "../lib/netMarginDefault.js";
import { applyFilter2Rules, F2_ITEM_CODES } from "../lib/filter2Check.js";
import { minNetMarginForDivision } from "../lib/lockedConstants.js";

const floor = minNetMarginForDivision("Foods");
assert.equal(floor, 35);

const empty = applyDivisionMinimumMargin({ division: "Foods", f2: {} });
assert.equal(empty.changed, true);
assert.equal(empty.f2.netMarginAtScale, 35);
assert.equal(empty.f2.netMarginSource, "division-minimum");

const check = applyFilter2Rules(empty.f2, { floor, divisionLabel: "Foods" });
const margin = check.items.find((it) => it.slot === "margin");
assert.equal(margin.code, F2_ITEM_CODES.F2_MARGIN_CLEARS);
assert.equal(margin.credit, 1);
assert.match(String(margin.text), /clears the 35%/);

const stillBlank = applyFilter2Rules({}, { floor, divisionLabel: "Foods" });
const missing = stillBlank.items.find((it) => it.slot === "margin");
assert.equal(missing.code, F2_ITEM_CODES.F2_MARGIN_MISSING);
assert.equal(missing.credit, 0);

console.log(
  "PASS testDivisionFloorGivesMarginCredit — Foods floor 35% written into a blank box earns the locked margin check (credit 1). A person who types nothing gets that point."
);
