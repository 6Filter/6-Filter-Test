import assert from "node:assert/strict";
import { STEP_SLOTS, expectedResearchSteps, mergeFindingsByStep } from "../lib/researchProgress.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

const CAN_EMIT = [
  "F1",
  "f1Benchmark",
  "f1Claims",
  "f1Plan",
  "noCompetitor",
  "F2",
  "F3",
  "F4",
  "F5",
  "evidence",
];

check("STEP_SLOTS has every emittable research step", () => {
  for (const step of CAN_EMIT) {
    assert.ok(Array.isArray(STEP_SLOTS[step]) && STEP_SLOTS[step].length, step);
  }
});

check("expectedResearchSteps only references known STEP_SLOTS keys", () => {
  const doc = {
    name: "Merge probe",
    category: "Buttermilk",
    ideaDescription: "desc",
    f1: {
      benchmark: "Amul",
      declaredGap: 3,
      gapDerivation: "Gap story",
      growthArgument: "Growth story here",
      growthRoute: "penetration",
      declaredAttribute: "Probiotic",
      evidenceSourceDate: "2024-01-01",
    },
    f2: { mrpOverride: true, mrpInr: 40, cogsAtScale: 14, gstRatePct: 5 },
    f4: { techShiftRisk: "" },
    f5: {
      householdsReachedY3Mn: 1,
      trialRatePct: 8,
      repeatConversionPct: 30,
      purchaseFrequencyYr: 4,
      avgPackValueInr: 40,
    },
  };
  for (const step of expectedResearchSteps(doc)) {
    assert.ok(STEP_SLOTS[step], `no slots for ${step}`);
  }
});

check("limited merge writes only requested slots", () => {
  const previous = {
    f1: {
      assessments: {
        derivation: { status: "ok", raw: { relevance: "adequate" } },
        benchmark: { status: "ok", raw: { relevance: "weak" } },
      },
      benchmarkVerified: true,
    },
    f2: { costEstimate: { estimatedCogsPerUnitInr: 12 } },
  };
  const neu = {
    f1: {
      assessments: {
        benchmark: { status: "ok", raw: { relevance: "strong" } },
      },
      benchmarkVerified: false,
    },
  };
  const merged = mergeFindingsByStep(neu, previous, ["f1Benchmark"]);
  assert.equal(merged.f1.assessments.benchmark.raw.relevance, "strong");
  assert.equal(merged.f1.assessments.derivation.raw.relevance, "adequate");
  assert.equal(merged.f1.benchmarkVerified, false);
  assert.equal(merged.f2.costEstimate.estimatedCogsPerUnitInr, 12);
});

check("full merge keeps previous slots when new omits them", () => {
  const previous = {
    f1: { assessments: { argument: { status: "ok", raw: { relevance: "strong" } } } },
  };
  const neu = { f1: { assessments: { benchmark: { status: "ok", raw: { relevance: "adequate" } } } } };
  const merged = mergeFindingsByStep(neu, previous, []);
  assert.equal(merged.f1.assessments.argument.raw.relevance, "strong");
  assert.equal(merged.f1.assessments.benchmark.raw.relevance, "adequate");
});

console.log(`PASS testMergeFindingsByStep (${checks} checks)`);
