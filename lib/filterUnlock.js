/**
 * Filter unlock helpers.
 * Filters 1–4 stay open. Filters 5–6 unlock only after a GO (or manager-approved
 * WATCH) and market-research proof. Missing earlier inputs still list on the output.
 */

import { resolveF2Price } from "./mrpFormula.js";
import { isNamedBenchmark } from "./benchmarkName.js";
import { isTechShiftRiskUnfilled } from "./techShiftRisk.js";
import { DISPLAY_LABEL, DISPLAY_REQUIRED_PATHS, growthRouteIsNewMarket } from "./requiredBoxes.js";

function filled(value) {
  if (typeof value === "boolean") return value === true;
  if (value == null) return false;
  return String(value).trim() !== "";
}

export function f1HasEnough(f1 = {}) {
  return (
    filled(f1.declaredAttribute) &&
    isNamedBenchmark(f1.benchmark) &&
    filled(f1.declaredGap) &&
    filled(f1.growthRoute) &&
    filled(f1.growthArgument)
  );
}

/** COGS + net margin — still used for research/autofill gates, not for locking Filters 1–4. */
export function f2HasEnough(f2 = {}) {
  return filled(f2.cogsAtScale) && filled(f2.netMarginAtScale);
}

export function f2HasCogsAndMargin(f2 = {}) {
  return f2HasEnough(f2);
}

/** True when Filter 2 has a resolvable MRP (or a legacy safe band). Not an unlock gate for F1–4. */
export function f3HasEnough(f3 = {}, f2OrCogs) {
  const f2 =
    f2OrCogs && typeof f2OrCogs === "object" && !Array.isArray(f2OrCogs)
      ? f2OrCogs
      : { cogsAtScale: f2OrCogs };
  const priced = resolveF2Price(f2);
  if (priced.ok && Number(priced.mrp) > 0) return true;
  const range =
    f3.marginElasticity && typeof f3.marginElasticity === "object" ? f3.marginElasticity : null;
  const min = Number(range?.minMrpInr);
  const max = Number(range?.maxMrpInr);
  return Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0;
}

export function f4HasEnough(f4 = {}) {
  return f4?.techShiftRisk?.dimensions != null;
}

export function f5HasEnough(f5 = {}) {
  return (
    filled(f5.householdsReachedY3Mn) &&
    filled(f5.trialRatePct) &&
    filled(f5.repeatConversionPct) &&
    filled(f5.purchaseFrequencyYr) &&
    filled(f5.avgPackValueInr)
  );
}

export function f6HasEnough(f6 = {}, stage1Cleared = false) {
  if (!stage1Cleared) return true;
  return (
    filled(f6.labGapVsBenchmark) &&
    filled(f6.consumerPanelBeaters) &&
    filled(f6.packStandoutGap)
  );
}

export function hasMarketResearchProof(doc = {}) {
  const proof = doc.marketResearchProof;
  return Boolean(proof && (proof.data || proof.name));
}

export function hasGoClassification(doc = {}) {
  return doc?.goNoGo?.classification === "GO" || doc?.goNoGo?.output?.classification === "GO";
}

export function hasManagerApproval(doc = {}) {
  return Boolean(String(doc?.managerApproval?.comment || doc?.managerReview?.comment || "").trim());
}

/** GO, or a WATCH idea a manager has approved with a comment. NO-GO never proceeds. */
export function canProceedToProofUpload(doc = {}) {
  const c = String(
    doc?.goNoGo?.output?.classification || doc?.goNoGo?.classification || doc?.classification || ""
  ).trim();
  if (c === "GO") return true;
  if (c === "NO-GO") return false;
  return hasManagerApproval(doc);
}

/**
 * Filters 1–4 always editable. Filters 5–6 need GO/manager + proof.
 * @param {"f1"|"f2"|"f3"|"f4"|"proof-gate"|"f5"|"f6"|"send-manager"} key
 * @param {object} doc mergeProposition-shaped draft
 */
export function isFilterUnlocked(key, doc = {}) {
  const f5 = doc.f5 || {};
  const f6 = doc.f6 || {};
  const proof = hasMarketResearchProof(doc);
  const mayUpload = canProceedToProofUpload(doc);
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every(
    (k) => doc?.[k]?.forumVerdict === "pass"
  );

  switch (key) {
    case "f1":
    case "f2":
    case "f3":
    case "f4":
    case "proof-gate":
      return true;
    case "f5":
    case "f6":
      return mayUpload && proof;
    case "send-manager":
      return mayUpload && proof && f5HasEnough(f5) && f6HasEnough(f6, stage1Cleared);
    default:
      return false;
  }
}

/** Hints for Filters 5–6 only — Filters 1–4 never lock. */
export function nextLockedHint(doc = {}) {
  if (!canProceedToProofUpload(doc)) {
    return "Submit for a GO read, or request manager review on WATCH, before Filters 5–6 unlock.";
  }
  if (!hasMarketResearchProof(doc)) return null;
  if (!isFilterUnlocked("send-manager", doc)) {
    return "Fill Filters 5 and 6 to unlock Send to Manager.";
  }
  return null;
}

