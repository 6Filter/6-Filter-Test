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

assert.match(formatObsolescenceVerdict({ overallRisk: "High" }), /structurally exposed on multiple fronts/i);
assert.match(formatObsolescenceVerdict({ overallRisk: "Medium" }), /one real vulnerability worth watching/i);
assert.match(formatObsolescenceVerdict({ overallRisk: "Low" }), /no material structural exposure found/i);
assert.equal(formatObsolescenceVerdict({ overallRisk: "" }), null);

const checks = {
  f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named: Parachute Advansed" }] },
  f2: { checkLabel: "Cleared", items: [{ status: "done", text: "Net margin 30% clears the floor" }] },
  f3: {
    checkLabel: "Below floor",
    items: [{ status: "pending", text: "Current margin implies a price above the safe ₹70 ceiling" }],
  },
  f4: { checkLabel: "Cleared", items: [{ status: "done", text: "Functional core stability: Low risk — function survives a form change" }] },
};
const classification = computeGoNoGo(checks);
const extras = {
  competitiveNote: "Priced 18% above the category average (₹95) — a real premium to justify, not just a number.",
  obsolescenceVerdict:
    "No material structural exposure found — the format is not sitting on a shift that has already been invented elsewhere.",
};

const generated = await generateFilterNarratives({
  advisoryChecks: checks,
  researchFindings: { f3: { competitiveNote: extras.competitiveNote }, f4: { obsolescenceVerdict: extras.obsolescenceVerdict } },
  extras,
  callNarrative: async () => ({
    f1: "Cleared on Parachute Advansed.",
    f2: "Margin clears the floor.",
    f3: "The safe band is ₹60–₹70.",
    f4: "The seven dimensions are on record.",
  }),
});
assert.equal(computeGoNoGo(checks), classification);
assert.match(generated.f3, /₹95/);
assert.match(generated.f3, /18% above/);
assert.match(generated.f3, /₹70 ceiling/);
assert.doesNotMatch(generated.f3, /₹60/);
assert.ok(generated.f4.startsWith(extras.obsolescenceVerdict), generated.f4);
assert.match(generated.f4, /seven dimensions are on record/);

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

let capturedPrompt = "";
const missingExtras = await generateFilterNarratives({
  advisoryChecks: {
    f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Attribute 1 declared" }] },
    f2: { checkLabel: "Evidence missing", items: [{ status: "pending", text: "Net margin at scale not yet computed" }] },
    f3: { checkLabel: "Evidence missing", items: [{ status: "pending", text: "Margin elasticity not yet computed" }] },
    f4: { checkLabel: "Evidence missing", items: [{ status: "pending", text: "Technology & habit shift risk not yet assessed" }] },
  },
  extras: {},
  callNarrative: async (userText) => {
    capturedPrompt = userText;
    return {
      f1: "Attribute 1 is declared.",
      f2: "Net margin is still outstanding.",
      f3: "The competitive price position has (not yet computed — do not invent one), and elasticity is missing.",
      f4: "The five-year relevance verdict is (not yet computed — do not invent a five-year guarantee).",
    };
  },
});
assert.doesNotMatch(capturedPrompt, /\(not yet computed/);
assert.doesNotMatch(missingExtras.f3, /do not invent/i);
assert.doesNotMatch(missingExtras.f3, /not yet computed/i);
assert.doesNotMatch(missingExtras.f4, /do not invent/i);
assert.doesNotMatch(missingExtras.f4, /not yet computed/i);

console.log("PASS Part 49 competitive note, F4 five-year verdict, and cache-stable extras");
