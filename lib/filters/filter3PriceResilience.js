import { FIXED_PRICE_POINTS, nearestFixedPricePoint, parseRequiredNumber } from "../npdMaster.js";

export { FIXED_PRICE_POINTS, nearestFixedPricePoint };

export function computeFilter3({
  benchmarkExists,
  pointsBeat,
  pricePerUnit,
  volumeLossPctAtFixedPoint,
  estimatedVolumeLossPct,
  benchmarkName,
}) {
  const price = parseRequiredNumber(pricePerUnit);
  const declaredVolume = parseRequiredNumber(volumeLossPctAtFixedPoint);
  const estimatedVolume = parseRequiredNumber(estimatedVolumeLossPct);
  const volumeLoss = declaredVolume ?? estimatedVolume;
  const volumeSource = declaredVolume != null ? "declared" : estimatedVolume != null ? "ai" : null;

  if (price == null) {
    return {
      pass: false,
      verdict: "FAIL",
      nearestFixedPricePoint: null,
      pointsBeatOk: false,
      volumeOk: false,
      volumeSource: null,
      reason: "Missing evidence: price per unit is required.",
    };
  }

  if (volumeLoss == null) {
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      nearestFixedPricePoint: nearestFixedPricePoint(price),
      pointsBeatOk: false,
      volumeOk: false,
      volumeSource: null,
      pricePerUnit: price,
      reason: "Could not estimate volume loss at this price point.",
    };
  }

  if (benchmarkExists && parseRequiredNumber(pointsBeat) == null) {
    return {
      pass: false,
      verdict: "NEEDS_INPUT",
      nearestFixedPricePoint: nearestFixedPricePoint(price),
      pointsBeatOk: false,
      volumeOk: volumeLoss <= 10,
      volumeSource,
      volumeLossPctAtFixedPoint: volumeLoss,
      pricePerUnit: price,
      reason: "A market leader was flagged — enter how many points this idea beats it by (0–10).",
    };
  }

  const nearest = nearestFixedPricePoint(price);
  const beat = parseRequiredNumber(pointsBeat);
  const pointsBeatOk = !benchmarkExists || (beat != null && beat >= 2);
  // Source PDF: volume loss on a steep increase cannot be more than 10%.
  const volumeOk = volumeLoss <= 10;
  const pass = pointsBeatOk && volumeOk;
  const volumeNote = volumeSource === "ai" ? " (AI estimate)" : "";

  return {
    pass,
    verdict: pass ? "PASS" : "FAIL",
    nearestFixedPricePoint: nearest,
    pointsBeatOk,
    volumeOk,
    pointsBeat: beat,
    volumeLossPctAtFixedPoint: volumeLoss,
    volumeSource,
    pricePerUnit: price,
    reason: !pointsBeatOk
      ? `Only a ${beat ?? 0}-point beat vs ${benchmarkName || "the market leader"} — needs ≥2.`
      : !volumeOk
        ? `Projected volume loss ${volumeLoss}% exceeds the 10% ceiling at the ₹${nearest} price point${volumeNote}.`
        : `Clears points-beat and volume-loss bars${volumeNote}.`,
  };
}
