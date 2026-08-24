import { DIVISION_NET_MARGIN, parseRequiredNumber, round1 } from "../npdMaster.js";

export function computeFilter2({ division, declaredNetMarginPct }) {
  const minMargin = DIVISION_NET_MARGIN[division];
  if (minMargin == null) {
    const known = Object.prototype.hasOwnProperty.call(DIVISION_NET_MARGIN, division);
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin: null,
      declaredNetMarginPct: parseRequiredNumber(declaredNetMarginPct),
      marginHeadroomPct: null,
      reason: known
        ? `${division} margin requires manual Finance input.`
        : "Select a division so the net-margin floor can be applied.",
    };
  }

  const declared = parseRequiredNumber(declaredNetMarginPct);
  if (declared == null) {
    return {
      pass: false,
      verdict: "FAIL",
      minMargin,
      declaredNetMarginPct: null,
      marginHeadroomPct: null,
      reason: "Missing evidence: no declared net margin.",
    };
  }

  const marginHeadroomPct = round1(declared - minMargin);
  return {
    pass: marginHeadroomPct >= 0,
    verdict: marginHeadroomPct >= 0 ? "PASS" : "FAIL",
    minMargin,
    declaredNetMarginPct: declared,
    marginHeadroomPct,
    reason:
      marginHeadroomPct >= 0
        ? `Clears ${division} floor of ${minMargin}% by ${marginHeadroomPct} pts.`
        : `Below ${division} floor of ${minMargin}% by ${Math.abs(marginHeadroomPct)} pts.`,
  };
}
