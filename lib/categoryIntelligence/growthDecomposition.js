/**
 * Port of Growth Decomposition tab:
 * C7 = C5-C6; C8 = C6/C5; classification thresholds 0.7 / 0.4.
 */

export function decomposeGrowth({ valueGrowthPct, priceGrowthPct }) {
  if (valueGrowthPct == null || priceGrowthPct == null) return null;
  const value = Number(valueGrowthPct);
  const price = Number(priceGrowthPct);
  if (!Number.isFinite(value) || !Number.isFinite(price)) return null;
  const volumeGrowthPct = value - price;
  const priceShare = value === 0 ? null : price / value;
  let classification = "MIXED: pricing is carrying a material share of growth.";
  if (priceShare == null) {
    classification = "Could not classify — value growth is zero.";
  } else if (priceShare > 0.7) {
    classification =
      "PRICE-LED: volume barely growing. Fragile to input-cost reversal or a value attacker.";
  } else if (priceShare > 0.4) {
    classification = "MIXED: pricing is carrying a material share of growth.";
  } else {
    classification = "VOLUME-LED: real consumption growth. The healthier pattern.";
  }
  return { valueGrowthPct: value, priceGrowthPct: price, volumeGrowthPct, priceShare, classification };
}

export function growthStageFrom({ classification, growthStageHint }) {
  const cls = String(classification || "");
  if (cls.startsWith("VOLUME-LED")) return "low-penetration";
  if (cls.startsWith("PRICE-LED")) return "mature-cluttered";
  const hint = String(growthStageHint || "").trim();
  if (hint === "low-penetration" || hint === "mature-cluttered" || hint === "unclear") return hint;
  return "unclear";
}

export function growthBadge(classification) {
  const cls = String(classification || "");
  if (cls.startsWith("VOLUME-LED")) return "VOLUME-LED";
  if (cls.startsWith("PRICE-LED")) return "PRICE-LED";
  if (cls.startsWith("MIXED")) return "MIXED";
  return "";
}
