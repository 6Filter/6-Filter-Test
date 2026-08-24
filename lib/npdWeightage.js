import { classifyIdeaWeight } from "./scoring.js";

export function computeWeightage({ filter1, filter2, filter3, filter4, baseRevenueEstimateCr }) {
  const f1 = filter1 || {};
  const f2 = filter2 || {};
  const f3 = filter3 || {};
  const f4 = filter4 || {};

  const anyHardFail =
    f1.verdict === "FAIL" ||
    f2.verdict === "FAIL" ||
    f3.verdict === "FAIL" ||
    f4.verdict === "FAIL";
  const anyNeedsInput =
    f1.verdict === "NEEDS_INPUT" ||
    f2.verdict === "NEEDS_INPUT" ||
    f3.verdict === "NEEDS_INPUT" ||
    f4.verdict === "NEEDS_INPUT";

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
        f1.verdict === "FAIL" && "Filter 1 — Opportunity to Grow",
        f2.verdict === "FAIL" && "Filter 2 — Net Margin",
        f3.verdict === "FAIL" && "Filter 3 — Price Resilient",
        f4.verdict === "FAIL" && "Filter 4 — Technology & Habit Shift",
      ].filter(Boolean),
    };
  }

  if (anyNeedsInput) {
    return {
      overallVerdict: "NEEDS_INPUT",
      gramClass: null,
      adjustedRevenueCr,
      canEscalateToCKR: false,
      failedFilters: [],
    };
  }

  return {
    overallVerdict: "CLEARED",
    gramClass: classifyIdeaWeight(adjustedRevenueCr),
    adjustedRevenueCr,
    canEscalateToCKR: false,
    failedFilters: [],
  };
}
