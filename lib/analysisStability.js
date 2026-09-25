/**
 * Identity of the fields that feed Filter 1–4 score and 10g/100g/1000g.
 * Used for tests and traces — never as a skip of scoring. Score / GO / NO-GO
 * must be recomputed from current field values on every Submit and result view.
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

function attachmentSig(doc = {}) {
  const attach = doc?.attachment;
  if (!attach || typeof attach !== "object") return "";
  return `${attach.name || ""}|${attach.mediaType || ""}|${String(attach.data || "").length}`;
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

export function propositionInputsChanged(original = {}, incoming = {}) {
  return gateInputKey(original) !== gateInputKey(incoming) || attachmentSig(original) !== attachmentSig(incoming);
}

export function isScoredProposition(doc = {}) {
  return Boolean(doc?.researchRunAt || String(doc?.goNoGo?.classification || "").trim());
}

/** Log reopen + edited fields → new row. Drafts and unchanged resubmits stay on the same id. */
export function shouldForkLogResubmit(original = {}, incoming = {}) {
  if (!original?.id) return false;
  if (!isScoredProposition(original)) return false;
  return propositionInputsChanged(original, incoming);
}

