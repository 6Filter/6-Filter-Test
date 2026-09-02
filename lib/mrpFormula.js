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
  const cogs = Number(cogsAtScale);
  const margin = Number(netMarginAtScale);
  if (
    !Number.isFinite(cogs) ||
    cogs <= 0 ||
    !Number.isFinite(margin) ||
    margin <= 0 ||
    margin >= 100
  ) {
    const result = null;
    console.log(
      `[primus/mrp] cogs=${cogsAtScale} margin=${netMarginAtScale} gst=${gstRatePct} -> ${JSON.stringify(result)}`
    );
    return result;
  }

  const denom = 1 - margin / 100;
  if (denom <= 0) {
    const result = null;
    console.log(
      `[primus/mrp] cogs=${cogsAtScale} margin=${netMarginAtScale} gst=${gstRatePct} -> ${JSON.stringify(result)}`
    );
    return result;
  }
  const baseMrp = cogs / denom; // Step 3
  if (!Number.isFinite(baseMrp)) {
    const result = null;
    console.log(
      `[primus/mrp] cogs=${cogsAtScale} margin=${netMarginAtScale} gst=${gstRatePct} -> ${JSON.stringify(result)}`
    );
    return result;
  }

  const gst = asNum(gstRatePct);
  let result;
  if (gst == null) {
    result = { baseMrp, finalMrp: null, gstApplied: false };
  } else {
    const finalMrp = baseMrp * (1 + gst / 100); // Step 4
    result = Number.isFinite(finalMrp)
      ? { baseMrp, finalMrp, gstApplied: true }
      : { baseMrp, finalMrp: null, gstApplied: false };
  }
  console.log(
    `[primus/mrp] cogs=${cogsAtScale} margin=${netMarginAtScale} gst=${gstRatePct} -> ${JSON.stringify(result)}`
  );
  return result;
}

/** Ex-GST MRP from today's COGS and a margin % — computeMrp's base step, no GST. */
export function mrpFromMarginPct(cogsAtScale, marginPct) {
  const cogs = asNum(cogsAtScale);
  const margin = asNum(marginPct);
  if (cogs == null || cogs <= 0 || margin == null || margin >= 100) return null;
  const denom = 1 - margin / 100;
  if (denom <= 0) return null;
  const mrp = cogs / denom;
  return Number.isFinite(mrp) ? mrp : null;
}

/** Inverse of mrpFromMarginPct — used when a human overrides the ₹ range. */
export function marginPctFromMrp(cogsAtScale, mrpInr) {
  const cogs = asNum(cogsAtScale);
  const mrp = asNum(mrpInr);
  if (cogs == null || cogs <= 0 || mrp == null || mrp <= 0) return null;
  const pct = ((mrp - cogs) / mrp) * 100;
  return Number.isFinite(pct) ? pct : null;
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
  if (!result || result.baseMrp == null || !Number.isFinite(result.baseMrp)) return "—";
  const base = `Base MRP ₹${result.baseMrp.toFixed(2)} (COGS ÷ (1 − margin))`;
  if (result.gstApplied && result.finalMrp != null) {
    return `${base} × ${formatGstFactor(gstRatePct)} GST = ₹${result.finalMrp.toFixed(2)}`;
  }
  return `${base} — GST rate not yet set, this is pre-tax`;
}
