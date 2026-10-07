/**
 * Browser-safe F2 helpers. No DB, no Node APIs.
 * MRP is a formula seed from COGS / margin / GST — never a live lock.
 */

import { FIXED_PRICE_POINT_OPTIONS } from "./propositionOptions.js";
import { computeMrp } from "./mrpFormula.js";

function asNum(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

export function isEmptyF2Value(value) {
  return value == null || String(value).trim() === "";
}

/** GST-inclusive MRP, or null when GST is not set / inputs cannot yield a price. */
export function computeDerivedMrp(cogsAtScale, netMarginAtScale, gstRatePct) {
  const result = computeMrp({ cogsAtScale, netMarginAtScale, gstRatePct });
  if (!result || result.finalMrp == null) return null;
  return Math.round(result.finalMrp * 100) / 100;
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

/** GST-inclusive MRP string, or "" when inputs cannot yield a price. */
export function formulaMrpValue(f2 = {}) {
  const result = computeMrp({
    cogsAtScale: f2.cogsAtScale,
    netMarginAtScale: f2.netMarginAtScale,
    gstRatePct: f2.gstRatePct,
  });
  if (result?.finalMrp != null) return result.finalMrp.toFixed(2);
  if (result?.baseMrp != null) return result.baseMrp.toFixed(2);
  return "";
}

/**
 * A saved MRP that is not the COGS/margin/GST formula was typed.
 * Reopening the idea must keep that number. A value that still matches the
 * formula can keep updating when COGS, margin, or GST change.
 */
export function mrpDiffersFromFormula(f2 = {}) {
  if (isEmptyF2Value(f2?.mrpInr)) return false;
  const formula = formulaMrpValue(f2);
  if (!formula) return true;
  const typed = Number(f2.mrpInr);
  const derived = Number(formula);
  if (Number.isFinite(typed) && Number.isFinite(derived) && Math.abs(typed - derived) < 0.005) {
    return false;
  }
  return String(f2.mrpInr) !== formula;
}

/** Recompute MRP from the formula. Ownership (freeze vs auto) is decided in the form. */
export function seedDerivedMrp(f2 = {}, { frozen } = {}) {
  if (frozen) return { f2, seeded: false };
  const next = formulaMrpValue(f2);
  if (next === String(f2.mrpInr ?? "")) return { f2, seeded: false };
  return { f2: { ...f2, mrpInr: next }, seeded: true };
}
