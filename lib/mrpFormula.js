/**
 * Browser-safe MRP arithmetic. No LLM, no I/O.
 * MRP = COGS ÷ (1 − margin%) × (1 + GST%)
 */

function asNum(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function computeMrp({ cogsAtScale, netMarginAtScale, gstRatePct } = {}) {
  const cogs = asNum(cogsAtScale);
  const margin = asNum(netMarginAtScale);
  if (cogs == null || margin == null || cogs <= 0 || margin >= 100) return null;

  const denom = 1 - margin / 100;
  if (denom <= 0) return null;
  const baseMrp = cogs / denom; // Step 3
  if (!Number.isFinite(baseMrp)) return null;

  const gst = asNum(gstRatePct);
  if (gst == null) return { baseMrp, finalMrp: null, gstApplied: false };

  const finalMrp = baseMrp * (1 + gst / 100); // Step 4
  if (!Number.isFinite(finalMrp)) return { baseMrp, finalMrp: null, gstApplied: false };
  return { baseMrp, finalMrp, gstApplied: true };
}

export function formatGstFactor(gstRatePct) {
  const gst = asNum(gstRatePct);
  if (gst == null) return "";
  if (Number.isInteger(gst) && gst >= 0 && gst < 100) {
    return `1.${String(gst).padStart(2, "0")}`;
  }
  return (1 + gst / 100).toFixed(2);
}

export function formatMrpBreakdown(result, gstRatePct) {
  if (!result || result.baseMrp == null || !Number.isFinite(result.baseMrp)) return "";
  const base = `Base MRP ₹${result.baseMrp.toFixed(2)} (COGS ÷ (1 − margin))`;
  if (result.gstApplied && result.finalMrp != null) {
    return `${base} × ${formatGstFactor(gstRatePct)} GST = ₹${result.finalMrp.toFixed(2)}`;
  }
  return `${base} — GST rate not yet set, this is pre-tax`;
}
