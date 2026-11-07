/**
 * Part 136 — owner test (do not edit to make it pass; fix production code).
 * Pure: required steps, failed vs found-nothing, first-mover, evidence, commodity, plain labels.
 */
import assert from "node:assert/strict";
import {
  EVALUATION_STEP_LABELS,
  evaluationStatus,
  requiredEvaluationSteps,
} from "../../lib/evaluationStatus.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

check("empty idea needs filter4 and cogsGst at least", () => {
  const steps = requiredEvaluationSteps({});
  assert.ok(steps.includes("filter4"));
  assert.ok(steps.includes("cogsGst"));
  assert.ok(!steps.includes("benchmark"));
  assert.ok(!steps.includes("evidence"));
});

check("typed COGS+GST skips cogsGst — alone does not make partly evaluated", () => {
  const doc = { f2: { cogsAtScale: 40, gstRatePct: 18 }, f4: { techShiftRisk: {} } };
  const steps = requiredEvaluationSteps(doc);
  assert.ok(!steps.includes("cogsGst"));
  const st = evaluationStatus(doc);
  // filter4 still missing → not-evaluated or incomplete; no done steps from COGS alone
  assert.equal(st.done.length, 0);
  assert.ok(st.state === "not-evaluated" || st.state === "incomplete");
});

check("benchmark typed requires benchmark step", () => {
  const steps = requiredEvaluationSteps({ f1: { benchmark: "Dove", declaredGap: 3 } });
  assert.ok(steps.includes("benchmark"));
  assert.ok(!steps.includes("noCompetitor"));
});

check("first-mover (gap 0, no benchmark) requires noCompetitor not benchmark", () => {
  const steps = requiredEvaluationSteps({ f1: { declaredGap: 0, benchmark: "" } });
  assert.ok(steps.includes("noCompetitor"));
  assert.ok(!steps.includes("benchmark"));
});

check("pure commodity needs none of the Filter 1 checks", () => {
  const steps = requiredEvaluationSteps({
    f1: { pureCommodity: true, benchmark: "X", declaredGap: 3, gapDerivation: "because" },
  });
  assert.ok(!steps.includes("benchmark"));
  assert.ok(!steps.includes("claims"));
  assert.ok(!steps.includes("plan"));
  assert.ok(!steps.includes("noCompetitor"));
});

check("evidence file requires evidence step", () => {
  const steps = requiredEvaluationSteps({
    f1: { evidenceSourceFile: { fileId: "abc" } },
  });
  assert.ok(steps.includes("evidence"));
});

check("price requires priceEvents", () => {
  const steps = requiredEvaluationSteps({
    f2: { cogsAtScale: 10, netMarginAtScale: 50, gstRatePct: 18, mrpInr: 25 },
  });
  assert.ok(steps.includes("priceEvents"));
});

check("labels are plain words never codes", () => {
  for (const [step, label] of Object.entries(EVALUATION_STEP_LABELS)) {
    assert.ok(label.length > 8, step);
    assert.ok(!/^[A-Z0-9_]+$/.test(label), label);
    assert.ok(!label.includes("F1_"), label);
  }
});

check("found-nothing evidence is done, not failed", () => {
  const st = evaluationStatus({
    f1: { evidenceSourceFile: { fileId: "x" } },
    f2: { cogsAtScale: 1, gstRatePct: 18 },
    researchFindings: { evidenceRead: { status: "none" } },
  });
  assert.ok(st.done.includes("evidence"));
  assert.ok(!st.missing.some((m) => m.step === "evidence"));
});

check("failed step is a gap with failed:true", () => {
  const st = evaluationStatus({
    f1: { benchmark: "Dove", declaredGap: 3 },
    f2: { cogsAtScale: 1, gstRatePct: 18 },
    researchFindings: {
      f1: { benchmarkCheck: { researchFailed: true, error: "timeout" } },
    },
  });
  const miss = st.missing.find((m) => m.step === "benchmark");
  assert.ok(miss);
  assert.equal(miss.failed, true);
  assert.match(miss.label, /benchmark/i);
  assert.equal(st.state, "incomplete");
});

