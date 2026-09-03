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

function nearlyEqual(a, b) {
  if (a == null && b == null) return true;
  const x = asNum(a);
  const y = asNum(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) < 1e-6;
}

/**
 * Re-solve the Filter 3 band when Filter 2 COGS / MRP change, without a new LLM call.
 * Min tracks today's COGS against the stored division floor. Max re-solves the
 * stored volume-loss ceiling when inflation + category price are on the record.
 * Does not invent those research inputs.
 */
export function recastMarginElasticityLive(
  range,
  { cogsAtScale, mrpInr, division = "" } = {}
) {
  if (!range || typeof range !== "object" || Array.isArray(range)) return range;
  if (looksLikePercentCopiedAsMrp(range)) return range;
  const stored = { ...range };
  const cogs = asNum(cogsAtScale);
  const minPct = asNum(stored.minMarginPct);
  const minMrpInr =
    minPct != null && cogs != null && cogs > 0
      ? mrpFromMarginPct(cogs, minPct)
      : asNum(stored.minMrpInr);

  let maxMrpInr = asNum(stored.maxMrpInr);
  const avg = asNum(stored.normalizedAvgPriceInr);
  const inflation = asNum(stored.inflationRatePct);
  const loss = asNum(stored.volumeLossPct);
  if (avg != null && avg > 0 && inflation != null && inflation > 0 && loss != null && loss > 0) {
    const priceIncreasePct = (10 * inflation) / loss;
    const ceiling = avg * (1 + priceIncreasePct / 100);
    if (Number.isFinite(ceiling) && ceiling > 0) maxMrpInr = ceiling;
  }

  let maxMarginPct = asNum(stored.maxMarginPct);
  if (cogs != null && cogs > 0 && maxMrpInr != null && maxMrpInr > 0) {
    const projectedCogs5yr =
      inflation != null && inflation > 0 ? cogs * Math.pow(1 + inflation / 100, 5) : cogs;
    const pct = ((maxMrpInr - projectedCogs5yr) / maxMrpInr) * 100;
    if (Number.isFinite(pct)) maxMarginPct = pct;
  }

  const centre = asNum(mrpInr);
  let recommendedMrpInr = stored.recommendedMrpInr ?? null;
  let elasticityDownPct = stored.elasticityDownPct ?? null;
  let elasticityUpPct = stored.elasticityUpPct ?? null;
  let mrpAdjustmentNote = stored.mrpAdjustmentNote ?? null;
  const divisionLabel = String(division || "").trim() || "matched";
  if (centre != null && centre > 0 && minMrpInr != null && maxMrpInr != null) {
    recommendedMrpInr = Math.min(maxMrpInr, Math.max(minMrpInr, centre));
    elasticityDownPct = ((centre - minMrpInr) / centre) * 100;
    elasticityUpPct = ((maxMrpInr - centre) / centre) * 100;
    if (Math.abs(recommendedMrpInr - centre) > 0.5) {
      mrpAdjustmentNote =
        centre > maxMrpInr
          ? `Filter 2 MRP ₹${centre.toFixed(0)} sits above the 5-year competitive ceiling — move toward ₹${recommendedMrpInr.toFixed(0)} to stay inside a one-in-ten volume-loss band.`
          : `Filter 2 MRP ₹${centre.toFixed(0)} sits below the margin-floor MRP — move toward ₹${recommendedMrpInr.toFixed(0)} to hold the ${divisionLabel} floor.`;
    } else {
      mrpAdjustmentNote = null;
    }
  }

  const next = guardMrpRange(
    {
      ...stored,
      minMrpInr,
      maxMrpInr,
      minMarginPct: minPct,
      maxMarginPct,
      recommendedMrpInr,
      elasticityDownPct,
      elasticityUpPct,
      mrpAdjustmentNote,
    },
    cogs
  );

  const unchanged =
    nearlyEqual(stored.minMrpInr, next.minMrpInr) &&
    nearlyEqual(stored.maxMrpInr, next.maxMrpInr) &&
    nearlyEqual(stored.maxMarginPct, next.maxMarginPct) &&
    nearlyEqual(stored.recommendedMrpInr, next.recommendedMrpInr) &&
    String(stored.mrpAdjustmentNote || "") === String(next.mrpAdjustmentNote || "") &&
    String(stored.rangeError || "") === String(next.rangeError || "");
  return unchanged ? stored : next;
}

export function marginElasticityUnchanged(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return a == b;
  return (
    nearlyEqual(a.minMrpInr, b.minMrpInr) &&
    nearlyEqual(a.maxMrpInr, b.maxMrpInr) &&
    nearlyEqual(a.minMarginPct, b.minMarginPct) &&
    nearlyEqual(a.maxMarginPct, b.maxMarginPct) &&
    nearlyEqual(a.recommendedMrpInr, b.recommendedMrpInr) &&
    String(a.mrpAdjustmentNote || "") === String(b.mrpAdjustmentNote || "") &&
    String(a.rangeError || "") === String(b.rangeError || "")
  );
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
