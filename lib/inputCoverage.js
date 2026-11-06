/**
 * Part 137 — every filled-in field ends in a visible status.
 * Browser-safe: no I/O, no LLM.
 */
import { AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION } from "./lockedConstants.js";
import { textConfirmedByPerson, isExplicitFirstMoverClaim } from "./filter1Check.js";
import { isFailedAssessment, isOkAssessment } from "./assessmentResult.js";
import { f4DimensionVerification } from "./f4Assessment.js";
import { TECH_SHIFT_DIMENSIONS, DIMENSION_LABELS } from "./techShiftRisk.js";
import { parsePackSize } from "./packSize.js";
import { isTooShort, hasEnteredText } from "./relevanceGrade.js";
import { resolveF2Price } from "./mrpFormula.js";

function filled(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  return String(v).trim() !== "";
}

function autofillMap(doc = {}) {
  return (
    (doc.researchFindings?.autofillStatus && typeof doc.researchFindings.autofillStatus === "object"
      ? doc.researchFindings.autofillStatus
      : null) ||
    (doc.autofillStatus && typeof doc.autofillStatus === "object" ? doc.autofillStatus : {}) ||
    {}
  );
}

function needsConfirmation(path, value, statusMap) {
  if (!AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION) return false;
  return !textConfirmedByPerson(path, value, statusMap);
}

/**
 * Part 138 G — "assessed" needs a stored ok result. Web-checked fields (benchmark, attributes, derivation,
 * parity, route, argument, GST, the seven F4 dimensions) also need `searchUsed: true`, which code sets from
 * the request. A stored ok result that was not web-checked is "not-web-checked" (shown as pending).
 */
function assessmentStatus(stored, { webChecked = false } = {}) {
  if (!stored || typeof stored !== "object") return null;
  if (isFailedAssessment(stored)) return "failed";
  const ok = isOkAssessment(stored) || stored.raw != null;
  if (!ok) return null;
  if (webChecked && stored.searchUsed !== true) return "not-web-checked";
  return "assessed";
}

const NOT_WEB_CHECKED_REASON = "The stored answer was not web-checked — Evaluate to assess this";

function row(field, label, status, reason = "") {
  return {
    field,
    label,
    status,
    ...(reason ? { reason } : {}),
  };
}

/**
 * @returns {Array<{ field: string, label: string, status: string, reason?: string }>}
 */