check("all required done → evaluated", () => {
  const dims = {
    functionalCoreStability: { risk: "Low", reason: "ok" },
    consumptionContextStability: { risk: "Low", reason: "ok" },
    manufacturingDisruptionRisk: { risk: "Low", reason: "ok" },
    userHabitShiftPotential: { risk: "Low", reason: "ok" },
    adjacentSubstitutionThreat: { risk: "Low", reason: "ok" },
    regulatoryOrStandardsShift: { risk: "Low", reason: "ok" },
    channelOrFormatDisplacement: { risk: "Low", reason: "ok" },
  };
  const st = evaluationStatus({
    f1: { pureCommodity: true },
    f2: { cogsAtScale: 10, gstRatePct: 18 },
    f4: { techShiftRisk: { dimensions: dims, overallRisk: "Low" } },
  });
  assert.equal(st.missing.length, 0, JSON.stringify(st.missing));
  assert.equal(st.state, "evaluated");
});

check("claims text requires claims step", () => {
  const steps = requiredEvaluationSteps({ f1: { gapDerivation: "lab test" } });
  assert.ok(steps.includes("claims"));
});

check("plan text requires plan step", () => {
  const steps = requiredEvaluationSteps({ f1: { growthRoute: "GT" } });
  assert.ok(steps.includes("plan"));
});

check("missing entries carry plain labels", () => {
  const st = evaluationStatus({ f1: { benchmark: "BrandX", declaredGap: 3 } });
  for (const m of st.missing) {
    assert.ok(m.label && !/^[A-Z0-9_]+$/.test(m.label));
  }
});

check("state not-evaluated when nothing done", () => {
  const st = evaluationStatus({ f1: { benchmark: "BrandX", declaredGap: 3 } });
  assert.equal(st.done.length, 0);
  assert.equal(st.state, "not-evaluated");
});

check("incomplete when some done some missing", () => {
  const st = evaluationStatus({
    f1: { benchmark: "Dove", declaredGap: 3, evidenceSourceFile: { fileId: "e" } },
    f2: { cogsAtScale: 1, gstRatePct: 18 },
    researchFindings: {
      evidenceRead: { status: "read", facts: [] },
    },
  });
  assert.ok(st.done.includes("evidence"));
  assert.ok(st.missing.length > 0);
  assert.equal(st.state, "incomplete");
});

check("a whole-pass research failure names the reason on every unfinished step", () => {
  const reason = "Claude API key missing";
  const st = evaluationStatus({
    f1: {
      benchmark: "Dove",
      declaredGap: 3,
      gapDerivation: "lighter finish",
      growthRoute: "penetration",
      declaredAttribute: "light",
      evidenceSourceFile: { fileId: "e" },
    },
    f2: { cogsAtScale: 40, netMarginAtScale: 25, gstRatePct: 18, mrpInr: 62.93 },
    researchFindings: {
      f1: { researchFailed: true, failureReason: reason },
      f3: { researchFailed: true, failureReason: reason },
      f4: { researchFailed: true, failureReason: reason },
    },
  });
  for (const step of ["evidence", "benchmark", "claims", "plan", "priceEvents", "filter4"]) {
    const miss = st.missing.find((m) => m.step === step);
    assert.ok(miss, step);
    assert.equal(miss.failed, true, step);
    assert.equal(miss.reason, reason, step);
  }
  assert.equal(st.state, "incomplete");
});

check("required list matches missing+done", () => {
  const st = evaluationStatus({ f1: { benchmark: "A", declaredGap: 2 } });
  assert.equal(st.required.length, st.done.length + st.missing.length);
});

console.log(`PASS owner testEvaluationStatus (${checks} checks)`);
