import { DIVISION_NET_MARGIN, parseRequiredNumber, round1 } from "../npdMaster.js";

export function computeFilter2({ division, divisionFit = null, declaredNetMarginPct, estimatedNetMarginPct }) {
  if (!division) {
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin: null,
      declaredNetMarginPct: parseRequiredNumber(declaredNetMarginPct),
      estimatedNetMarginPct: parseRequiredNumber(estimatedNetMarginPct),
      marginSource: null,
      marginHeadroomPct: null,
      needsCategoryCall: true,
      reason: divisionFit?.isNewCategory
        ? `${divisionFit.generalCategory || "This product"} doesn't fall under any of CavinKare's current divisions. ${divisionFit.rationale || ""} There's no margin floor to screen it against without a manual category call.`
        : "Could not determine which CavinKare division this idea belongs to.",
    };
  }

  const minMargin = DIVISION_NET_MARGIN[division];
  if (minMargin == null) {
    const known = Object.prototype.hasOwnProperty.call(DIVISION_NET_MARGIN, division);
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin: null,
      declaredNetMarginPct: parseRequiredNumber(declaredNetMarginPct),
      estimatedNetMarginPct: parseRequiredNumber(estimatedNetMarginPct),
      marginSource: null,
      marginHeadroomPct: null,
      reason: known
        ? `${division} margin requires manual Finance input.`
        : "Could not detect a division, so the net-margin floor cannot be applied.",
    };
  }

  const declared = parseRequiredNumber(declaredNetMarginPct);
  const estimated = parseRequiredNumber(estimatedNetMarginPct);
  const used = declared ?? estimated;
  const marginSource = declared != null ? "declared" : estimated != null ? "ai" : null;

  if (used == null) {
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin,
      declaredNetMarginPct: null,
      estimatedNetMarginPct: null,
      marginSource: null,
      marginHeadroomPct: null,
      reason: `Could not estimate launch net margin vs the ${division} floor of ${minMargin}%.`,
    };
  }

  const marginHeadroomPct = round1(used - minMargin);
  const sourceNote = marginSource === "ai" ? " (AI estimate)" : "";
  return {
    pass: marginHeadroomPct >= 0,
    verdict: marginHeadroomPct >= 0 ? "PASS" : "FAIL",
    minMargin,
    declaredNetMarginPct: declared,
    estimatedNetMarginPct: estimated,
    usedNetMarginPct: used,
    marginSource,
    marginHeadroomPct,
    reason:
      marginHeadroomPct >= 0
        ? `Clears ${division} floor of ${minMargin}% by ${marginHeadroomPct} pts${sourceNote}.`
        : `Below ${division} floor of ${minMargin}% by ${Math.abs(marginHeadroomPct)} pts${sourceNote}.`,
  };
}
