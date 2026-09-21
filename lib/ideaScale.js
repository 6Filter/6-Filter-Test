/**
 * Browser-safe idea-scale helpers (10g / 100g / 1000g). No DB, no Node APIs.
 *
 * LOCKED — do not change these rules:
 * 1. Same Filter 5 details → one gram tier on every surface (badge, gate, export).
 * 2. When all five F5 factors are present, the live product wins over a stored
 *    computedRevenue. A leftover rupee figure must never mint a different tier.
 * 3. Category TAM is never an idea-scale input.
 * 4. Bands stay ≤ ₹1 Cr → 10g, ≤ ₹12 Cr → 100g, else 1000g.
 *
 * 10g   — expected business up to ₹1 Cr
 * 100g  — ₹1 Cr to ₹12 Cr
 * 1000g — above ₹12 Cr
 */

import { isFilterUnlocked } from "./filterUnlock.js";
import { classifyIdeaWeightFromBands, ideaSizeTierFromBands } from "./lockedConstants.js";

function numOrNull(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

/** Year-3 revenue in ₹ Cr from Filter 5 CMI inputs. */
export function computeIdeaRevenueCr(f5 = {}) {
  const households = numOrNull(f5.householdsReachedY3Mn);
  const trial = numOrNull(f5.trialRatePct);
  const repeat = numOrNull(f5.repeatConversionPct);
  const freq = numOrNull(f5.purchaseFrequencyYr);
  const pack = numOrNull(f5.avgPackValueInr);
  if ([households, trial, repeat, freq, pack].every((v) => v != null)) {
    return (households * 1e6 * (trial / 100) * (repeat / 100) * freq * pack) / 1e7;
  }
  return numOrNull(f5.computedRevenue);
}

export function ideaBusinessCr(doc = {}) {
  const fromF5 = computeIdeaRevenueCr(doc.f5 || {});
  if (fromF5 != null && fromF5 > 0) return fromF5;

  const findingsF5 = computeIdeaRevenueCr(doc.researchFindings?.f5 || {});
  if (findingsF5 != null && findingsF5 > 0) return findingsF5;

  // Category TAM is not the idea's business impact — never promote a 10g idea to 1000g off TAM.
  return 0;
}

export function ideaScaleLabel(cr) {
  return classifyIdeaWeightFromBands(cr);
}

/** Gram badge only when Filter 5 has a real year-3 rupee figure. */
export function ideaSizeTier(computedRevenueCr) {
  return ideaSizeTierFromBands(computedRevenueCr);
}

function fmtFactor(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "");
}

/** Households × trial × repeat × frequency × pack — only when F5 has a stored rupee figure. */
export function ideaSizeFromF5(f5 = {}) {
  const stored = numOrNull(f5.computedRevenue);
  if (stored == null) return null;
  const computed = computeIdeaRevenueCr(f5);
  const cr = computed != null ? computed : stored;
  const tier = ideaSizeTier(cr);
  if (!tier) return null;
  const households = numOrNull(f5.householdsReachedY3Mn);
  const trial = numOrNull(f5.trialRatePct);
  const repeat = numOrNull(f5.repeatConversionPct);
  const freq = numOrNull(f5.purchaseFrequencyYr);
  const pack = numOrNull(f5.avgPackValueInr);
  const hasFactors = [households, trial, repeat, freq, pack].every((v) => v != null);
  const derivation = hasFactors
    ? `${fmtFactor(households)} Mn households × ${fmtFactor(trial)}% trial × ${fmtFactor(repeat)}% repeat × ${fmtFactor(freq)}/yr × ₹${fmtFactor(pack)} = ₹${fmtFactor(cr, 2)} Cr`
    : `Year-3 revenue ₹${fmtFactor(cr, 2)} Cr`;
  return { ...tier, computedRevenueCr: cr, derivation };
}

const IDEA_SCALE_TIERS = new Set(["10g", "100g", "1000g"]);

function normalizeIdeaScaleTier(value) {
  const tier = String(value || "").trim();
  return IDEA_SCALE_TIERS.has(tier) ? tier : null;
}

/**
 * Hero / Log gram badge. Prefers a live year-3 figure (research or human F5);
 * otherwise uses stored goNoGo.ideaScale, then defaults to 10g so every screened
 * idea shows an idea-scale chip on output and in the Log.
 */
export function ideaSizeForResult(doc = {}) {
  const f5 = doc?.f5 || {};
  const findingsF5 = doc?.researchFindings?.f5 || {};
  const suggestionsF5 = doc?.suggestions?.f5 || {};
  // Prefer researchFindings, then suggestions (legacy cache), then live form fields.
  const researchF5 = { ...suggestionsF5, ...findingsF5 };
  const cr = ideaBusinessCr({ f5, researchFindings: { f5: researchF5 } });
  if (cr > 0) {
    const sized = ideaSizeFromF5({ ...researchF5, ...f5, computedRevenue: cr });
    if (sized) {
      const confirmed = Boolean(f5.confirmedByHuman) && isFilterUnlocked("f5", doc || {});
      return { ...sized, provisional: !confirmed };
    }
  }

  const stored = normalizeIdeaScaleTier(doc?.goNoGo?.ideaScale);
  const tier = stored || "10g";
  return {
    tier,
    label: ideaScaleImpactCopy(tier),
    computedRevenueCr: 0,
    provisional: true,
    derivation: stored
      ? `Stored idea scale ${tier} · ${ideaScaleImpactCopy(tier)}`
      : "Idea scale defaults to 10g (up to ₹1 Cr) until Filter 5 year-3 revenue is sized.",
  };
}

/** Band copy that sits next to 10g / 100g / 1000g — not a fabricated rupee figure. */
export function ideaScaleImpactCopy(scale) {
  if (scale === "1000g") return "above ₹12 Cr";
  if (scale === "100g") return "₹1–12 Cr";
  return "up to ₹1 Cr";
}

export function ideaScaleFromDoc(doc = {}) {
  const sized = ideaSizeForResult(doc);
  if (sized?.tier) return sized.tier;
  return ideaScaleLabel(ideaBusinessCr(doc));
}

/** Prefer live sizing, then stored goNoGo.ideaScale — for Log list rows. */
export function ideaScaleForLog(doc = {}) {
  if (!(doc?.goNoGo?.classification || doc?.classification)) return "";
  return ideaSizeForResult(doc)?.tier || normalizeIdeaScaleTier(doc?.goNoGo?.ideaScale) || "10g";
}

export function formIdeaLabel(doc = {}) {
  return String(doc?.name || "").trim();
}

export function formCategoryLabel(doc = {}) {
  return String(doc?.category || "").trim();
}

export function categoryCheckCopy(category) {
  const name = String(category || "").trim();
  return name ? `Category: ${name}` : "Category is not filled on the input form yet";
}
