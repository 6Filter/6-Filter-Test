/**
 * f3HasEnough still gates research / MRP readiness; progressive filter unlock is retired —
 * isFilterUnlocked is always true regardless of f3 state.
 */
import assert from "node:assert/strict";
import { f3HasEnough, isFilterUnlocked, nextLockedHint } from "../lib/filterUnlock.js";

const base = {
  f1: {
    declaredAttribute: "cooling feel that lasts",
    benchmark: "Indulekha Bringha",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "share take from current oil users",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 55 },
};

assert.equal(f3HasEnough({ marginElasticity: { minMrpInr: 277, maxMrpInr: 361 } }), true);
assert.equal(
  f3HasEnough(
    { marginElasticity: { minMarginPct: 20, maxMarginPct: 38 } },
    { cogsAtScale: 40, netMarginAtScale: 55 }
  ),
  false,
  "legacy %-only band without resolvable F2 price is not f3-enough"
);
assert.equal(
  f3HasEnough({ marginElasticity: { minMrpInr: 277 } }),
  false,
  "half a ₹ band is not f3-enough"
);
assert.equal(
  f3HasEnough({}, { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 }),
  true,
  "resolvable Filter 2 MRP is f3-enough without a stored band"
);

const sparseDoc = {
  ...base,
  f3: { marginElasticity: { minMarginPct: 20, maxMarginPct: 38 } },
};
assert.equal(isFilterUnlocked("f4", sparseDoc), true, "F4 form stays open even when f3 is not enough");
assert.equal(isFilterUnlocked("f4", { ...base, f3: {} }), true);
assert.equal(nextLockedHint(sparseDoc), null);

console.log("PASS testF3HasEnoughOpenFilters");
