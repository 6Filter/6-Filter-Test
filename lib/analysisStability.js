/**
 * Browser-safe helpers so a second Submit of the same idea does not
 * re-score or re-label grammage.
 */

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function filterSlice(filter) {
  return filter && typeof filter === "object" ? filter : {};
}

/** Fields that feed Filter 1–4 score and 10g/100g/1000g. */
export function gateInputKey(doc = {}) {
  const f5 = filterSlice(doc.f5);
  return stableStringify({
    name: String(doc.name || "").trim().toLowerCase(),
    category: String(doc.category || "").trim().toLowerCase(),
    idea: String(doc.ideaDescription || "").trim().toLowerCase(),
    division: String(doc.division || "").trim().toLowerCase(),
    f1: filterSlice(doc.f1),
    f2: filterSlice(doc.f2),
    f3: filterSlice(doc.f3),
    f4: filterSlice(doc.f4),
    f5: {
      householdsReachedY3Mn: f5.householdsReachedY3Mn ?? null,
      trialRatePct: f5.trialRatePct ?? null,
      repeatConversionPct: f5.repeatConversionPct ?? null,
      purchaseFrequencyYr: f5.purchaseFrequencyYr ?? null,
      avgPackValueInr: f5.avgPackValueInr ?? null,
      computedRevenue: f5.computedRevenue ?? null,
    },
  });
}

export function shouldReuseAnalysis({
  existingGoNoGo,
  forceResearch = false,
  ideaChanged = false,
  previousGateKey = "",
  nextGateKey = "",
} = {}) {
  if (forceResearch || ideaChanged) return false;
  if (!existingGoNoGo?.classification || !existingGoNoGo?.score) return false;
  const prev = String(previousGateKey || "");
  const next = String(nextGateKey || "");
  return Boolean(prev) && prev === next;
}
