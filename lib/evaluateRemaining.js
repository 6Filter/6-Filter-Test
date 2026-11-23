/**
 * Evaluate must run the steps evaluationStatus still needs, even when the
 * research ledger (stepsExpected) already looks complete.
 */
import { evaluationStatus } from "./evaluationStatus.js";
import { inputCoverage, missingEvaluationInternalSteps } from "./inputCoverage.js";

function pendingCoverageInternalSteps(doc = {}) {
  const extra = [];
  for (const row of inputCoverage(doc) || []) {
    if (row?.status !== "pending") continue;
    const field = String(row.field || "");
    if (field === "f2.gstRatePct" && !extra.includes("cost")) extra.push("cost");
    if (field === "f2.mrp" && !extra.includes("margin")) extra.push("margin");
    if (field === "f1.evidenceSource" && !extra.includes("evidence")) extra.push("evidence");
  }
  return extra;
}

/**
 * @param {object} doc
 * @param {{ confirmMissingSteps?: boolean, plan?: { researchState?: string, internalSteps?: string[] } }} [opts]
 * @returns {{ force: boolean, onlySteps: string[], missingLabels: string[] }}
 */
export function remainingEvaluateResearch(doc = {}, { confirmMissingSteps = false, plan = null } = {}) {
  const evalStatus = evaluationStatus(doc);
  const fromEval = missingEvaluationInternalSteps(evalStatus);
  const fromCoverage = pendingCoverageInternalSteps(doc);
  const fromLedger = Array.isArray(plan?.internalSteps) ? plan.internalSteps.filter(Boolean) : [];
  const onlySteps = [...new Set([...fromLedger, ...fromEval, ...fromCoverage])];
  const ledgerIncomplete = plan?.researchState === "incomplete" && fromLedger.length > 0;
  const force =
    Boolean(confirmMissingSteps) && (fromEval.length > 0 || fromCoverage.length > 0 || ledgerIncomplete);
  return {
    force,
    onlySteps,
    missingLabels: (evalStatus.missing || []).map((m) => m.label || m.step).filter(Boolean),
  };
}
