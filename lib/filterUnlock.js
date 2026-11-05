/**
 * Filter unlock helpers.
 * Filters 1–4 stay open. Filters 5–6 unlock only after a GO (or manager-approved
 * WATCH) and market-research proof. Missing earlier inputs still list on the output.
 */

import { resolveF2Price } from "./mrpFormula.js";
import { isNamedBenchmark } from "./benchmarkName.js";
import { isTechShiftRiskUnfilled } from "./techShiftRisk.js";

function filled(value) {
  if (typeof value === "boolean") return value === true;
  if (value == null) return false;
  return String(value).trim() !== "";
}

export function f1HasEnough(f1 = {}) {
  if (f1.pureCommodity) return true;
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
 * Required form fields the person should fill. Optional / AI-confirmable extras omitted.
 * Labels are plain words for the output page.
 */
const REQUIRED_FORM_FIELDS = Object.freeze([
  { filter: "idea", field: "name", label: "Proposition name", get: (d) => d.name },
  { filter: "idea", field: "category", label: "Category", get: (d) => d.category },
  {
    filter: "idea",
    field: "ideaDescription",
    label: "Idea / insight description",
    get: (d) => d.ideaDescription,
  },
  {
    filter: "f1",
    field: "declaredAttribute",
    label: "Filter 1: Declared attribute",
    get: (d) => d.f1?.declaredAttribute,
    skipIf: (d) => Boolean(d.f1?.pureCommodity),
  },
  {
    filter: "f1",
    field: "benchmark",
    label: "Filter 1: Benchmark (brand · variant · pack)",
    get: (d) => d.f1?.benchmark,
    skipIf: (d) => Boolean(d.f1?.pureCommodity),
    filled: (v) => isNamedBenchmark(v),
  },
  {
    filter: "f1",
    field: "declaredGap",
    label: "Filter 1: Declared gap",
    get: (d) => d.f1?.declaredGap,
    skipIf: (d) => Boolean(d.f1?.pureCommodity),
  },
  {
    filter: "f1",
    field: "growthRoute",
    label: "Filter 1: Growth route",
    get: (d) => d.f1?.growthRoute,
    skipIf: (d) => Boolean(d.f1?.pureCommodity),
  },
  {
    filter: "f1",
    field: "growthArgument",
    label: "Filter 1: Growth argument",
    get: (d) => d.f1?.growthArgument,
    skipIf: (d) => Boolean(d.f1?.pureCommodity),
  },
  {
    filter: "f2",
    field: "cogsAtScale",
    label: "Filter 2: COGS at scale",
    get: (d) => d.f2?.cogsAtScale,
  },
  {
    filter: "f2",
    field: "netMarginAtScale",
    label: "Filter 2: Net margin at scale",
    get: (d) => d.f2?.netMarginAtScale,
  },
  {
    filter: "f2",
    field: "gstRatePct",
    label: "Filter 2: GST rate",
    get: (d) => d.f2?.gstRatePct,
  },
  {
    filter: "f2",
    field: "grammage",
    label: "Filter 2: Pack size",
    get: (d) => d.f2?.grammage,
  },
  {
    filter: "f4",
    field: "techShiftRisk",
    label: "Filter 4: Technology-shift risk (seven dimensions)",
    get: (d) => d.f4?.techShiftRisk,
    filled: (v) => !isTechShiftRiskUnfilled(v),
  },
  {
    filter: "f5",
    field: "householdsReachedY3Mn",
    label: "Filter 5: Households reached (Y3, mn)",
    get: (d) => d.f5?.householdsReachedY3Mn,
  },
  {
    filter: "f5",
    field: "trialRatePct",
    label: "Filter 5: Trial rate",
    get: (d) => d.f5?.trialRatePct,
  },
  {
    filter: "f5",
    field: "repeatConversionPct",
    label: "Filter 5: Repeat conversion",
    get: (d) => d.f5?.repeatConversionPct,
  },
  {
    filter: "f5",
    field: "purchaseFrequencyYr",
    label: "Filter 5: Purchase frequency",
    get: (d) => d.f5?.purchaseFrequencyYr,
  },
  {
    filter: "f5",
    field: "avgPackValueInr",
    label: "Filter 5: Average pack value",
    get: (d) => d.f5?.avgPackValueInr,
  },
]);

/**
 * Plain-word list of form values the person has not entered yet.
 * Shown on the output so incompleteness is visible without locking Filters 1–4.
 */
export function listMissingFormInputs(doc = {}) {
  const missing = [];
  for (const spec of REQUIRED_FORM_FIELDS) {
    if (typeof spec.skipIf === "function" && spec.skipIf(doc)) continue;
    const raw = spec.get(doc);
    const ok = typeof spec.filled === "function" ? spec.filled(raw) : filled(raw);
    if (!ok) {
      missing.push({ filter: spec.filter, field: spec.field, label: spec.label });
    }
  }
  return missing;
}
