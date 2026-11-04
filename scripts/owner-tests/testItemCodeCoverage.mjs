/**
 * Part 132 — every ITEM_CODES entry has catalogue copy; every pending check item carries a code.
 */
import assert from "node:assert/strict";
import { checkF1, checkF3, checkF4, ITEM_CODES } from "../../lib/filterChecks.js";
import { assertItemCopyComplete, ITEM_COPY } from "../../lib/itemCopy.js";

const codes = Object.values(ITEM_CODES);
assert.ok(codes.length >= 20);
for (const code of codes) {
  assert.ok(ITEM_COPY[code], `missing ITEM_COPY for ${code}`);
}
const { missing, bad } = assertItemCopyComplete(codes);
assert.deepEqual(missing, []);
assert.deepEqual(bad, []);

const pendingF1 = checkF1(
  {
    declaredAttribute: "taste",
    benchmark: "Brand X Serum",
    declaredGap: 3,
    growthRoute: "new-market",
    growthArgument: "new occasions",
  },
  {}
);
for (const it of pendingF1.items.filter((i) => i.status === "pending" && !i.formAdmin)) {
  assert.ok(it.code, `pending F1 item needs code: ${it.text}`);
  assert.ok(ITEM_CODES[it.code] || Object.values(ITEM_CODES).includes(it.code));
}

const pendingF3 = checkF3(
  { cogsAtScale: 40, netMarginAtScale: 20, gstRatePct: 18, mrpInr: 10 },
  { marginElasticity: { minMrpInr: 80, maxMrpInr: 120 } }
);
for (const it of pendingF3.items.filter((i) => i.status === "pending")) {
  assert.ok(it.code, `pending F3 item needs code: ${it.text}`);
}

const pendingF4 = checkF4({}, { researchFailed: true });
assert.ok(pendingF4.items[0].code);

console.log("PASS owner testItemCodeCoverage");
