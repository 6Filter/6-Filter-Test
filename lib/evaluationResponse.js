/**
 * Part 136 — shape GET/list responses so the person only ever sees a sealed output
 * (or an incomplete/legacy page). Never attach live advisoryChecks for display.
 */
import {
  evaluationMissingForApi,
  evaluationStatus,
  propositionEvaluationState,
} from "./evaluationStatus.js";
import { advisoryChecksFromOutput } from "./sealOutput.js";
import { annotateSealedGoNoGo } from "./scoringRuleset.js";

/**
 * Annotate a proposition for API read. Mutates a shallow copy.
 */
export function annotateEvaluationOnProposition(doc = {}) {
  const evaluationState = propositionEvaluationState(doc);
  const status = evaluationStatus(doc);
  const evaluationMissing = evaluationMissingForApi(doc);
  const legacy = evaluationState === "legacy";

  const base = {
    ...doc,
    evaluationState,
    evaluationMissing,
    legacy,
    output: evaluationState === "evaluated" ? doc?.goNoGo?.output || null : null,
  };

  if (evaluationState === "evaluated") {
    const sealed = annotateSealedGoNoGo(doc, doc.goNoGo);
    // scoreStatus: edited-since-screening → "edited since evaluation" for display clients.
    return {
      ...base,
      goNoGo: sealed
        ? {
            ...sealed,
            scoreStatus:
              sealed.scoreStatus === "edited-since-screening"
                ? "edited-since-evaluation"
                : sealed.scoreStatus,
          }
        : sealed,
    };
  }

  if (evaluationState === "legacy") {
    const sealed = annotateSealedGoNoGo(doc, doc.goNoGo);
    return {
      ...base,
      goNoGo: sealed
        ? {
            ...sealed,
            scoreStatus: "older-ruleset",
            legacy: true,
          }
        : sealed,
      // No cards from live checks — strip filterNarratives that would drive card text
      // if the client falls back; keep classification/score for the labelled legacy view.
    };
  }

  // incomplete / not-evaluated: no verdict, no percent, no cards
  const { goNoGo: _drop, ...rest } = base;
  return {
    ...rest,
    goNoGo: null,
    output: null,
  };
}

/**
 * Build the GET response envelope. Never includes live advisoryChecks.
 */
export function buildPropositionReadResponse(proposition, { suggestions = null } = {}) {
  const annotated = annotateEvaluationOnProposition(proposition);
  const evaluationState = annotated.evaluationState;

  const body = {
    proposition: annotated,
    evaluationState,
    evaluationMissing: annotated.evaluationMissing,
    legacy: Boolean(annotated.legacy),
    output: annotated.output,
    goNoGo: annotated.goNoGo,
    suggestions,
  };

  // Evaluated: optional reconstructed checks FROM the sealed snapshot only (for Path to GO).
  if (evaluationState === "evaluated" && annotated.output) {
    body.sealedChecks = advisoryChecksFromOutput(annotated.output);
  }

  return body;
}

/** Compact list-row annotation. */
export function annotateEvaluationOnListRow(row = {}) {
  const evaluationState = propositionEvaluationState(row);
  const out = {
    ...row,
    evaluationState,
    legacy: evaluationState === "legacy",
  };
  if (evaluationState === "evaluated") {
    out.output = row?.goNoGo?.output || null;
    return out;
  }
  if (evaluationState === "legacy") {
    out.output = null;
    return out;
  }
  // incomplete / not-evaluated — strip score/verdict from the row surface
  if (out.goNoGo) {
    out.goNoGo = null;
  }
  out.output = null;
  out.evaluationMissing = evaluationMissingForApi(row);
  return out;
}

export function assertEvaluatedForWrite(doc, { allowLegacyReadOnly = false } = {}) {
  const state = propositionEvaluationState(doc);
  if (state === "evaluated") return;
  if (allowLegacyReadOnly && state === "legacy") return;
  const err = new Error("Evaluate this idea first");
  err.status = 409;
  err.evaluationState = state;
  throw err;
}
