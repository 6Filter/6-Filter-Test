/**
 * F4 must unlock once Filter 3 is "enough" — resolvable Filter 2 MRP (Part 135)
 * or a legacy stored safe ₹ MRP band on old ideas.
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
  "legacy rupee-only F3 unlocks F4"
);

assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 },
    f3: {},
  }),
  true,
  "resolvable Filter 2 MRP unlocks F4 without a stored band"
);

assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f3: { marginElasticity: { minMarginPct: 20, maxMarginPct: 38 } },
  }),
  false,
  "legacy %-only band without a resolvable F2 price does not unlock F4"
);
assert.equal(
  isFilterUnlocked("f4", {
    ...base,
    f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 },
    f3: { marginElasticity: { minMarginPct: 20, maxMarginPct: 38 } },
  }),
  true,
  "resolvable F2 MRP unlocks F4 even when only a legacy % band is stored"
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
