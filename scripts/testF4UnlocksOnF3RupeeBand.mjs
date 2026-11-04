/**
 * F4 must unlock as soon as Filter 3 has a safe ₹ MRP band.
 * Requiring maxMarginPct forced users to click "Re-run this estimate".
 */
import assert from "node:assert/strict";
import { f3HasEnough, isFilterUnlocked } from "../lib/filterUnlock.js";

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
  isFilterUnlocked("f4", {
    ...base,
    f3: { marginElasticity: { minMrpInr: 277, maxMrpInr: 361 } },
  }),
  true,
  "rupee-only F3 unlocks F4"
);

assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f3: {
      marginElasticity: { minMrpInr: null, maxMrpInr: null },
      f3RangeOverride: { minMrpInr: 200, maxMrpInr: 280 },
    },
  }),
  true,
  "typed Min/Max MRP override unlocks F4"
);

assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f2: { cogsAtScale: 40, netMarginAtScale: 55 },
    f3: { marginElasticity: { minMarginPct: 20, maxMarginPct: 38 } },
  }),
  true,
  "legacy %-only band still unlocks once COGS hydrates ₹ ends"
);
assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f3: { marginElasticity: { minMrpInr: 277 } },
  }),
  false,
  "half a ₹ band does not unlock F4"
);

console.log("PASS testF4UnlocksOnF3RupeeBand");