export function inputCoverage(doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const f3 = doc.f3 || {};
  const f4 = doc.f4 || {};
  const f5 = doc.f5 || {};
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  const f1f = findings.f1 || {};
  const assessments = f1f.assessments && typeof f1f.assessments === "object" ? f1f.assessments : {};
  const statusMap = autofillMap(doc);
  const out = [];

  // Part 138 G — the plain identity inputs are accounted for too (never scored alone).
  if (filled(doc.name)) {
    out.push(row("name", "Idea name", "not-scored", "Names the idea; not scored alone"));
  }
  if (filled(doc.ideaDescription)) {
    out.push(row("ideaDescription", "Idea description", "not-scored", "Read by the research; not scored alone"));
  }
  if (
    filled(f1.conceptCardName) ||
    filled(doc.conceptCardName) ||
    (doc.attachment && typeof doc.attachment === "object" && filled(doc.attachment.name))
  ) {
    out.push(
      row("conceptCard", "Concept card", "not-scored", "Fields read from it are suggestions a person must confirm")
    );
  }

  // Benchmark — always assessed whoever wrote it (never held for confirmation).
  if (hasEnteredText(f1.benchmark)) {
    if (isTooShort(f1.benchmark)) {
      out.push(row("f1.benchmark", "Benchmark", "not-scored", "One word or letter cannot be assessed"));
    } else if (isExplicitFirstMoverClaim(f1)) {
      const nc = f1f.noCompetitorCheck;
      if (!nc) out.push(row("f1.benchmark", "Benchmark", "pending", "Evaluate to assess this"));
      else if (nc.researchFailed || nc.error || nc.parseFailed) {
        out.push(
          row(
            "f1.benchmark",
            "Benchmark",
            "failed",
            String(nc.error || "The first-mover check did not complete")
          )
        );
      } else out.push(row("f1.benchmark", "Benchmark", "assessed"));
    } else {
      const st = assessmentStatus(assessments.benchmark, { webChecked: true });
      if (st === "failed") {
        out.push(
          row(
            "f1.benchmark",
            "Benchmark",
            "failed",
            String(assessments.benchmark.error || "The AI did not answer")
          )
        );
      } else if (st === "assessed") {
        out.push(row("f1.benchmark", "Benchmark", "assessed"));
      } else if (st === "not-web-checked") {
        out.push(row("f1.benchmark", "Benchmark", "pending", NOT_WEB_CHECKED_REASON));
      } else {
        out.push(row("f1.benchmark", "Benchmark", "pending", "Evaluate to assess this"));
      }
    }
  }

  if (f1.declaredGap != null && String(f1.declaredGap).trim() !== "") {
    out.push(row("f1.declaredGap", "Declared gap", "rule", "Checked against the locked gap floor"));
  }

  function textField(path, key, label, assessmentKey, { alwaysAssess = false, webChecked = true } = {}) {
    const value = f1[key];
    if (!hasEnteredText(value)) return;
    if (isTooShort(value)) {
      out.push(row(path, label, "not-scored", "One word or letter cannot be assessed"));
      return;
    }
    if (!alwaysAssess && needsConfirmation(path, value, statusMap)) {
      out.push(
        row(
          path,
          label,
          "needs-confirmation",
          "Confirm or edit the text the AI wrote so it can be assessed"
        )
      );
      return;
    }
    const stored = assessmentKey ? assessments[assessmentKey] : null;
    const st = assessmentStatus(stored, { webChecked });
    if (st === "failed") {
      out.push(row(path, label, "failed", String(stored.error || "The AI did not answer")));
    } else if (st === "assessed") {
      out.push(row(path, label, "assessed"));
    } else if (st === "not-web-checked") {
      out.push(row(path, label, "pending", NOT_WEB_CHECKED_REASON));
    } else {
      out.push(row(path, label, "pending", "Evaluate to assess this"));
    }
  }

  textField("f1.gapDerivation", "gapDerivation", "Gap derivation", "derivation");
  // Part 138 D51 — parity has its own assessment slot (never merged with derivation).
  textField("f1.parityExceptions", "parityExceptions", "Parity exceptions", "parity");
  textField("f1.growthArgument", "growthArgument", "Growth argument", "argument");
  textField("f1.declaredAttribute", "declaredAttribute", "Declared attribute", "attributes");
  textField("f1.growthRoute", "growthRoute", "Growth route", "route");

  if (hasEnteredText(f2.qcomTrajectory)) {
    if (needsConfirmation("f2.qcomTrajectory", f2.qcomTrajectory, statusMap)) {
      out.push(
        row(
          "f2.qcomTrajectory",
          "Quick-commerce trajectory",
          "needs-confirmation",
          "Confirm or edit the text the AI wrote so it can be assessed"
        )
      );
    } else {
      const q = findings.f2?.assessments?.qcom;
      const st = assessmentStatus(q);
      if (st === "failed") {
        out.push(row("f2.qcomTrajectory", "Quick-commerce trajectory", "failed", String(q.error || "The AI did not answer")));
      } else if (st === "assessed") {
        out.push(row("f2.qcomTrajectory", "Quick-commerce trajectory", "assessed"));
      } else {
        out.push(row("f2.qcomTrajectory", "Quick-commerce trajectory", "pending", "Evaluate to assess this"));
      }
    }
  }

  if (filled(f2.cogsAtScale)) {
    out.push(row("f2.cogsAtScale", "COGS at scale", "rule", "Used in the MRP formula; not scored alone"));
  }
  if (filled(f2.grammage)) {
    const pack = parsePackSize(String(f2.grammage));
    out.push(
      pack.ok
        ? row("f2.grammage", "Pack size", "rule", "A number and a unit; checked as a rule")
        : row("f2.grammage", "Pack size", "rule", "Needs a number and a unit (g, kg, ml or L)")
    );
  }
  if (filled(f2.gstRatePct)) {
    // Part 138 G — GST is a web-checked field: it is assessed only by a stored ok result with searchUsed:true.
    const gst = findings.f2?.assessments?.gst;
    const st = assessmentStatus(gst && gst.status ? gst : null, { webChecked: true });
    if (st === "failed") {
      out.push(row("f2.gstRatePct", "GST rate", "failed", String(gst.error || "The AI did not answer")));
    } else if (st === "assessed") {
      out.push(row("f2.gstRatePct", "GST rate", "assessed"));
    } else if (st === "not-web-checked") {
      out.push(row("f2.gstRatePct", "GST rate", "pending", NOT_WEB_CHECKED_REASON));
    } else {
      out.push(row("f2.gstRatePct", "GST rate", "pending", "Evaluate to assess this"));
    }
  }
  if (filled(f2.netMarginAtScale)) {
    out.push(row("f2.netMarginAtScale", "Net margin at scale", "rule", "Checked against the division minimum"));
  }
  {
    const priced = resolveF2Price(f2);
    if (priced.ok && Number(priced.mrp) > 0) {
      const pe = findings.f3?.priceEvents;
      if (pe?.status === "failed" || findings.f3?.researchFailed) {
        out.push(
          row(
            "f2.mrp",
            "Shelf price (cliff research)",
            "failed",
            String(pe?.error || findings.f3?.error || "Price research failed")
          )
        );
      } else if (findings.f3?.priceEventsFound === true || pe != null) {
        out.push(row("f2.mrp", "Shelf price (cliff research)", "assessed"));
      } else {
        out.push(row("f2.mrp", "Shelf price (cliff research)", "pending", "Evaluate to assess this"));
      }
    }
  }

  if (f1.evidenceSourceFile?.fileId || f1.evidenceSourceFile?.data || f1.evidenceSourceFile?.name || filled(f1.evidenceSourceDate)) {
    const er = findings.evidenceRead || f1f.evidenceRead;
    if (!er) {
      out.push(row("f1.evidenceSource", "Evidence source", "pending", "Evaluate to assess this"));
    } else if (er.status === "failed" || er.status === "error" || er.researchFailed) {
      out.push(
        row("f1.evidenceSource", "Evidence source", "failed", String(er.error || er.reason || "Evidence read failed"))
      );
    } else {
      out.push(row("f1.evidenceSource", "Evidence source", "assessed"));
    }
  }

  if (filled(f1.category) || filled(doc.category)) {
    out.push(row("f1.category", "Category", "not-scored", "Used to scope research; not scored alone"));
  }
  if (filled(f1.targetConsumer) || filled(doc.targetConsumer)) {
    out.push(
      row("f1.targetConsumer", "Target consumer", "not-scored", "Used by the route check; not scored alone")
    );
  }

  // Filter 4 dimensions when filled by hand
  // Part 138 F/G — each of the seven dimensions needs a stored ok, web-checked assessment
  // (researchFindings.f4.assessments.<dimension>) made for the rating that is on the form now.
  const dims = f4.techShiftRisk?.dimensions;
  if (dims && typeof dims === "object") {
    const f4Assessments = findings.f4?.assessments && typeof findings.f4.assessments === "object" ? findings.f4.assessments : {};
    for (const key of TECH_SHIFT_DIMENSIONS) {
      const val = dims[key];
      if (!(val && (filled(val.risk) || filled(val.rating) || filled(val.level) || filled(val.score)))) continue;
      const label = `Filter 4 · ${DIMENSION_LABELS[key] || key}`;
      const v = f4DimensionVerification({ risk: val.risk ?? val.rating ?? val.level }, f4Assessments[key]);
      if (v.state === "failed") {
        out.push(row(`f4.${key}`, label, "failed", String(v.assessment?.error || "The web check did not complete")));
      } else if (v.state === "supported" || v.state === "contradicted") {
        out.push(row(`f4.${key}`, label, "assessed"));
      } else if (v.state === "stale") {
        out.push(row(`f4.${key}`, label, "pending", "The rating changed after its last web check — run the check again"));
      } else if (v.state === "not-web-checked") {
        out.push(row(`f4.${key}`, label, "pending", NOT_WEB_CHECKED_REASON));
      } else {
        out.push(row(`f4.${key}`, label, "pending", "Not web-checked — run the check on this rating"));
      }
    }
  }

  // Filter 5 sizing inputs
  for (const [key, label] of [
    ["householdsReachedY3Mn", "Households reached (Y3)"],
    ["trialRatePct", "Trial rate"],
    ["repeatConversionPct", "Repeat conversion"],
    ["purchaseFrequencyYr", "Purchase frequency"],
    ["avgPackValueInr", "Average pack value"],
  ]) {
    if (filled(f5[key])) {
      out.push(row(`f5.${key}`, label, "not-scored", "Sizing input; Filter 5 is not scored as a band"));
    }
  }

  // Unused to silence lint for f3 form fields that are never scored
  void f3;

  return out;
}

