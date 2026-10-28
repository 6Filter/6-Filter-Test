/**
 * Typed F1 benchmark must still trigger Filter 1 research (web verify).
 */
import assert from "node:assert/strict";
import { expectedResearchSteps, handEntered, shouldRunStep } from "../lib/researchProgress.js";
import { scopedSearchInstruction } from "../lib/scopedSearch.js";
import { readFileSync } from "node:fs";

const doc = {
  name: "Amla hair oil",
  category: "Hair oils",
  ideaDescription: "Herbal amla oil for softness",
  f1: {
    declaredAttribute: "softness",
    benchmark: "Parachute Advansed",
    declaredGap: 3,
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 55 },
};

assert.equal(handEntered(doc, "F1"), false);
assert.equal(expectedResearchSteps(doc).includes("F1"), true);
assert.equal(shouldRunStep(doc, "f1"), true);
assert.equal(handEntered(doc, "F2"), true);
assert.equal(shouldRunStep(doc, "cost"), false);

const scope = scopedSearchInstruction("Nielsen Kantar category size competitors", "Hair oils", {
  brand: "Parachute Advansed",
});
assert.match(scope, /BENCHMARK VERIFY/);
assert.match(scope, /Parachute Advansed/);

const progress = readFileSync(new URL("../lib/researchProgress.js", import.meta.url), "utf8");
assert.match(progress, /must not skip F1 search|research \*inputs\*/i);

const sizing = readFileSync(new URL("../lib/categoryIntelligence/runSizing.js", import.meta.url), "utf8");
assert.match(sizing, /brand:\s*benchmarkName/);

console.log("PASS typed benchmark still runs F1 web verify");
