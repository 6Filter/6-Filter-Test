/**
 * Browser-safe idea-scale helpers (10g / 100g / 1000g). No DB, no Node APIs.
 *
 * 10g   — expected business up to ₹1 Cr
 * 100g  — ₹1 Cr to ₹12 Cr
 * 1000g — above ₹12 Cr
 */

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
  const n = Number(cr);
  if (!Number.isFinite(n) || n <= 1) return "10g";
  if (n <= 12) return "100g";
  return "1000g";
}

/** Gram badge only when Filter 5 has a real year-3 rupee figure. */
export function ideaSizeTier(computedRevenueCr) {
  if (computedRevenueCr == null) return null;
  const n = Number(computedRevenueCr);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return { tier: "10g", label: "up to ₹1 Cr" };
  if (n <= 12) return { tier: "100g", label: "₹1–12 Cr" };
  return { tier: "1000g", label: "above ₹12 Cr" };
}

function fmtFactor(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "");
}

/** Households × trial × repeat × frequency × pack — only when F5 has a real number. */
export function ideaSizeFromF5(f5 = {}) {
  const stored = numOrNull(f5.computedRevenue);
  const computed = computeIdeaRevenueCr(f5);
  const cr = stored != null ? stored : computed;
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

/** Band copy that sits next to 10g / 100g / 1000g — not a fabricated rupee figure. */
export function ideaScaleImpactCopy(scale) {
  if (scale === "1000g") return "above ₹12 Cr";
  if (scale === "100g") return "₹1–12 Cr";
  return "up to ₹1 Cr";
}

export function ideaScaleFromDoc(doc = {}) {
  return ideaScaleLabel(ideaBusinessCr(doc));
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
