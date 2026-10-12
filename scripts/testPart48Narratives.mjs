import assert from "node:assert/strict";

process.env.NARRATIVE_GUARD = "enforce";
import { checkF4 } from "../lib/filterChecks.js";
import {
  computeGoNoGo,
  financeSignatureCopy,
  goNoGoIsFloorFailure,
  previewAdvisoryChecks,
} from "../lib/goNoGo.js";
import {
  fallbackFilterNarrative,
  narrativeContradictsStatus,
  reconcileNarratives,
} from "../lib/filterNarrativeText.js";
import { generateFilterNarratives } from "../lib/filterNarratives.js";
import {
  fingerprintNarrativeInputs,
  unwrapResearchCachePayload,
  wrapResearchCachePayload,
} from "../lib/researchCache.js";

const unsigned = financeSignatureCopy(false);
assert.match(unsigned, /hasn't been confirmed by Finance/);
assert.match(unsigned, /unconfirmed figures are treated as a gap/);
assert.equal(financeSignatureCopy(true), "Finance has confirmed the margin computation");

const preview = previewAdvisoryChecks({ f2: { financeSigned: false } });
assert.equal(preview.f2.checkLabel, "Not yet run");
assert.deepEqual(preview.f2.items, []);

const f2UnsignedFallback = fallbackFilterNarrative(preview.f2);
assert.doesNotMatch(f2UnsignedFallback, /Finance/i);
assert.match(f2UnsignedFallback, /not been run yet/i);

const f2Filled = previewAdvisoryChecks({
  f2: { financeSigned: false, cogsAtScale: 40, netMarginAtScale: 52 },
}).f2;
assert.notEqual(f2Filled.checkLabel, "Not yet run");
assert.equal(f2Filled.items.at(-1).text, unsigned);
assert.equal(f2Filled.items.at(-1).formAdmin, true);

const f4pending = checkF4({});
assert.equal(f4pending.checkLabel, "Not yet run");
assert.deepEqual(f4pending.items, []);
const f4done = checkF4({
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: { risk: "Low", reason: "Function survives a form change" },
      consumptionContextStability: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      manufacturingDisruptionRisk: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      userHabitShiftPotential: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      adjacentSubstitutionThreat: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      purchaseFrequencyShift: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      regulatoryDisruptionRisk: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
    },
    overallRisk: "Low",
  },
});
assert.equal(f4done.checkLabel, "Cleared");
assert.equal(f4done.items.length, 7);

const floorChecks = {
  f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Benchmark named: Parachute Advansed" }] },
  f2: {
    checkLabel: "Evidence missing",
    items: [{ status: "pending", text: financeSignatureCopy(false) }],
  },
  f3: {
    checkLabel: "Below floor",
    items: [
      {
        status: "pending",
        text: "Current margin implies a price above the safe ₹70 ceiling — risks over 10% volume loss",
      },
    ],
  },
  f4: { checkLabel: "Cleared", items: [{ status: "done", text: "Functional core stability: Low risk — function survives a form change" }] },
};

const classification = computeGoNoGo(floorChecks);
assert.equal(classification, "NO-GO");
assert.equal(goNoGoIsFloorFailure(floorChecks), true);

assert.equal(
  narrativeContradictsStatus("Below floor", "This filter is cleared and ready to go."),
  true
);
assert.equal(
  narrativeContradictsStatus(
    "Below floor",
    "Current margin is above the safe ceiling — that is a below floor failure."
  ),
  false
);

const f3Fallback = fallbackFilterNarrative(floorChecks.f3);
assert.match(f3Fallback, /₹70 ceiling/);
assert.match(f3Fallback, /analytical floor failure/);
assert.doesNotMatch(f3Fallback, /^This filter is cleared/);

const clearedFallback = fallbackFilterNarrative(floorChecks.f1);
assert.match(clearedFallback, /Nothing outstanding/);

const contradicting = reconcileNarratives(
  {
    f1: "F1 is cleared on the named benchmark.",
    f2: "Finance still needs to confirm the margin.",
    f3: "Filter 3 is cleared.",
    f4: "No material structural exposure found.",
  },
  floorChecks
);
assert.equal(computeGoNoGo(floorChecks), classification, "reconcile must not mutate scoring");
assert.equal(floorChecks.f3.checkLabel, "Below floor");
assert.match(contradicting.f3, /analytical floor failure|₹70 ceiling/);
assert.doesNotMatch(contradicting.f3, /Filter 3 is cleared/);
assert.doesNotMatch(contradicting.f2, /Finance/i);

const generated = await generateFilterNarratives({
  advisoryChecks: floorChecks,
  researchFindings: {},
  callNarrative: async () => ({
    f1: "Cleared on Parachute Advansed.",
    f2: "Finance has not confirmed the margin yet.",
    f3: "This filter is cleared.",
    f4: "No material structural exposure found.",
  }),
});
assert.equal(computeGoNoGo(floorChecks), "NO-GO");
assert.equal(goNoGoIsFloorFailure(floorChecks), true);
assert.match(generated.f3, /₹70 ceiling|analytical floor failure/);
assert.doesNotMatch(generated.f3, /This filter is cleared/);
assert.doesNotMatch(generated.f2, /Finance/i);

const hashA = fingerprintNarrativeInputs({
  advisoryChecks: floorChecks,
  researchFindings: { f1: { benchmarkVerified: true } },
});
const hashB = fingerprintNarrativeInputs({
  advisoryChecks: floorChecks,
  researchFindings: { f1: { benchmarkVerified: true } },
});
const hashC = fingerprintNarrativeInputs({
  advisoryChecks: { ...floorChecks, f2: { checkLabel: "Cleared", items: [] } },
  researchFindings: { f1: { benchmarkVerified: true } },
});
assert.equal(hashA, hashB, "identical inputs must hash identically");
assert.notEqual(hashA, hashC, "changed checks must miss the narrative cache");

const wrapped = wrapResearchCachePayload({
  researchFindings: { f1: { benchmarkVerified: true } },
  filterNarratives: generated,
  narrativeChecksHash: hashA,
});
const unwrapped = unwrapResearchCachePayload(wrapped);
assert.equal(unwrapped.narrativeChecksHash, hashA);
assert.equal(unwrapped.filterNarratives.f3, generated.f3);

console.log("PASS Part 48 narratives are downstream of scoring, cached, and contradiction-safe");
