import assert from "node:assert/strict";
import { competitivePositionNote } from "../lib/filters/runMarginElasticityResearch.js";
import { formatObsolescenceVerdict } from "../lib/filters/filter4TechShift.js";
import { applyVerdictLeads } from "../lib/filterNarrativeText.js";
import { generateFilterNarratives } from "../lib/filterNarratives.js";
import { fingerprintNarrativeInputs } from "../lib/researchCache.js";
import { computeGoNoGo } from "../lib/goNoGo.js";

function assertNote(cogs, margin, avg, expect) {
  const got = competitivePositionNote({
    cogsAtScale: cogs,
    netMarginAtScale: margin,
    categoryAvgPriceInr: avg,
  });
  assert(got, `expected a competitive note for cogs=${cogs} margin=${margin} avg=${avg}`);
  assert.match(got.competitiveNote, expect);
  return got;
}

assertNote(50, 20, 62, /within 5% of the category average \(₹62\)/);
assertNote(80, 50, 100, /Priced 60% above the category average \(₹100\)/);
assertNote(40, 20, 100, /Priced 50% below the category average \(₹100\)/);
assert.equal(
  competitivePositionNote({ cogsAtScale: 50, netMarginAtScale: 20, categoryAvgPriceInr: null }),
  null
);

assert.match(formatObsolescenceVerdict({ formatTrajectory: "declining" }), /lose relevance within the next five years/);
assert.match(formatObsolescenceVerdict({ formatTrajectory: "rising" }), /rising side of the shift/);
assert.match(
  formatObsolescenceVerdict({ formatTrajectory: "flat", earlyRiskSignal: "weak" }),
  /early signals exist/
);
assert.match(
  formatObsolescenceVerdict({ formatTrajectory: "flat", earlyRiskSignal: "none" }),
  /No displacement signal found/
);
assert.equal(formatObsolescenceVerdict({ formatTrajectory: "", earlyRiskSignal: "none" }), null);

const checks = {
  f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named: Parachute Advansed" }] },
  f2: { checkLabel: "Cleared", items: [{ status: "done", text: "Net margin 30% clears the floor" }] },
  f3: {
    checkLabel: "Below floor",
    items: [{ status: "pending", text: "Current margin implies a price above the safe ₹70 ceiling" }],
  },
  f4: { checkLabel: "Cleared", items: [{ status: "done", text: "Format trajectory: rising" }] },
};
const classification = computeGoNoGo(checks);
const extras = {
  competitiveNote: "Priced 18% above the category average (₹95) — a real premium to justify, not just a number.",
  obsolescenceVerdict:
    "This format is on the rising side of the shift — reasonable confidence it holds up over the next five years.",
};

const generated = await generateFilterNarratives({
  advisoryChecks: checks,
  researchFindings: { f3: { competitiveNote: extras.competitiveNote }, f4: { obsolescenceVerdict: extras.obsolescenceVerdict } },
  extras,
  callNarrative: async () => ({
    f1: "Cleared on Parachute Advansed.",
    f2: "Margin clears the floor.",
    f3: "The safe band is ₹60–₹70.",
    f4: "Threat register is written up.",
  }),
});
assert.equal(computeGoNoGo(checks), classification);
assert.match(generated.f3, /₹95/);
assert.match(generated.f3, /18% above/);
assert.match(generated.f3, /₹60–₹70/);
assert.ok(generated.f4.startsWith(extras.obsolescenceVerdict), generated.f4);
assert.match(generated.f4, /Threat register is written up/);

const led = applyVerdictLeads(
  { f3: generated.f3, f4: generated.f4 },
  extras,
  checks
);
assert.equal(led.f3, generated.f3, "applyVerdictLeads must be idempotent");
assert.equal(led.f4, generated.f4, "F4 verdict must not be prepended twice");

const hashA = fingerprintNarrativeInputs({ advisoryChecks: checks, researchFindings: {}, extras });
const hashB = fingerprintNarrativeInputs({ advisoryChecks: checks, researchFindings: {}, extras });
assert.equal(hashA, hashB);

console.log("PASS Part 49 competitive note, F4 five-year verdict, and cache-stable extras");