/**
 * Part 145 D105 — the 12 boxes a person types (the display Required list). Optional boxes, COGS,
 * net margin and MRP are never listed: the system fills them. Labels are plain words.
 */
const MISSING_LABEL_PREFIX = Object.freeze({ f1: "Filter 1: ", f2: "Filter 2: " });

/**
 * Plain-word list of form values the person has not entered yet.
 * Only the typed boxes. Never Filter 4 / 5 / 6, the COGS estimate, margin or MRP.
 */
export function listMissingFormInputs(doc = {}) {
  const missing = [];
  const newMarket = growthRouteIsNewMarket(doc.f1 || {});
  for (const path of DISPLAY_REQUIRED_PATHS) {
    if (path === "f1.benchmark" && newMarket) continue;
    const dot = path.indexOf(".");
    const filter = dot < 0 ? "idea" : path.slice(0, dot);
    const field = dot < 0 ? path : path.slice(dot + 1);
    const raw = dot < 0 ? doc[field] : doc[filter]?.[field];
    // A benchmark that is typed but not a named brand still counts as not entered.
    const ok = path === "f1.benchmark" ? isNamedBenchmark(raw) : filled(raw);
    if (ok) continue;
    const label = path === "f1.benchmark" && filled(raw)
      ? "Filter 1: Benchmark (brand · variant · pack)"
      : `${MISSING_LABEL_PREFIX[filter] || ""}${DISPLAY_LABEL[path] || path}`;
    missing.push({ filter, field, label });
  }
  return missing;
}

function costEstimateUnfinished(doc = {}) {
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  const ce = findings.f2?.costEstimate;
  const stepsFailed = Array.isArray(findings.stepsFailed) ? findings.stepsFailed : [];
  if (stepsFailed.some((s) => /cost|cogs/i.test(String(s)))) return true;
  if (ce && (ce.status === "failed" || ce.researchFailed || ce.error)) return true;
  if (ce && ce.finishedEmpty === true) return true;
  if (doc.researchRunAt && !ce) return true;
  return false;
}

/** Research sealed from entered values gets its own reason, so the output can explain what was missing. */
const SCORED_FROM_ENTERED_REASON = "Research did not finish — scored from the values entered on the form.";

/**
 * Research the AI has not finished — never a typed box. Shown separately from listMissingFormInputs.
 * Filter 5 is not listed before a proof file (it comes only from the file).
 */
export function listUnfinishedResearch(doc = {}) {
  const unfinished = [];
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  if (isTechShiftRiskUnfilled(doc.f4?.techShiftRisk)) {
    unfinished.push({
      filter: "f4",
      field: "techShiftRisk",
      label: "Filter 4: Technology-shift risk (seven dimensions)",
      reason: "Research did not finish the seven dimensions.",
      scoreShare: { checks: 7, of: 18, pct: 39 },
    });
  }
  if (costEstimateUnfinished(doc)) {
    const ce = doc.researchFindings?.f2?.costEstimate;
    unfinished.push({
      filter: "f2",
      field: "costEstimate",
      label: "Filter 2: COGS estimate",
      reason: ce?.finishedEmpty === true
        ? SCORED_FROM_ENTERED_REASON
        : "Research did not finish the COGS estimate.",
    });
  }
  // Filter 1 AI checks (claims / plan / benchmark) that failed, or were finished empty so a verdict could seal.
  const f1Assessments =
    findings.f1?.assessments && typeof findings.f1.assessments === "object" ? findings.f1.assessments : {};
  const f1Slots = Object.values(f1Assessments);
  const f1FinishedEmpty = f1Slots.some((s) => s && s.finishedEmpty === true);
  const f1Failed = f1Slots.some((s) => s && (s.status === "failed" || Boolean(s.error)));
  if (f1FinishedEmpty || f1Failed) {
    unfinished.push({
      filter: "f1",
      field: "claimChecks",
      label: "Filter 1: AI claim and benchmark checks",
      reason: f1FinishedEmpty ? SCORED_FROM_ENTERED_REASON : "Research did not finish the Filter 1 checks.",
    });
  }
  // Filter 3 price research that failed, or was finished empty so a verdict could seal.
  const f3 = findings.f3 && typeof findings.f3 === "object" ? findings.f3 : {};
  const f3FinishedEmpty = f3.priceEvents?.finishedEmpty === true;
  const f3Failed =
    f3.priceEvents?.status === "failed" || Boolean(f3.priceEvents?.error) || f3.researchFailed === true;
  if (f3FinishedEmpty || f3Failed) {
    unfinished.push({
      filter: "f3",
      field: "priceEvents",
      label: "Filter 3: Price-increase research",
      reason: f3FinishedEmpty ? SCORED_FROM_ENTERED_REASON : "Research did not finish the price research.",
    });
  }
  return unfinished;
}
