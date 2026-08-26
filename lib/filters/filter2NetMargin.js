import {
  DIVISION_NET_MARGIN,
  nearestFixedPricePoint,
  parseRequiredNumber,
  round1,
} from "../npdMaster.js";

function formatCalibrationNote(row, division) {
  if (!row || !Number.isFinite(Number(row.multiplier))) return "";
  const when = row.measured_at || row.measuredAt;
  let date = "";
  try {
    if (when) date = new Date(when).toLocaleDateString("en-IN");
  } catch {
    date = "";
  }
  const conf = row.confidence || "n/a";
  return ` Note: declared margins for ${division} have historically run ×${Number(row.multiplier).toFixed(2)} vs actual (${conf}${date ? `, measured ${date}` : ""}).`;
}

function pack({ price, calibrationNote = "", plausibilityNote = "", marginPlausibilityFlag = false, ...rest }) {
  return {
    ...rest,
    pricePerUnit: price,
    marginPlausibilityFlag: Boolean(marginPlausibilityFlag),
    plausibilityNote: plausibilityNote || "",
    calibrationNote: calibrationNote || "",
    reason: `${rest.reason || ""}${plausibilityNote || ""}${calibrationNote || ""}`.trim(),
  };
}

export function computeFilter2({
  division,
  divisionFit = null,
  declaredNetMarginPct,
  estimatedNetMarginPct,
  pricePerUnit,
  marginCalibration = null,
}) {
  const price = parseRequiredNumber(pricePerUnit);
  const priceNote = price != null ? ` at ₹${price}/unit` : "";
  const calibrationNote = division ? formatCalibrationNote(marginCalibration, division) : "";

  if (!division) {
    return pack({
      price,
      calibrationNote,
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin: null,
      declaredNetMarginPct: parseRequiredNumber(declaredNetMarginPct),
      estimatedNetMarginPct: parseRequiredNumber(estimatedNetMarginPct),
      marginSource: null,
      marginHeadroomPct: null,
      needsCategoryCall: true,
      reason: divisionFit?.isNewCategory
        ? `${divisionFit.generalCategory || "This product"} doesn't fall under any of CavinKare's current divisions. ${divisionFit.rationale || ""} There's no margin floor to screen it against without a manual category call${priceNote}.`
        : `Could not determine which CavinKare division this idea belongs to${priceNote}.`,
    });
  }

  const minMargin = DIVISION_NET_MARGIN[division];
  if (minMargin == null) {
    const known = Object.prototype.hasOwnProperty.call(DIVISION_NET_MARGIN, division);
    return pack({
      price,
      calibrationNote,
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin: null,
      declaredNetMarginPct: parseRequiredNumber(declaredNetMarginPct),
      estimatedNetMarginPct: parseRequiredNumber(estimatedNetMarginPct),
      marginSource: null,
      marginHeadroomPct: null,
      reason: known
        ? `${division} margin requires manual Finance input${priceNote}.`
        : `Could not detect a division, so the net-margin floor cannot be applied${priceNote}.`,
    });
  }

  const declared = parseRequiredNumber(declaredNetMarginPct);
  const estimated = parseRequiredNumber(estimatedNetMarginPct);
  const used = declared ?? estimated;
  const marginSource = declared != null ? "declared" : estimated != null ? "ai" : null;

  if (used == null) {
    return pack({
      price,
      calibrationNote,
      pass: false,
      verdict: "NEEDS_INPUT",
      minMargin,
      declaredNetMarginPct: null,
      estimatedNetMarginPct: null,
      marginSource: null,
      marginHeadroomPct: null,
      reason: `Could not estimate launch net margin vs the ${division} floor of ${minMargin}%${priceNote}.`,
    });
  }

  const marginHeadroomPct = round1(used - minMargin);
  const sourceNote = marginSource === "ai" ? " (AI estimate)" : "";
  const nearest = price != null ? nearestFixedPricePoint(price) : null;
  const marginPlausibilityFlag = nearest != null && nearest <= 10 && used >= 50;
  const plausibilityNote = marginPlausibilityFlag
    ? ` Worth a second look: a ₹${nearest} fixed-price SKU sustaining a ${used}% margin is unusual — confirm the cost build.`
    : "";

  return pack({
    price,
    calibrationNote,
    plausibilityNote,
    marginPlausibilityFlag,
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
        ? `Clears ${division} floor of ${minMargin}% by ${marginHeadroomPct} pts${priceNote}${sourceNote}.`
        : `Below ${division} floor of ${minMargin}% by ${Math.abs(marginHeadroomPct)} pts${priceNote}${sourceNote}.`,
  });
}
