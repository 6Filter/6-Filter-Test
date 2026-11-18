/**
 * Part 136 — when an idea is evaluated (browser-safe, no I/O, no LLM).
 * A step that FAILED is a gap. A step that finished and found nothing is a result.
 */
import { isClaimingNoCompetitor } from "./filterChecks.js";
import { resolveF2Price } from "./mrpFormula.js";
import { isTechShiftRiskUnfilled } from "./techShiftRisk.js";
import { isF1ExemptByResearch } from "./commodityExemption.js";

/** Plain-word labels — never codes. Extend when a later part adds a step. */
export const EVALUATION_STEP_LABELS = Object.freeze({
  evidence: "Read the evidence source",
  benchmark: "Check the benchmark by web search",
  noCompetitor: "Check the first-mover claim against competitors",
  claims: "Fact-check the gap derivation and growth argument",
  plan: "Check the attribute and growth route",
  cogsGst: "Estimate COGS and GST",
  priceEvents: "Research comparable price events at fixed price points",
  filter4: "Rate Filter 4 technology-shift risk on all seven dimensions",
});

function filled(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return true;
  return String(v).trim() !== "";
}

function hasEvidence(doc = {}) {
  const f = doc?.f1?.evidenceSourceFile;
  return (
    Boolean(f?.fileId || f?.data || f?.name) || Boolean(String(doc?.f1?.evidenceSourceDate || "").trim())
  );
}

/** Part 145 D110 — exempt only on a sourced research finding; the old tick is ignored. */
function isPureCommodity(doc = {}) {
  return isF1ExemptByResearch(doc);
}

function findingsF1(doc) {
  return doc?.researchFindings?.f1 && typeof doc.researchFindings.f1 === "object"
    ? doc.researchFindings.f1
    : {};
}

/**
 * Steps this idea needs. A pure commodity needs none of the Filter 1 checks.
 * Typed COGS/GST skip the estimate step (they do not alone make an idea partly evaluated).
 */
export function requiredEvaluationSteps(doc = {}) {
  const f1 = doc.f1 || {};
  const findings = findingsF1(doc);
  const commodity = isPureCommodity(doc);
  const firstMover = isClaimingNoCompetitor(f1, findings);
  const steps = [];

  if (hasEvidence(doc)) steps.push("evidence");

  if (!commodity) {
    if (firstMover) steps.push("noCompetitor");
    else if (String(f1.benchmark || "").trim()) steps.push("benchmark");

    if (
      String(f1.gapDerivation || "").trim() ||
      String(f1.parityExceptions || "").trim() ||
      String(f1.growthArgument || "").trim()
    ) {
      steps.push("claims");
    }
    if (
      String(f1.growthRoute || "").trim() ||
      String(f1.declaredAttribute || "").trim() ||
      String(doc.f2?.qcomTrajectory || "").trim()
    ) {
      steps.push("plan");
    }
  }

  // COGS/GST estimate only when both are not already typed.
  const cogsTyped = filled(doc.f2?.cogsAtScale);
  const gstTyped = filled(doc.f2?.gstRatePct);
  if (!(cogsTyped && gstTyped)) steps.push("cogsGst");

  const priced = resolveF2Price(doc.f2 || {});
  if (priced.ok && Number(priced.mrp) > 0) steps.push("priceEvents");

  // Hand-entered F4 dimensions skip research; otherwise the seven ratings are required.
  if (isTechShiftRiskUnfilled(doc.f4?.techShiftRisk)) steps.push("filter4");

  return steps;
}

