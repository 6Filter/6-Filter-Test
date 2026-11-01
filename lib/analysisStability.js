/**
 * Hard lock for Filter 1–4 score + GO/NO-GO/WATCH verdict.
 * Same entered values → same scoreInputKey → same sealed score forever.
 * Score/verdict may change only when scoring inputs change.
 * Browser-safe — no Node APIs (imported from the form).
 */

import { divisionForScore } from "./divisionForScore.js";

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

/** Canonical Filter 1–4 keys that feed the percent. Ignores empty UI placeholders. */
const SCORE_FILTER_KEYS = {
  f1: [
    "declaredAttribute",
    "declaredAttribute2",
    "declaredAttribute3",
    "benchmark",
    "declaredGap",
    "gapDerivation",
    "parityExceptions",
    "growthRoute",
    "growthArgument",
    "pureCommodity",
    "evidenceSourceDate",
  ],
  f2: [
    "cogsAtScale",
    "netMarginAtScale",
    "gstRatePct",
    "grammage",
    "mrpInr",
    "qcomTrajectory",
    "financeSigned",
  ],
  f3: ["marginElasticity", "f3RangeOverride"],
  f4: ["techShiftRisk", "f4MitigationResponses"],
};

function normalizeScoreValue(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (Array.isArray(value)) {
    const items = value.map(normalizeScoreValue).filter((v) => v != null);
    return items.length ? items : null;
  }
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "forumVerdict" || key === "verdictNote") continue;
      const next = normalizeScoreValue(value[key]);
      if (next != null) out[key] = next;
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

