import { FIXED_PRICE_POINTS, nearestFixedPricePoint, parseRequiredNumber } from "../npdMaster.js";

export { FIXED_PRICE_POINTS, nearestFixedPricePoint };

export function computeFilter3({
  benchmarkExists,
  pointsBeat,
  pricePerUnit,
  volumeLossPctAtFixedPoint,
  benchmarkName,
}) {
  const price = parseRequiredNumber(pricePerUnit);
  const volumeLoss = parseRequiredNumber(volumeLossPctAtFixedPoint);

  if (price == null || volumeLoss == null) {
    return {
      pass: false,
      verdict: "FAIL",
      nearestFixedPricePoint: price == null ? null : nearestFixedPricePoint(price),
      pointsBeatOk: false,
      volumeOk: false,
      reason: "Missing evidence: price per unit or volume-loss estimate not declared.",
    };
  }

  const nearest = nearestFixedPricePoint(price);
  const beat = parseRequiredNumber(pointsBeat);
  const pointsBeatOk = !benchmarkExists || (beat != null && beat >= 2);
  // Source PDF: volume loss on a steep increase cannot be more than 10%.
  const volumeOk = volumeLoss <= 10;
  const pass = pointsBeatOk && volumeOk;

  return {
    pass,
    verdict: pass ? "PASS" : "FAIL",
    nearestFixedPricePoint: nearest,
    pointsBeatOk,
    volumeOk,
    pointsBeat: beat,
    volumeLossPctAtFixedPoint: volumeLoss,
    pricePerUnit: price,
    reason: !pointsBeatOk
      ? `Only a ${beat ?? 0}-point beat vs ${benchmarkName || "the benchmark"} — needs ≥2.`
      : !volumeOk
        ? `Projected volume loss ${volumeLoss}% exceeds the 10% ceiling at the ₹${nearest} price point.`
        : "Clears points-beat and volume-loss bars.",
  };
}
