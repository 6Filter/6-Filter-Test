/**
 * Browser-safe F2 helpers. No DB, no Node APIs.
 * MRP is a suggested seed from COGS / margin — never a live lock.
 */

import { FIXED_PRICE_POINT_OPTIONS } from "./propositionOptions.js";

function asNum(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

/** MRP ≈ COGS / (1 − netMargin/100). Returns null when the inputs cannot yield a price. */
export function computeDerivedMrp(cogsAtScale, netMarginAtScale) {
  const cogs = asNum(cogsAtScale);
  const margin = asNum(netMarginAtScale);
  if (cogs == null || cogs <= 0) return null;
  if (margin == null || margin >= 95) return null;
  const denom = 1 - margin / 100;
  if (denom <= 0.05) return null;
  return Math.round((cogs / denom) * 10) / 10;
}

/**
 * Distance from MRP to the nearest v4 fixed price point (₹1, 2, 5, 10, 20, 50, 100).
 * Informational only — never blocks edit or Submit.
 */
export function nearestFixedPointGap(mrpInr) {
  const mrp = asNum(mrpInr);
  if (mrp == null || mrp <= 0) return null;
  let nearest = FIXED_PRICE_POINT_OPTIONS[0];
  let gap = Math.abs(mrp - nearest);
  for (const point of FIXED_PRICE_POINT_OPTIONS) {
    const d = Math.abs(mrp - point);
    if (d < gap) {
      gap = d;
      nearest = point;
    }
  }
  return { nearest, gap: Math.round(gap * 10) / 10 };
}

export function formatFixedPriceGapNote(mrpInr) {
  const hit = nearestFixedPointGap(mrpInr);
  if (!hit) return "";
  if (hit.gap === 0) {
    return `Sits on the ₹${hit.nearest} fixed price point — informational, does not block Submit.`;
  }
  return `₹${hit.gap} from the ₹${hit.nearest} fixed price point — informational, does not block Submit.`;
}

export function isEmptyF2Value(value) {
  return value == null || String(value).trim() === "";
}

/** Seed empty MRP from COGS/margin once. Does not overwrite a filled MRP. */
export function seedDerivedMrp(f2 = {}) {
  if (!isEmptyF2Value(f2.mrpInr)) return { f2, seeded: false };
  const derived = computeDerivedMrp(f2.cogsAtScale, f2.netMarginAtScale);
  if (derived == null) return { f2, seeded: false };
  return { f2: { ...f2, mrpInr: derived }, seeded: true };
}
