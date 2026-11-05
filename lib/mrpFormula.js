/**
 * Browser-safe MRP arithmetic. No LLM, no I/O.
 * MRP = COGS ÷ (1 − margin%) × (1 + GST%)
 */

function asNum(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Pure MRP arithmetic — no logging (safe for browser input review). */
export function computeMrpArithmetic({ cogsAtScale, netMarginAtScale, gstRatePct } = {}) {
  const cogs = Number(cogsAtScale);
  const margin = Number(netMarginAtScale);
  if (
    !Number.isFinite(cogs) ||
    cogs <= 0 ||
    !Number.isFinite(margin) ||
    margin <= 0 ||
    margin >= 100
  ) {
    return null;
  }

  const denom = 1 - margin / 100;
  if (denom <= 0) return null;
  const baseMrp = cogs / denom;
  if (!Number.isFinite(baseMrp)) return null;

  const gst = asNum(gstRatePct);
  if (gst == null) {
    return { baseMrp, finalMrp: null, gstApplied: false };
  }
  const finalMrp = baseMrp * (1 + gst / 100);
  return Number.isFinite(finalMrp)
    ? { baseMrp, finalMrp, gstApplied: true }
    : { baseMrp, finalMrp: null, gstApplied: false };
}

export function computeMrp({ cogsAtScale, netMarginAtScale, gstRatePct } = {}) {
  const result = computeMrpArithmetic({ cogsAtScale, netMarginAtScale, gstRatePct });
  console.log(
    `[primus/mrp] cogs=${cogsAtScale} margin=${netMarginAtScale} gst=${gstRatePct} -> ${JSON.stringify(result)}`
  );
  return result;
}

/**
 * Part 134 — derived shelf MRP with tax split. Never invents a number.
 * MRP = COGS ÷ (1 − margin) × (1 + GST). Rounded to the paisa; parts reconcile.
 * @returns {{ ok: true, preTaxMrp: number, gstAmount: number, mrp: number, mrpRounded: number, gstRatePct: number } | { ok: false, reason: string }}
 */
export function deriveMrp({ cogsAtScale, netMarginAtScale, gstRatePct } = {}) {
  const cogs = asNum(cogsAtScale);
  const margin = asNum(netMarginAtScale);
  const gst = asNum(gstRatePct);
  if (cogs == null || cogs <= 0) return { ok: false, reason: "NEEDS_COGS" };
  if (margin == null) return { ok: false, reason: "NEEDS_MARGIN" };
  if (margin <= 0 || margin >= 100) return { ok: false, reason: "MARGIN_OUT_OF_RANGE" };
  if (gst == null || gst < 0) return { ok: false, reason: "NEEDS_GST" };

  const denom = 1 - margin / 100;
  if (denom <= 0) return { ok: false, reason: "MARGIN_OUT_OF_RANGE" };
  const preTaxRaw = cogs / denom;
  if (!Number.isFinite(preTaxRaw) || preTaxRaw <= 0) return { ok: false, reason: "NEEDS_COGS" };

  const preTaxMrp = Math.round(preTaxRaw * 100) / 100;
  const gstAmount = Math.round(preTaxMrp * (gst / 100) * 100) / 100;
  const mrp = Math.round((preTaxMrp + gstAmount) * 100) / 100;
  const mrpRounded = Math.round(mrp);
  return { ok: true, preTaxMrp, gstAmount, mrp, mrpRounded, gstRatePct: gst };
}

/**
 * Part 134 revised — one price story for Filter 2 and Filter 3.
 * Default driver "margin" (MRP computed). With `f2.mrpOverride === true`, the person's
 * `f2.mrpInr` wins and `effectiveMargin` is the margin that MRP implies (ex-GST).
 */
export function resolveF2Price(f2 = {}) {
  const override = f2.mrpOverride === true;
  const cogs = asNum(f2.cogsAtScale);
  const gst = asNum(f2.gstRatePct);

  if (override) {
    const mrp = asNum(f2.mrpInr);
    if (mrp == null || mrp <= 0) return { ok: false, reason: "NEEDS_MRP", driver: "mrp" };
    if (cogs == null || cogs <= 0) return { ok: false, reason: "NEEDS_COGS", driver: "mrp" };
    if (gst == null || gst < 0) return { ok: false, reason: "NEEDS_GST", driver: "mrp" };
    const preTaxRaw = mrp / (1 + gst / 100);
    if (!Number.isFinite(preTaxRaw) || preTaxRaw <= 0) {
      return { ok: false, reason: "NEEDS_MRP", driver: "mrp" };
    }
    const preTaxMrp = Math.round(preTaxRaw * 100) / 100;
    const gstAmount = Math.round((mrp - preTaxMrp) * 100) / 100;
    const effectiveMargin = Math.round(((preTaxMrp - cogs) / preTaxMrp) * 10000) / 100;
    if (!Number.isFinite(effectiveMargin)) {
      return { ok: false, reason: "NEEDS_MRP", driver: "mrp" };
    }
    return {
      ok: true,
      driver: "mrp",
      mrp: Math.round(mrp * 100) / 100,
      preTaxMrp,
      gstAmount,
      mrpRounded: Math.round(mrp),
      gstRatePct: gst,
      effectiveMargin,
    };
  }

  const margin = asNum(f2.netMarginAtScale);
  const derived = deriveMrp({
    cogsAtScale: cogs,
    netMarginAtScale: margin,
    gstRatePct: gst,
  });
  if (!derived.ok) return { ...derived, driver: "margin" };
  return {
    ok: true,
    driver: "margin",
    preTaxMrp: derived.preTaxMrp,
    gstAmount: derived.gstAmount,
    mrp: derived.mrp,
    mrpRounded: derived.mrpRounded,
    gstRatePct: derived.gstRatePct,
    effectiveMargin: margin,
  };
}

/** Persist MRP tax split onto an f2 object (server save / live form). Respects mrpOverride. */
export function applyDerivedMrpToF2(f2 = {}) {
  const resolved = resolveF2Price(f2);
  if (f2.mrpOverride === true) {
    if (!resolved.ok) {
      return {
        ...f2,
        mrpPreTaxInr: null,
        gstAmountInr: null,
        mrpDeriveReason: resolved.reason,
        effectiveMarginPct: null,
      };
    }
    return {
      ...f2,
      mrpInr: resolved.mrp,
      mrpPreTaxInr: resolved.preTaxMrp,
      gstAmountInr: resolved.gstAmount,
      mrpRoundedInr: resolved.mrpRounded,
      mrpDeriveReason: null,
      effectiveMarginPct: resolved.effectiveMargin,
    };
  }
  if (!resolved.ok) {
    return {
      ...f2,
      // Without override, an MRP value is ignored — always recomputed when inputs allow.
      mrpInr: null,
      mrpPreTaxInr: null,
      gstAmountInr: null,
      mrpDeriveReason: resolved.reason,
      effectiveMarginPct: asNum(f2.netMarginAtScale),
    };
  }
  return {
    ...f2,
    mrpInr: resolved.mrp,
    mrpPreTaxInr: resolved.preTaxMrp,
    gstAmountInr: resolved.gstAmount,
    mrpRoundedInr: resolved.mrpRounded,
    mrpDeriveReason: null,
    effectiveMarginPct: resolved.effectiveMargin,
  };
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

/** Price lift (%) that maps to a 10% volume-loss ceiling from researched inflation/loss. */
export function volumeLossPriceIncreasePct({
  inflationRatePct,
  volumeLossAtInflationPct,
  targetVolumeLossPct = 10,
} = {}) {
  const inflation = asNum(inflationRatePct);
  const loss = asNum(volumeLossAtInflationPct);
  const target = asNum(targetVolumeLossPct) ?? 10;
  if (inflation == null || inflation <= 0 || loss == null || loss <= 0) return null;
  const lift = (target * inflation) / loss;
  return Number.isFinite(lift) && lift > 0 ? lift : null;
}

/**
 * 5-year operating band around the Filter 2 formula MRP.
 * Min is the higher of the division-floor MRP and the downside of that band.
 * Max is the Filter 2 MRP plus the researched one-in-ten volume-loss lift.
 */
export function bandAroundFilter2Mrp({ cogsAtScale, minMarginPct, mrpInr, liftPct } = {}) {
  const floorMrp = mrpFromMarginPct(cogsAtScale, minMarginPct);
  const centre = asNum(mrpInr);
  const lift = asNum(liftPct);
  if (centre == null || centre <= 0 || lift == null || lift <= 0) {
    return { minMrpInr: floorMrp, maxMrpInr: null, floorMrp, centre };
  }
  const maxMrpInr = centre * (1 + lift / 100);
  console.log(
    `[primus/margin-elasticity] ceiling computed by bandAroundFilter2Mrp: ${maxMrpInr}, called from bandAroundFilter2Mrp`
  );
  const down = centre * (1 - lift / 100);
  const minMrpInr = floorMrp != null ? Math.max(floorMrp, down) : down;
  return { minMrpInr, maxMrpInr, floorMrp, centre };
}

/**
 * One ceiling for Filter 3. A category pack-price ceiling below the floor MRP
 * is a pack-size mismatch — discard it rather than showing ₹167 in copy and a
 * blank Max MRP field. When the Filter 2 MRP band is valid, use that instead.
 */
export function resolveF3MaxMrp({
  categoryCeiling,
  f2BandMax,
  minMrpInr,
  callSite = "unknown",
} = {}) {
  const min = asNum(minMrpInr);
  const cat = asNum(categoryCeiling);
  const f2 = asNum(f2BandMax);
  let chosen = null;
  let source = "";
  if (cat != null && (min == null || cat + 1e-9 >= min)) {
    if (f2 != null && (min == null || f2 + 1e-9 >= min)) {
      chosen = Math.min(f2, cat);
      source = "min(bandAroundFilter2Mrp, solveForVolumeLossCeiling)";
    } else {
      chosen = cat;
      source = "solveForVolumeLossCeiling (Filter 2 band max below floor — unused)";
    }
  } else if (f2 != null && (min == null || f2 + 1e-9 >= min)) {
    chosen = f2;
    source =
      "bandAroundFilter2Mrp (category ceiling below min — pack-size mismatch discarded)";
  } else {
    chosen = cat != null ? cat : f2;
    source = "solveForVolumeLossCeiling (below min — guard will blank Max MRP)";
  }
  console.log(
    `[primus/margin-elasticity] ceiling computed by ${source}: ${chosen}, called from ${callSite}`
  );
  return chosen ?? null;
}

function stripInvalidCeilingCopy(basis, badMax) {
  const n = asNum(badMax);
  if (n == null) return String(basis || "");
  const rounded = String(Math.round(n));
  return String(basis || "")
    .replace(
      new RegExp(
        `\\s*Filter 2 MRP ₹[\\d.]+ sits above the 5-year competitive ceiling — move toward ₹${rounded}[^.]*\\.`,
        "i"
      ),
      ""
    )
    .trim();
}

function nearlyEqual(a, b) {
  if (a == null && b == null) return true;
  const x = asNum(a);
  const y = asNum(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) < 1e-6;
}

/**
 * Re-solve the Filter 3 band when Filter 2 COGS / net margin / MRP change.
 * Min and max stay a band around the live Filter 2 MRP. The researched lift %
 * is reused; no new LLM call.
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
  const inflation = asNum(stored.inflationRatePct);
  const loss = asNum(stored.volumeLossPct);
  const lift =
    asNum(stored.volumeLossPriceIncreasePct) ??
    volumeLossPriceIncreasePct({
      inflationRatePct: inflation,
      volumeLossAtInflationPct: loss,
    });
  const centre = asNum(mrpInr);
  const band = bandAroundFilter2Mrp({
    cogsAtScale: cogs,
    minMarginPct: minPct,
    mrpInr: centre,
    liftPct: lift,
  });
  const avg = asNum(stored.normalizedAvgPriceInr);
  const categoryCeiling =
    avg != null && avg > 0 && lift != null ? avg * (1 + lift / 100) : asNum(stored.maxMrpInr);
  const maxMrpInr = resolveF3MaxMrp({
    categoryCeiling,
    f2BandMax: band.maxMrpInr,
    minMrpInr: band.floorMrp,
    callSite: "recastMarginElasticityLive",
  });
  const minMrpInr =
    band.maxMrpInr != null && maxMrpInr != null && maxMrpInr <= band.maxMrpInr + 1e-6
      ? band.minMrpInr
      : band.floorMrp != null
        ? band.floorMrp
        : asNum(stored.minMrpInr);

  let maxMarginPct = asNum(stored.maxMarginPct);
  if (cogs != null && cogs > 0 && maxMrpInr != null && maxMrpInr > 0) {
    const projectedCogs5yr =
      inflation != null && inflation > 0 ? cogs * Math.pow(1 + inflation / 100, 5) : cogs;
    const pct = ((maxMrpInr - projectedCogs5yr) / maxMrpInr) * 100;
    if (Number.isFinite(pct)) maxMarginPct = pct;
  }

  let recommendedMrpInr = stored.recommendedMrpInr ?? null;
  let elasticityDownPct = stored.elasticityDownPct ?? null;
  let elasticityUpPct = stored.elasticityUpPct ?? null;
  let mrpAdjustmentNote = stored.mrpAdjustmentNote ?? null;
  const divisionLabel = String(division || "").trim() || "matched";
  const floorMrp = band.floorMrp;
  if (centre != null && centre > 0 && floorMrp != null && centre + 0.5 < floorMrp) {
    recommendedMrpInr = floorMrp;
    mrpAdjustmentNote = `Filter 2 MRP ₹${centre.toFixed(0)} sits below the margin-floor MRP — move toward ₹${floorMrp.toFixed(0)} to hold the ${divisionLabel} floor.`;
  } else if (centre != null && centre > 0 && minMrpInr != null && maxMrpInr != null) {
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
      volumeLossPriceIncreasePct: lift,
      liftPct: lift,
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
    const rounded = String(Math.round(maxMrpInr));
    const citesBadMax = new RegExp(`₹${rounded}`).test(
      `${stored.mrpAdjustmentNote || ""} ${stored.basis || ""}`
    );
    const rec = asNum(stored.recommendedMrpInr);
    const recIsBadMax = rec != null && Math.abs(rec - maxMrpInr) < 1;
    return {
      ...stored,
      minMrpInr,
      maxMrpInr: null,
      maxMarginPct: null,
      rangeError: INVALID_MRP_RANGE_COPY,
      recommendedMrpInr: recIsBadMax ? null : stored.recommendedMrpInr,
      mrpAdjustmentNote: citesBadMax ? null : stored.mrpAdjustmentNote,
      basis: stripInvalidCeilingCopy(stored.basis, maxMrpInr),
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

/** Display helper — never call .toFixed on a null Max/Min MRP. */
export function formatRupeeInr(value, { digits = 0, empty = "—" } = {}) {
  if (value == null || value === "") return empty;
  const n = Number(value);
  if (!Number.isFinite(n)) return empty;
  return `₹${n.toFixed(digits)}`;
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