/** Plain-word instruction for Path to GO / checklist copy from a coverage row. */
export function coverageInstruction(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.status === "pending") return "Evaluate to assess this";
  if (entry.status === "failed") {
    return `This check did not complete: ${entry.reason || "unknown reason"}. Evaluate to try again`;
  }
  if (entry.status === "needs-confirmation") {
    return "Confirm or edit the text the AI wrote so it can be assessed";
  }
  return entry.reason || "";
}

/** Map evaluationStatus missing steps → research onlySteps internal names. */
export const EVAL_STEP_TO_INTERNAL = Object.freeze({
  evidence: "evidence",
  benchmark: "f1Benchmark",
  noCompetitor: "noCompetitor",
  claims: "f1Claims",
  plan: "f1Plan",
  cogsGst: "cost",
  priceEvents: "margin",
  filter4: "f4",
});

export function missingEvaluationInternalSteps(statusOrMissing = []) {
  const missing = Array.isArray(statusOrMissing)
    ? statusOrMissing
    : statusOrMissing?.missing || [];
  const out = [];
  for (const m of missing) {
    const step = typeof m === "string" ? m : m?.step;
    const internal = EVAL_STEP_TO_INTERNAL[step];
    if (internal && !out.includes(internal)) out.push(internal);
  }
  return out;
}