/** Only canonical scoring keys — sparse drafts and hydrated saves share one fingerprint. */
function scoringFilterSlice(filter, keys = []) {
  const src = filterSlice(filter);
  const out = {};
  for (const key of keys) {
    const next = normalizeScoreValue(src[key]);
    if (next != null) out[key] = next;
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

function storedScoreInputKey(goNoGo = null) {
  return String(goNoGo?.scoreInputKey || goNoGo?.score?.scoreInputKey || "").trim();
}

function cloneSealedScore(score, inputKey) {
  return {
    done: Number(score?.done) || 0,
    total: Number(score?.total) || 0,
    pct: Number.isFinite(Number(score?.pct)) ? Number(score.pct) : 0,
    byFilter: score?.byFilter && typeof score.byFilter === "object" ? score.byFilter : {},
    scoreInputKey: inputKey,
  };
}

/** Fields that feed Filter 1–4 score — identity of entered values only. */
export function gateInputKey(doc = {}) {
  const f5 = filterSlice(doc.f5);
  return stableStringify({
    name: String(doc.name || "").trim().toLowerCase() || null,
    category: String(doc.category || "").trim().toLowerCase() || null,
    idea: String(doc.ideaDescription || "").trim().toLowerCase() || null,
    division: String(divisionForScore(doc) || "").trim().toLowerCase() || null,
    f1: scoringFilterSlice(doc.f1, SCORE_FILTER_KEYS.f1),
    f2: scoringFilterSlice(doc.f2, SCORE_FILTER_KEYS.f2),
    f3: scoringFilterSlice(doc.f3, SCORE_FILTER_KEYS.f3),
    f4: scoringFilterSlice(doc.f4, SCORE_FILTER_KEYS.f4),
    f5: {
      householdsReachedY3Mn: normalizeScoreValue(f5.householdsReachedY3Mn),
      trialRatePct: normalizeScoreValue(f5.trialRatePct),
      repeatConversionPct: normalizeScoreValue(f5.repeatConversionPct),
      purchaseFrequencyYr: normalizeScoreValue(f5.purchaseFrequencyYr),
      avgPackValueInr: normalizeScoreValue(f5.avgPackValueInr),
      computedRevenue: normalizeScoreValue(f5.computedRevenue),
    },
  });
}

/** Short stable id stored on goNoGo so reopen/resubmit with same inputs keep the score. */
export function scoreInputKey(doc = {}) {
  return fingerprint32(gateInputKey(doc));
}

export function scoreInputsMatch(doc = {}, goNoGo = null) {
  const stored = storedScoreInputKey(goNoGo);
  if (!stored) return false;
  return stored === scoreInputKey(doc);
}

/**
 * Write-path lock: only when a stored fingerprint still matches the form.
 * Missing fingerprint → allow one recompute that stamps scoreInputKey.
 */
export function lockedScoreFromPrior(doc = {}, prevGoNoGo = null) {
  if (!scoreInputsMatch(doc, prevGoNoGo)) return null;
  const score = prevGoNoGo?.score;
  if (!score || !(Number(score.total) > 0)) return null;
  if (!String(prevGoNoGo?.classification || "").trim()) return null;
  const key = storedScoreInputKey(prevGoNoGo) || scoreInputKey(doc);
  return {
    classification: prevGoNoGo.classification,
    score: cloneSealedScore(score, key),
    rationale: String(prevGoNoGo.rationale || "").trim() || null,
    scoreInputKey: key,
    checkLabels: prevGoNoGo.checkLabels || null,
    filterNarratives: prevGoNoGo.filterNarratives || null,
    at: prevGoNoGo.at || null,
  };
}

/** Read-path seal: keep stored score/verdict; only stamp scoreInputKey if missing. */
export function sealStoredGoNoGo(doc = {}, prevGoNoGo = null) {
  if (!prevGoNoGo || typeof prevGoNoGo !== "object") return prevGoNoGo;
  if (!String(prevGoNoGo.classification || "").trim()) return prevGoNoGo;
  const score = prevGoNoGo.score;
  if (!score || !(Number(score.total) > 0)) return prevGoNoGo;
  const key = storedScoreInputKey(prevGoNoGo) || scoreInputKey(doc);
  return {
    ...prevGoNoGo,
    scoreInputKey: key,
    score: cloneSealedScore(score, key),
  };
}

/**
 * DB / API hard lock: if prev and next share the same scoreInputKey, the prior
 * score and verdict are immutable — callers cannot overwrite them.
 */
export function hardLockGoNoGo(prev = null, next = null) {
  if (!next || typeof next !== "object") return next;
  const nextClass = String(next.classification || "").trim();
  if (!["GO", "NO-GO", "WATCH"].includes(nextClass)) return next;

  const prevClass = String(prev?.classification || "").trim();
  const prevScore = prev?.score;
  const prevKey = storedScoreInputKey(prev);
  const nextKey = storedScoreInputKey(next);

  if (
    prevKey &&
    nextKey &&
    prevKey === nextKey &&
    ["GO", "NO-GO", "WATCH"].includes(prevClass) &&
    prevScore &&
    Number(prevScore.total) > 0
  ) {
    return {
      ...next,
      classification: prevClass,
      score: cloneSealedScore(prevScore, prevKey),
      scoreInputKey: prevKey,
      rationale: String(prev.rationale || next.rationale || "").trim(),
      at: prev.at || next.at || null,
      ...(prev.checkLabels ? { checkLabels: prev.checkLabels } : {}),
      ...(prev.filterNarratives ? { filterNarratives: prev.filterNarratives } : {}),
    };
  }

  const key = nextKey || prevKey || "";
  return {
    ...next,
    classification: nextClass,
    ...(key
      ? {
          scoreInputKey: key,
          score: next.score ? cloneSealedScore(next.score, key) : next.score,
        }
      : {}),
  };
}

/**
 * Single resolve path for gate writes: lock when inputs match, else recompute once
 * and seal with the current fingerprint.
 */
export function resolveHardLockedGoNoGo({
  doc = {},
  prev = null,
  advisoryChecks = null,
  computeClassification,
  computeScore,
  buildRationale,
  ideaName = "",
  category = "",
  extras = {},
} = {}) {
  const inputKey = scoreInputKey(doc);
  const locked = lockedScoreFromPrior(doc, prev);
  if (locked) {
    return {
      ...(prev && typeof prev === "object" ? prev : {}),
      ...extras,
      classification: locked.classification,
      score: locked.score,
      scoreInputKey: locked.scoreInputKey || inputKey,
      rationale: locked.rationale || String(prev?.rationale || "").trim(),
      at: locked.at || prev?.at || new Date().toISOString(),
      ...(locked.checkLabels ? { checkLabels: locked.checkLabels } : {}),
      ...(locked.filterNarratives ? { filterNarratives: locked.filterNarratives } : {}),
      hardLocked: true,
    };
  }

  const classification =
    typeof computeClassification === "function"
      ? computeClassification(advisoryChecks)
      : String(prev?.classification || "").trim();
  const score =
    typeof computeScore === "function" ? computeScore(advisoryChecks) : prev?.score || null;
  const rationale =
    typeof buildRationale === "function"
      ? buildRationale({ classification, score, checks: advisoryChecks, ideaName, category })
      : String(prev?.rationale || "").trim();

  return hardLockGoNoGo(prev, {
    ...(prev && typeof prev === "object" ? prev : {}),
    ...extras,
    classification,
    score: score ? cloneSealedScore(score, inputKey) : score,
    scoreInputKey: inputKey,
    rationale: String(rationale || "").trim(),
    at: new Date().toISOString(),
    hardLocked: false,
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
