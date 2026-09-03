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

/**
 * Part 46 stored min/max as margin %. After the rupee relabel those same numbers
 * sometimes sit in minMrpInr/maxMrpInr (e.g. 5 and 10). That is not a price band.
 */
export function looksLikePercentCopiedAsMrp(range) {
  const stored = range && typeof range === "object" && !Array.isArray(range) ? range : {};
  const minMrp = asNum(stored.minMrpInr);
  const maxMrp = asNum(stored.maxMrpInr);
  const minPct = asNum(stored.minMarginPct);
  const maxPct = asNum(stored.maxMarginPct);
  if (minMrp == null || maxMrp == null || minPct == null || maxPct == null) return false;
  return minMrp === minPct && maxMrp === maxPct && minMrp > 0 && maxMrp > 0 && maxMrp < 100;
}

export const INVALID_MRP_RANGE_COPY =
  "Max MRP calculation produced an invalid result (below the minimum) — likely a pack-size mismatch in the category pricing research. Flagged rather than shown as a false range.";

export const PACK_SIZE_UNCONFIRMED_COPY =
  "Pack size of the found price could not be confirmed — treat with caution";

/** Never let a ceiling below the floor look like a valid band. */
export function guardMrpRange(range, cogsAtScale) {
  const stored = range && typeof range === "object" && !Array.isArray(range) ? { ...range } : {};
  const minMrpInr = asNum(stored.minMrpInr);
  const maxMrpInr = asNum(stored.maxMrpInr);
  if (maxMrpInr != null && minMrpInr != null && maxMrpInr < minMrpInr) {
    console.error(
      `[primus/margin-elasticity] INVALID RANGE: max ${maxMrpInr} < min ${minMrpInr} — cogs=${cogsAtScale}, category avg price research likely mismatched on pack size`
    );
    return {
      ...stored,
      minMrpInr,
      maxMrpInr: null,
      maxMarginPct: null,
      rangeError: INVALID_MRP_RANGE_COPY,
    };
  }
  return stored;
}

/** Empty, leftover %-as-₹, inverted band, or missing either rupee end — AI may auto-fill. */
export function isMarginElasticityUnfilled(value) {
  if (value == null || value === "") return true;
  if (typeof value !== "object" || Array.isArray(value)) return true;
  if (looksLikePercentCopiedAsMrp(value)) return true;
  const minR = asNum(value.minMrpInr);
  const maxR = asNum(value.maxMrpInr);
  if (minR != null && maxR != null && maxR < minR) return true;
  return !(minR != null && minR > 0 && maxR != null && maxR > 0);
}

/**
 * Seed Min/Max MRP from AI research when the field is empty or leftover.
 * Does not overwrite a human-filled rupee band.
 */
export function seedMarginElasticityFromAi(current, suggested, cogsAtScale) {
  if (!isMarginElasticityUnfilled(current)) {
    return hydrateMarginElasticityMrp(current, cogsAtScale);
  }
  if (suggested && typeof suggested === "object" && !Array.isArray(suggested)) {
    return hydrateMarginElasticityMrp(suggested, cogsAtScale);
  }
  if (current && typeof current === "object" && !looksLikePercentCopiedAsMrp(current)) {
    return hydrateMarginElasticityMrp(current, cogsAtScale);
  }
  return current && typeof current === "object" ? { ...current, minMrpInr: null, maxMrpInr: null } : current;
}

/**
 * Form display + persist: keep min/max margin % internal, always expose ₹.
 * Prefer stored rupee ends. If an older record only has %, convert with today's COGS.
 * Max prefers the stored ceiling; % conversion is last resort when the raw ₹ is missing.
 * Leftover percent-copied rupees are ignored so AI can fill the real band.
 */
export function hydrateMarginElasticityMrp(range, cogsAtScale) {
  const stored = range && typeof range === "object" && !Array.isArray(range) ? { ...range } : {};
  if (looksLikePercentCopiedAsMrp(stored)) {
    return { ...stored, minMrpInr: null, maxMrpInr: null };
  }
  const storedMin = asNum(stored.minMrpInr);
  const storedMax = asNum(stored.maxMrpInr);
  const minMrpInr =
    storedMin != null && storedMin > 0 ? storedMin : mrpFromMarginPct(cogsAtScale, stored.minMarginPct);
  const maxMrpInr =
    storedMax != null && storedMax > 0 ? storedMax : mrpFromMarginPct(cogsAtScale, stored.maxMarginPct);
  return guardMrpRange(
    {
      ...stored,
      minMrpInr,
      maxMrpInr,
    },
    cogsAtScale
  );
}

/** Form-only: never show a literal % in Filter 3 copy. */
export function withoutPercentSign(text) {
  return String(text || "").replace(/%/g, " percent");
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
