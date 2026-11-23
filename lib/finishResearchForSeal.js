/**
 * Turn failed / missing research slots into finished-empty results so Evaluate can
 * seal a GO/WATCH/NO-GO from the values a person entered. Does not invent scores.
 * Browser-safe for unit tests; no I/O.
 */
import { evaluationStatus, requiredEvaluationSteps } from "./evaluationStatus.js";
import { isOkAssessment, failedAssessment, okAssessment } from "./assessmentResult.js";

function filled(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return true;
  return String(v).trim() !== "";
}

function asFindings(doc = {}) {
  const f = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  return {
    ...f,
    f1: f.f1 && typeof f.f1 === "object" ? { ...f.f1 } : {},
    f2: f.f2 && typeof f.f2 === "object" ? { ...f.f2 } : {},
    f3: f.f3 && typeof f.f3 === "object" ? { ...f.f3 } : {},
    f4: f.f4 && typeof f.f4 === "object" ? { ...f.f4 } : {},
  };
}

function finishFailedAssessment(slot) {
  if (!slot || typeof slot !== "object") {
    return { ...okAssessment({ relevance: "none", specific: false }, [], { searchUsed: true }), finishedEmpty: true };
  }
  if (isOkAssessment(slot) || slot.status === "ok") return slot;
  return {
    ...okAssessment(
      {
        relevance: "none",
        specific: false,
        note: String(slot.error || slot.reason || "Research did not finish — scored as none"),
      },
      Array.isArray(slot.returnedSources) ? slot.returnedSources : [],
      { searchUsed: slot.searchUsed === true }
    ),
    finishedEmpty: true,
  };
}

/**
 * @param {object} doc
 * @returns {{ doc: object, changed: boolean, finishedSteps: string[] }}
 */
export function finishResearchForSeal(doc = {}) {
  const required = requiredEvaluationSteps(doc);
  const status = evaluationStatus(doc);
  if (status.state === "evaluated" || status.state === "legacy") {
    return { doc, changed: false, finishedSteps: [] };
  }

  const findings = asFindings(doc);
  const finishedSteps = [];
  let changed = false;

  if (required.includes("cogsGst")) {
    const typed = filled(doc.f2?.cogsAtScale) && filled(doc.f2?.gstRatePct);
    if (!typed) {
      const ce = findings.f2.costEstimate;
      const failed =
        !ce ||
        ce.status === "failed" ||
        ce.researchFailed ||
        ce.error ||
        findings.f2.researchFailed;
      if (failed) {
        findings.f2 = {
          ...findings.f2,
          researchFailed: false,
          error: undefined,
          costEstimate: {
            status: "ok",
            cogsAtScale: null,
            gstRatePct: null,
            finishedEmpty: true,
            note: String(ce?.error || "COGS/GST research did not finish — scored from entered values"),
          },
        };
        changed = true;
        finishedSteps.push("cogsGst");
      }
    }
  }

  if (required.includes("priceEvents")) {
    const f3 = findings.f3;
    const hasResult =
      f3.priceEventsFound === true ||
      f3.priceEvents != null ||
      f3.marginElasticityFound === true;
    const failed =
      !hasResult ||
      f3.priceEvents?.status === "failed" ||
      f3.researchFailed ||
      f3.error ||
      f3.priceEvents?.error;
    if (failed) {
      findings.f3 = {
        ...f3,
        researchFailed: false,
        error: undefined,
        priceEventsFound: true,
        priceEvents: {
          status: "ok",
          events: Array.isArray(f3.priceEvents?.events) ? f3.priceEvents.events : [],
          finishedEmpty: true,
          note: String(f3.priceEvents?.error || f3.error || "Price research did not finish"),
        },
      };
      changed = true;
      finishedSteps.push("priceEvents");
    }
  }

  if (required.includes("claims") || required.includes("plan") || required.includes("benchmark")) {
    const assessments = {
      ...(findings.f1.assessments && typeof findings.f1.assessments === "object"
        ? findings.f1.assessments
        : {}),
    };
    let touched = false;
    const ensureSlot = (key) => {
      const slot = assessments[key];
      if (!slot || slot.status === "failed" || slot.error) {
        assessments[key] = finishFailedAssessment(slot);
        touched = true;
      }
    };
    if (required.includes("claims")) {
      ensureSlot("derivation");
      ensureSlot("parity");
      ensureSlot("argument");
    }
    if (required.includes("plan")) {
      ensureSlot("attributes");
      ensureSlot("route");
    }
    if (required.includes("benchmark")) ensureSlot("benchmark");
    if (touched) {
      findings.f1 = { ...findings.f1, assessments };
      if (!findings.f1.claimChecks) findings.f1.claimChecks = { ok: true, finishedEmpty: true };
      if (!findings.f1.routeCheck) findings.f1.routeCheck = { matches: "unclear", confidence: "low" };
      if (!findings.f1.benchmarkCheck) findings.f1.benchmarkCheck = { status: "not-found", sources: [] };
      changed = true;
      finishedSteps.push("claims");
    }
  }

  if (required.includes("filter4")) {
    // Do not invent seven Low ratings — leave for research. Only clear a failed flag when techShiftFound.
    if (findings.f4.techShiftFound === true && (findings.f4.researchFailed || findings.f4.error)) {
      findings.f4 = { ...findings.f4, researchFailed: false, error: undefined };
      changed = true;
      finishedSteps.push("filter4");
    }
  }

  if (Array.isArray(findings.stepsFailed) && findings.stepsFailed.length) {
    findings.stepsFailed = findings.stepsFailed.filter(
      (s) => !/^(F2|cost|cogs|F3|margin|f1Claims|f1Plan|f1Benchmark)$/i.test(String(s))
    );
    changed = true;
  }

  if (!changed) return { doc, changed: false, finishedSteps: [] };

  return {
    doc: { ...doc, researchFindings: findings },
    changed: true,
    finishedSteps: [...new Set(finishedSteps)],
  };
}

/** Coerce a sealed INCOMPLETE classification to the score band so Log/output show GO/WATCH/NO-GO. */
export function bandFromIncompleteGoNoGo(goNoGo, classifyFromBands, { ideaScale = null } = {}) {
  if (!goNoGo || typeof goNoGo !== "object") return goNoGo;
  if (String(goNoGo.classification || "").trim() !== "INCOMPLETE") return goNoGo;
  const pct = Number(goNoGo.score?.pct ?? goNoGo.output?.score?.pct);
  if (!Number.isFinite(pct) || typeof classifyFromBands !== "function") return goNoGo;
  const band = classifyFromBands(pct);
  if (!band || band === "INCOMPLETE") return goNoGo;
  const next = {
    ...goNoGo,
    classification: band,
    incompleteResearch: true,
    rationale: `Scored from entered values at ${pct}% (${band}). Some research did not finish.`,
  };
  if (ideaScale != null && next.ideaScale == null) next.ideaScale = ideaScale;
  if (next.output && typeof next.output === "object") {
    next.output = {
      ...next.output,
      classification: band,
      score: next.output.score || next.score,
      ideaScale: next.output.ideaScale ?? next.ideaScale,
    };
  }
  return next;
}

// Keep failedAssessment import used for typing clarity in editors; seal path uses okAssessment.
void failedAssessment;
