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

  const tam = numOrNull(
    doc.researchFindings?.f1?.categoryTamCr ?? doc.f1?.categoryTamCr
  );
  if (tam != null && tam > 0) return tam;

  return 0;
}

export function ideaScaleLabel(cr) {
  const n = Number(cr);
  if (!Number.isFinite(n) || n <= 1) return "10g";
  if (n <= 12) return "100g";
  return "1000g";
}

export function ideaScaleFromDoc(doc = {}) {
  return ideaScaleLabel(ideaBusinessCr(doc));
}

export function formCategoryLabel(doc = {}) {
  return String(doc?.category || "").trim();
}

export function categoryCheckCopy(category) {
  const name = String(category || "").trim();
  return name ? `Category: ${name}` : "Category is not filled on the input form yet";
}
