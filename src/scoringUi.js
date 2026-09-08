/** Browser-safe UI helpers (mirrors lib/scoring.js formulas). */
import { ideaScaleLabel } from "../lib/ideaScale.js";
export function scoreToFive(score100) {
  return Math.max(1, Math.min(5, Math.round(Number(score100) / 20) || 1));
}

export function statusOf(pts, maxPoints = 60) {
  const max = Number(maxPoints) > 0 ? Number(maxPoints) : 60;
  // Keep product thresholds: >40 / >=30 on a /60 scale; scale proportionally for process /40.
  const approvedCut = (40 / 60) * max;
  const promisingCut = (30 / 60) * max;
  if (pts > approvedCut) return { key: "approved", label: "Approved" };
  if (pts >= promisingCut) return { key: "promising", label: "Promising" };
  return { key: "rejected", label: "Rejected" };
}

export function toneOf(pts, maxPoints = 60) {
  const st = statusOf(pts, maxPoints);
  if (st.key === "approved") return { key: "strong", color: "#24A866", word: "Clears the bar" };
  if (st.key === "promising") return { key: "moderate", color: "#C9A227", word: "Promising" };
  return { key: "weak", color: "#E45757", word: "Below the bar" };
}

export function classifyIdeaWeight(revenueCrores) {
  // Same locked bands as the badge / gate / export: ≤ ₹1 Cr → 10g.
  return ideaScaleLabel(revenueCrores);
}

export function formatRevenueFromCrores(cr) {
  const value = Number(cr);
  if (!Number.isFinite(value) || value <= 0) return "₹3 – ₹10 Lakhs";
  if (value < 0.01) return "< ₹1 Lakh";
  if (value < 1) {
    const lakhs = value * 100;
    if (lakhs < 10) return `₹${lakhs.toFixed(1)} Lakhs`;
    return `₹${Math.round(lakhs)} Lakhs`;
  }
  if (value < 10) return `₹${value.toFixed(2)} Cr`;
  return `₹${value.toFixed(0)} Cr`;
}

export function revenueDisplayFor(result) {
  const crores = Number(result?.revenuePotentialCrores);
  const safe = Number.isFinite(crores) && crores > 0 ? crores : 0;
  return {
    crores: safe,
    label: result?.revenuePotentialRange || formatRevenueFromCrores(safe),
    weight: result?.gramClass || result?.ideaWeight || classifyIdeaWeight(safe),
  };
}
