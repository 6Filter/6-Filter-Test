import { classifyIdeaWeight } from "./scoring.js";

function formatRevenueCalibrationNote(row, archetype) {
  if (!row || !Number.isFinite(Number(row.multiplier)) || !archetype) return "";
  const when = row.measured_at || row.measuredAt;
  let date = "";
  try {
    if (when) date = new Date(when).toLocaleDateString("en-IN");
  } catch {
    date = "";
  }
  const conf = row.confidence || "n/a";
  return `Revenue estimates for ${archetype} have historically run ×${Number(row.multiplier).toFixed(2)} vs actual (${conf}${date ? `, measured ${date}` : ""}).`;
}

export function computeWeightage({
  filter1,
  filter2,
  filter3,
  filter4,
  baseRevenueEstimateCr,
  revenueCalibration = null,
  categoryArchetype = "",
}) {
  const f1 = filter1 || {};
  const f2 = filter2 || {};
  const f3 = filter3 || {};
  const f4 = filter4 || {};
  const revenueCalibrationNote = formatRevenueCalibrationNote(revenueCalibration, categoryArchetype);

  const anyHardFail =
    f1.verdict === "FAIL" ||
    f2.verdict === "FAIL" ||
    f3.verdict === "FAIL" ||
    f4.verdict === "FAIL";
  const reconStatus = String(f1.reconciliation?.status || "").toUpperCase();
  const sizingNeedsInput =
    !f1.differentiationExempt && (reconStatus === "DIAGNOSE" || reconStatus === "INSUFFICIENT");
  const anyNeedsInput =
    f1.verdict === "NEEDS_INPUT" ||
    f2.verdict === "NEEDS_INPUT" ||
    f3.verdict === "NEEDS_INPUT" ||
    f4.verdict === "NEEDS_INPUT" ||
    sizingNeedsInput;

  // Margin headroom nudges confidence in the revenue estimate; capped so it can only
  // move the estimate by up to +/-25%.
  const base = Number(baseRevenueEstimateCr);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
  const marginNudge =
    f2.marginHeadroomPct != null
      ? Math.max(-0.25, Math.min(0.25, f2.marginHeadroomPct / 100))
      : 0;
  const adjustedRevenueCr = safeBase * (f4.multiplier ?? 1) * (1 + marginNudge);

  if (anyHardFail) {
    return {
      overallVerdict: "FAIL",
      gramClass: "10g", // capped — a failed filter cannot earn a higher weight class
      adjustedRevenueCr: null,
      canEscalateToCKR: true,
      failedFilters: [
        f1.verdict === "FAIL" && "Opportunity to Grow",
        f2.verdict === "FAIL" && "Net Margin",
        f3.verdict === "FAIL" && "Price Resilient",
        f4.verdict === "FAIL" && "Technology & Habit Shift",
      ].filter(Boolean),
      revenueCalibrationNote,
    };
  }

  if (anyNeedsInput) {
    const categoryCall = f2.needsCategoryCall === true;
    return {
      overallVerdict: "NEEDS_INPUT",
      gramClass: null,
      adjustedRevenueCr,
      canEscalateToCKR: categoryCall,
      failedFilters: categoryCall ? ["Net Margin"] : [],
      revenueCalibrationNote,
    };
  }

  return {
    overallVerdict: "CLEARED",
    gramClass: classifyIdeaWeight(adjustedRevenueCr),
    adjustedRevenueCr,
    canEscalateToCKR: false,
    failedFilters: [],
    revenueCalibrationNote,
  };
}