function stepResult(doc, step) {
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  const f1 = findings.f1 || {};

  if (step === "evidence") {
    const er = findings.evidenceRead || f1.evidenceRead;
    if (!er) return { done: false, failed: false };
    if (er.status === "failed" || er.status === "error" || er.researchFailed) {
      return { done: false, failed: true, reason: String(er.error || er.reason || "Evidence read failed") };
    }
    // Found nothing / unreadable / read are all results, not gaps.
    if (er.status === "read" || er.status === "unreadable" || er.status === "none" || er.status === "empty") {
      return { done: true, failed: false };
    }
    if (er.error) {
      return { done: false, failed: true, reason: String(er.error || er.reason || "Evidence read failed") };
    }
    return { done: false, failed: false };
  }

  if (step === "benchmark") {
    const bench = f1.assessments?.benchmark;
    if (bench?.status === "failed") {
      return {
        done: false,
        failed: true,
        reason: String(bench.error || "The AI did not answer"),
      };
    }
    if (f1.benchmarkCheck != null || bench != null) {
      if (f1.benchmarkCheck?.researchFailed || f1.benchmarkCheck?.error) {
        return {
          done: false,
          failed: true,
          reason: String(f1.benchmarkCheck.error || "Benchmark check failed"),
        };
      }
      return { done: true, failed: false };
    }
    return { done: false, failed: false };
  }

  if (step === "noCompetitor") {
    const check = f1.noCompetitorCheck;
    if (!check) return { done: false, failed: false };
    if (check.researchFailed || check.error || check.parseFailed) {
      return {
        done: false,
        failed: true,
        reason: String(check.error || "Competitor check failed"),
      };
    }
    return { done: true, failed: false };
  }

  if (step === "claims") {
    const der = f1.assessments?.derivation;
    const arg = f1.assessments?.argument;
    if (der?.status === "failed" || arg?.status === "failed") {
      return {
        done: false,
        failed: true,
        reason: String(der?.error || arg?.error || "Claim check failed"),
      };
    }
    if (f1.claimChecks || der || arg) {
      if (f1.claimChecks?.researchFailed || f1.claimChecks?.error) {
        return {
          done: false,
          failed: true,
          reason: String(f1.claimChecks.error || "Claim check failed"),
        };
      }
      return { done: true, failed: false };
    }
    return { done: false, failed: false };
  }

  if (step === "plan") {
    const attrs = f1.assessments?.attributes;
    const route = f1.assessments?.route;
    if (attrs?.status === "failed" || route?.status === "failed") {
      return {
        done: false,
        failed: true,
        reason: String(attrs?.error || route?.error || "Attribute/route check failed"),
      };
    }
    if (f1.routeCheck || route || attrs) {
      if (f1.routeCheck?.researchFailed || f1.routeCheck?.error) {
        return {
          done: false,
          failed: true,
          reason: String(f1.routeCheck.error || "Attribute/route check failed"),
        };
      }
      return { done: true, failed: false };
    }
    return { done: false, failed: false };
  }

  if (step === "cogsGst") {
    // Typed both → step was never required. If required, need a cost estimate result.
    if (filled(doc.f2?.cogsAtScale) && filled(doc.f2?.gstRatePct)) {
      return { done: true, failed: false };
    }
    const ce = findings.f2?.costEstimate;
    if (!ce) return { done: false, failed: false };
    if (ce.status === "failed" || ce.researchFailed || ce.error || findings.f2?.researchFailed) {
      return {
        done: false,
        failed: true,
        reason: String(ce.error || findings.f2?.error || "COGS/GST estimate failed"),
      };
    }
    // Found nothing (null figures) is still a finished result.
    return { done: true, failed: false };
  }

  if (step === "priceEvents") {
    const f3 = findings.f3 || {};
    if (f3.priceEvents?.status === "failed") {
      return {
        done: false,
        failed: true,
        reason: String(f3.priceEvents.error || f3.error || "Price research failed"),
      };
    }
    if (f3.priceEventsFound === true || f3.priceEvents != null || f3.marginElasticityFound === true) {
      if (f3.researchFailed || f3.error || f3.priceEvents?.error) {
        return {
          done: false,
          failed: true,
          reason: String(f3.error || f3.priceEvents?.error || "Price research failed"),
        };
      }
      return { done: true, failed: false };
    }
    if (f3.researchFailed || f3.error) {
      return { done: false, failed: true, reason: String(f3.error || "Price research failed") };
    }
    return { done: false, failed: false };
  }

  if (step === "filter4") {
    if (!isTechShiftRiskUnfilled(doc.f4?.techShiftRisk)) {
      return { done: true, failed: false };
    }
    const f4 = findings.f4 || {};
    if (f4.techShiftFound === true) {
      if (f4.researchFailed || f4.error) {
        return { done: false, failed: true, reason: String(f4.error || "Filter 4 research failed") };
      }
      return { done: true, failed: false };
    }
    if (f4.researchFailed || f4.error) {
      return { done: false, failed: true, reason: String(f4.error || "Filter 4 research failed") };
    }
    return { done: false, failed: false };
  }

  return { done: false, failed: false };
}

/**
 * @returns {{ state: "not-evaluated"|"incomplete"|"evaluated", required: string[], done: string[], missing: Array<{step:string,label:string,failed?:boolean,reason?:string}> }}
 */
export function evaluationStatus(doc = {}) {
  const required = requiredEvaluationSteps(doc);
  const done = [];
  const missing = [];

  for (const step of required) {
    const label = EVALUATION_STEP_LABELS[step] || step;
    const result = stepResult(doc, step);
    if (result.done) {
      done.push(step);
    } else {
      const entry = { step, label };
      if (result.failed) {
        entry.failed = true;
        if (result.reason) entry.reason = result.reason;
      }
      missing.push(entry);
    }
  }

  let state;
  if (missing.length === 0) state = "evaluated";
  else if (done.length === 0 && !missing.some((m) => m.failed)) state = "not-evaluated";
  else state = "incomplete";

  return { state, required, done, missing };
}

/**
 * API-facing evaluation state including legacy ideas (stored verdict, no sealed output).
 * @returns {"evaluated"|"incomplete"|"not-evaluated"|"legacy"}
 */
export function propositionEvaluationState(doc = {}) {
  const output = doc?.goNoGo?.output;
  if (output && typeof output === "object" && output.sealedAt) return "evaluated";

  const go = doc?.goNoGo;
  const hasLegacyVerdict =
    Boolean(String(go?.classification || "").trim()) && Number(go?.score?.total) > 0;
  if (hasLegacyVerdict) return "legacy";

  return evaluationStatus(doc).state;
}

export function evaluationMissingForApi(doc = {}) {
  const status = evaluationStatus(doc);
  return status.missing.map((m) => ({
    step: m.step,
    label: m.label,
    ...(m.failed ? { failed: true, reason: m.reason || "Failed" } : {}),
  }));
}
