/**
 * Identity of the fields that feed Filter 1–4 score and 10g/100g/1000g.
 * Same entered values → same gateInputKey → same locked score (see scoreInputKey).
 * Browser-safe — no Node APIs (imported from the form).
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

/** Drop volatile UI-only keys so fingerprint stays stable across saves. */
function scoringFilterSlice(filter) {
  const src = filterSlice(filter);
  const out = {};
  for (const key of Object.keys(src).sort()) {
    if (key === "forumVerdict" || key === "verdictNote") continue;
    out[key] = src[key];
  }
  return out;
}

/** FNV-1a 32-bit — short, deterministic, browser-safe. */
function fingerprint32(text) {
  let h = 0x811c9dc5;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Fields that feed Filter 1–4 score — identity of entered values only. */
export function gateInputKey(doc = {}) {
  const f5 = filterSlice(doc.f5);
  return stableStringify({
    name: String(doc.name || "").trim().toLowerCase(),
    category: String(doc.category || "").trim().toLowerCase(),
    idea: String(doc.ideaDescription || "").trim().toLowerCase(),
    division: String(doc.division || "").trim().toLowerCase(),
    f1: scoringFilterSlice(doc.f1),
    f2: scoringFilterSlice(doc.f2),
    f3: scoringFilterSlice(doc.f3),
    f4: scoringFilterSlice(doc.f4),
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

/** Short stable id stored on goNoGo so reopen/resubmit with same inputs keep the score. */
export function scoreInputKey(doc = {}) {
  return fingerprint32(gateInputKey(doc));
}

export function scoreInputsMatch(doc = {}, goNoGo = null) {
  const stored = String(
    goNoGo?.scoreInputKey || goNoGo?.score?.scoreInputKey || ""
  ).trim();
  if (!stored) return false;
  return stored === scoreInputKey(doc);
}

/** Reuse a prior gate when entered scoring inputs have not changed. */
export function lockedScoreFromPrior(doc = {}, prevGoNoGo = null) {
  if (!scoreInputsMatch(doc, prevGoNoGo)) return null;
  const score = prevGoNoGo?.score;
  if (!score || !(Number(score.total) > 0)) return null;
  if (!String(prevGoNoGo?.classification || "").trim()) return null;
  return {
    classification: prevGoNoGo.classification,
    score: {
      done: Number(score.done) || 0,
      total: Number(score.total) || 0,
      pct: Number.isFinite(Number(score.pct)) ? Number(score.pct) : 0,
      byFilter: score.byFilter || {},
    },
    rationale: String(prevGoNoGo.rationale || "").trim() || null,
    scoreInputKey: String(prevGoNoGo.scoreInputKey),
  };
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

