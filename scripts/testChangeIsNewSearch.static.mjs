/**
 * Static pins for CN6–CN8 / CN10 / CN11 (no DB). The full harness test is
 * scripts/testChangeIsNewSearch.mjs (owner original, untouched).
 *
 * On tip 976d6a6 these must FAIL for CN6–CN8 and CN10 wiring, and PASS for CN11 wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { researchInputKey } from "../lib/researchInputKey.js";
import { withScreeningDifficulty } from "../lib/difficultyLevel.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

const base = withScreeningDifficulty(
  {
    name: "Cavin's No Added Sugar milkshake",
    ideaDescription: "Ambient dairy milkshake with no added sugar for India",
    category: "Milkshake",
    division: "Beverages",
    researchRunAt: "2026-11-27T00:00:00.000Z",
    f1: {
      declaredAttribute: "no added sugar",
      benchmark: "Britannia Winkin Cow",
      declaredGap: 2,
      gapDerivation: "Claim missing from tetra competition",
      parityExceptions: "Source of calcium",
      growthRoute: "new market",
      growthArgument: "Opens a new set of buyers",
    },
    f2: { cogsAtScale: 40, netMarginAtScale: 45, gstRatePct: 12, grammage: "170 ml", mrpOverride: false },
    f3: { volumeLossJustification: "Shelf price held flat five years." },
    f4: {
      techShiftRisk: {
        overallRisk: "Medium",
        dimensions: { functionalCoreStability: { risk: "Medium", reason: "Ambient dairy stable" } },
      },
      userInputs: {
        functionalCoreStability: { pov: "Ambient dairy formats remain stable", rating: "Medium" },
      },
    },
  },
  1
);

const k0 = researchInputKey(base);

// CN1 / CN11 key: unchanged → same key
assert.equal(researchInputKey({ ...base }), k0, "CN1/CN11: unchanged → same researchInputKey");

// CN2: capitals/spaces only
assert.equal(
  researchInputKey({ ...base, ideaDescription: "  AMBIENT DAIRY MILKSHAKE WITH NO ADDED SUGAR FOR INDIA  " }),
  k0,
  "CN2: capitals/spaces only → same key"
);

// CN6–CN8: must differ (FAIL on tip if key omits these)
assert.notEqual(
  researchInputKey({
    ...base,
    f4: {
      ...base.f4,
      userInputs: {
        functionalCoreStability: { pov: "Completely different F4 view text", rating: "Medium" },
      },
    },
  }),
  k0,
  "CN6: Filter 4 view change → new key"
);
assert.notEqual(
  researchInputKey({ ...base, f2: { ...base.f2, cogsAtScale: 55 } }),
  k0,
  "CN7: COGS change → new key"
);
assert.notEqual(
  researchInputKey({ ...base, f2: { ...base.f2, netMarginAtScale: 52 } }),
  k0,
  "CN8: net margin change → new key"
);

// Form must import the shared key (not the old inline omitter)
assert.match(
  formSrc,
  /from ["']\.\.\/lib\/researchInputKey\.js["']/,
  "form imports lib/researchInputKey.js"
);
assert.doesNotMatch(formSrc, /function researchInputKey\s*\(/, "no local researchInputKey that omits F4/COGS");

// CN10 wiring: changed press must NOT send confirmMissingSteps
assert.match(
  formSrc,
  /confirmMissingSteps:\s*(repairing|unfinished)/,
  "CN10: confirmMissingSteps only for unfinished repair, not every fromPending"
);
assert.doesNotMatch(
  formSrc,
  /confirmMissingSteps:\s*repairing\s*\|\|\s*fromPending/,
  "CN10: must not tie confirmMissingSteps to fromPending (that causes f5-only 1s press)"
);

// CN11 wiring: output Submit must not always forceResearch:true (unchanged would re-search)
assert.doesNotMatch(
  formSrc,
  /onSubmit=\{\(\)\s*=>\s*handleSubmit\([\s\S]*?forceResearch:\s*true/,
  "CN11: output button must not hard-code forceResearch:true"
);

console.log("PASS testChangeIsNewSearch.static CN6–CN8 CN10 CN11 wiring");
