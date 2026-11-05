/**
 * Part 136 — sealing only when last step finishes; Evaluate replaces output;
 * failed step blocks seal; progress count is right.
 */
import assert from "node:assert/strict";
import { evaluationStatus } from "../lib/evaluationStatus.js";
import { canSealOutput, sealGoNoGoOutput } from "../lib/sealOutput.js";

const filledF4 = {
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: { risk: "Low", reason: "ok" },
      consumptionContextStability: { risk: "Low", reason: "ok" },
      manufacturingDisruptionRisk: { risk: "Low", reason: "ok" },
      userHabitShiftPotential: { risk: "Low", reason: "ok" },
      adjacentSubstitutionThreat: { risk: "Low", reason: "ok" },
      regulatoryOrStandardsShift: { risk: "Low", reason: "ok" },
      channelOrFormatDisplacement: { risk: "Low", reason: "ok" },
    },
    overallRisk: "Low",
  },
};

const completeDoc = {
  f1: { pureCommodity: true },
  f2: { cogsAtScale: 10, gstRatePct: 18 },
  f4: filledF4,
};

assert.equal(canSealOutput(completeDoc), true);
assert.equal(canSealOutput({ ...completeDoc, f1: { benchmark: "Dove", declaredGap: 3 } }), false);

const failedDoc = {
  f1: { benchmark: "Dove", declaredGap: 3 },
  f2: { cogsAtScale: 10, gstRatePct: 18 },
  f4: filledF4,
  researchFindings: { f1: { benchmarkCheck: { researchFailed: true, error: "boom" } } },
};
assert.equal(canSealOutput(failedDoc), false);
assert.ok(evaluationStatus(failedDoc).missing.some((m) => m.failed));

const first = sealGoNoGoOutput(
  { classification: "GO", score: { pct: 90, done: 14, total: 15 }, rationale: "a" },
  {
    advisoryChecks: {
      f1: { checkLabel: "Cleared", items: [] },
      f2: { checkLabel: "Cleared", items: [] },
      f3: { checkLabel: "Cleared", items: [] },
      f4: { checkLabel: "Cleared", items: [] },
    },
    doc: completeDoc,
    sealedAt: "2026-01-01T00:00:00.000Z",
  }
);
assert.equal(first.output.sealedAt, "2026-01-01T00:00:00.000Z");

const second = sealGoNoGoOutput(
  { ...first, classification: "WATCH", score: { pct: 70, done: 10, total: 15 } },
  {
    advisoryChecks: {
      f1: { checkLabel: "Marked down", items: [{ status: "pending", text: "fix", credit: 0 }] },
      f2: { checkLabel: "Cleared", items: [] },
      f3: { checkLabel: "Cleared", items: [] },
      f4: { checkLabel: "Cleared", items: [] },
    },
    doc: completeDoc,
    sealedAt: "2026-02-01T00:00:00.000Z",
  }
);
assert.equal(second.output.sealedAt, "2026-02-01T00:00:00.000Z");
assert.notEqual(second.output.sealedAt, first.output.sealedAt);
assert.equal(second.output.classification, "WATCH");

const mid = evaluationStatus({
  f1: { benchmark: "Dove", declaredGap: 3, evidenceSourceFile: { fileId: "e" } },
  f2: { cogsAtScale: 10, gstRatePct: 18 },
  researchFindings: { evidenceRead: { status: "read" }, f1: { benchmarkCheck: { ok: true } } },
});
assert.ok(mid.done.length > 0 && mid.done.length < mid.required.length);
assert.equal(mid.done.length + mid.missing.length, mid.required.length);

console.log("PASS testSealOutputHelpers");
