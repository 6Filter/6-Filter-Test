/**
 * Browser-safe output-page helpers. Does not score, classify, or rewrite narratives.
 * Point values are 100 / scored F1–F4 checklist items (form-admin gaps excluded).
 */
import { analysisCheckItems } from "./filterChecks.js";
import { fieldOwners } from "./fieldOwnership.js";
import { scoreAdvisoryChecks } from "./goNoGo.js";
import { SIX_FILTERS_FORM } from "./propositionFields.js";
import { GONOGO_SCORE_BANDS, isGoScore } from "./lockedConstants.js";
import { scoreInputsMatch } from "./analysisStability.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4"];

function fieldKeyForItem(filterKey, text) {
  const t = String(text || "");
  const k = String(filterKey || "").toLowerCase();
  if (k === "f1") {
    if (
      /attribute|purchase driver|primary research|category currently sells on|requires primary research/i.test(
        t
      )
    ) {
      return "declaredAttribute";
    }
    if (/benchmark/i.test(t)) return "benchmark";
    if (/declared gap|gap \d/i.test(t)) return "declaredGap";
    if (/growth|category size/i.test(t)) return "growthArgument";
  }
  if (k === "f2") {
    if (/net margin/i.test(t)) return "netMarginAtScale";
    if (/quick-commerce|q-com/i.test(t)) return "qcomTrajectory";
    if (/finance/i.test(t)) return "financeSigned";
    if (/mrp|grammage/i.test(t)) return "mrpInr";
  }
  if (k === "f3") return "marginElasticity";
  if (k === "f4") return "techShiftRisk";
  if (k === "f5") {
    if (/cmi signature/i.test(t)) return "cmiHeadSigned";
    if (/sizing|households|year-3 revenue/i.test(t)) return "householdsReachedY3Mn";
  }
  if (k === "f6") {
    if (/lab gap/i.test(t)) return "labGapVsBenchmark";
    if (/consumer panel/i.test(t)) return "consumerPanelBeaters";
    if (/pack standout/i.test(t)) return "packStandoutGap";
    if (/pack quality/i.test(t)) return "packQualityParity";
  }
  return null;
}

export function ownersForCheckItem(filterKey, text) {
  const fieldKey = fieldKeyForItem(filterKey, text);
  if (!fieldKey) return [];
  return fieldOwners(fieldKey) || [];
}

function improvementSeverity(item, advisoryChecks = {}) {
  const text = String(item?.text || "");
  const label = String(advisoryChecks[String(item?.filter || "").toLowerCase()]?.checkLabel || "");
  if (label === "Below floor" || /below the .+ floor|above the safe|safe ₹|volume loss|non-negotiable/i.test(text)) {
    return 0;
  }
  if (/not verified|requires primary research|High risk|first-mover claim|declared gap .+ below/i.test(text)) {
    return 1;
  }
  if (/Medium risk|category size|mitigation response/i.test(text)) return 2;
  return 3;
}

export function computeImprovementPointValues(advisoryChecks = {}) {
  const allItems = FILTER_KEYS.flatMap((k) =>
    analysisCheckItems(advisoryChecks[k]?.items).map((item) => ({
      ...item,
      filter: k.toUpperCase(),
    }))
  );
  const totalItems = allItems.length;
  const pointsPerItem = totalItems > 0 ? 100 / totalItems : 0;

  return allItems
    .filter((item) => item.status === "pending")
    .map((item) => ({
      ...item,
      pointValue: Math.round(pointsPerItem),
      owners: ownersForCheckItem(item.filter, item.text),
    }))
    .sort((a, b) => {
      const sev = improvementSeverity(a, advisoryChecks) - improvementSeverity(b, advisoryChecks);
      if (sev !== 0) return sev;
      return b.pointValue - a.pointValue;
    });
}

/** Filters 1–4 that never produced a scored checklist (so "nothing outstanding" would be misleading). */
export function unscoredFilterLabels(advisoryChecks = {}) {
  return FILTER_KEYS.filter((k) => {
    const label = String(advisoryChecks[k]?.checkLabel || "");
    const items = analysisCheckItems(advisoryChecks[k]?.items);
    return label === "Not yet run" || (!items.length && label !== "Cleared" && label !== "Exempt");
  }).map((k) => k.toUpperCase());
}

export function emptyImprovementReason(advisoryChecks = {}, improvementItems = []) {
  if (Array.isArray(improvementItems) && improvementItems.length) return "";
  const score = scoreAdvisoryChecks(advisoryChecks);
  if (isGoScore(score.pct)) return "";
  const unscored = unscoredFilterLabels(advisoryChecks);
  if (!score.total) {
    return unscored.length
      ? `${unscored.join(", ")} ${unscored.length === 1 ? "has" : "have"} not been scored yet — complete those inputs and Submit so feedback can cite your numbers and research.`
      : "No scored Filter 1–4 checks yet — enter the idea fields and Submit so feedback can cite your inputs and research.";
  }
  if (unscored.length) {
    return `${unscored.join(", ")} ${unscored.length === 1 ? "is" : "are"} still unscored — finish those filters before treating the checklist as clear.`;
  }
  return "No open analytical gaps on the scored Filter 1–4 checklist for this idea.";
}

export function projectedScoreIfTopResolved(advisoryChecks, improvementItems, count = 2) {
  const score = scoreAdvisoryChecks(advisoryChecks);
  const add = Math.min(
    Number(count) || 0,
    Array.isArray(improvementItems) ? improvementItems.length : 0
  );
  if (!score.total) return Number.isFinite(Number(score.pct)) ? Number(score.pct) : 0;
  return Math.round((100 * Math.min(score.total, score.done + add)) / score.total);
}

/** Fewest pending F1–F4 items that would actually push the score strictly above 80 (GO). */
export function closestPathToGo(advisoryChecks, improvementItems) {
  const score = scoreAdvisoryChecks(advisoryChecks);
  const pending = Array.isArray(improvementItems) ? improvementItems : [];
  const currentPct = score.pct;
  if (isGoScore(currentPct) || !pending.length || !score.total) {
    return {
      currentPct,
      projectedPct: currentPct,
      items: [],
      reachesGo: isGoScore(currentPct),
      emptyReason: emptyImprovementReason(advisoryChecks, pending),
    };
  }
  let n = 0;
  let projectedPct = currentPct;
  while (n < pending.length) {
    n += 1;
    projectedPct = Math.round((100 * (score.done + n)) / score.total);
    if (isGoScore(projectedPct)) break;
  }
  // Never suggest a path that lowers the displayed score (stale ring vs live checks).
  if (projectedPct < currentPct) {
    return {
      currentPct,
      projectedPct: currentPct,
      items: [],
      reachesGo: isGoScore(currentPct),
      emptyReason: emptyImprovementReason(advisoryChecks, pending),
    };
  }
  return {
    currentPct,
    projectedPct,
    items: pending.slice(0, n),
    reachesGo: isGoScore(projectedPct),
    emptyReason: "",
  };
}

/**
 * Output-page score: same entered values must keep the stored percent.
 * Recompute only when scoreInputKey is present and no longer matches the form.
 * lockKey may sit on goNoGo (preferred) or on the score object.
 */
export function resolveOutputScore(advisoryChecks, storedScore, doc = null, lockKey = null) {
  const key = String(
    (storedScore && storedScore.scoreInputKey) || lockKey || ""
  ).trim();
  const stored =
    storedScore && typeof storedScore === "object" && Number(storedScore.total) > 0
      ? {
          done: Number(storedScore.done) || 0,
          total: Number(storedScore.total) || 0,
          pct: Number.isFinite(Number(storedScore.pct)) ? Number(storedScore.pct) : 0,
          byFilter: storedScore.byFilter || {},
          scoreInputKey: key || storedScore.scoreInputKey,
        }
      : null;
  if (doc && stored) {
    if (!key || scoreInputsMatch(doc, { scoreInputKey: key })) {
      return stored;
    }
  }
  const live = scoreAdvisoryChecks(advisoryChecks || {});
  if (live.total > 0) return live;
  return stored || live;
}

export function scoreArcColor(pct) {
  const n = Number(pct);
  const score = Number.isFinite(n) ? n : 0;
  if (score > GONOGO_SCORE_BANDS.WATCH_MAX) return "var(--pass)";
  if (score >= GONOGO_SCORE_BANDS.NOGO_MAX) return "var(--watch)";
  return "var(--fail)";
}

function valueFilled(v) {
  if (typeof v === "boolean") return v === true;
  if (v == null) return false;
  if (typeof v === "object") {
    return Object.values(v).some((x) => valueFilled(x));
  }
  return String(v).trim() !== "";
}

export function filterHasEvidence(values, spec) {
  if (!values || typeof values !== "object" || !spec) return false;
  for (const field of spec.fields || []) {
    if (field.key === "forumVerdict" || field.key === "verdictNote") continue;
    if (valueFilled(values[field.key])) return true;
  }
  return false;
}

export function countFiltersWithEvidence(doc = {}) {
  let have = 0;
  for (const spec of SIX_FILTERS_FORM) {
    if (filterHasEvidence(doc[spec.key], spec)) have += 1;
  }
  return { have, total: SIX_FILTERS_FORM.length };
}

/** F2 actual vs division floor already written into check copy — not a new floor lookup. */
export function f2ActualVsFloor(doc = {}, check = {}) {
  const actual = Number(doc?.f2?.netMarginAtScale);
  if (!Number.isFinite(actual)) return null;
  const items = Array.isArray(check?.items) ? check.items : [];
  for (const it of items) {
    const m = String(it.text || "").match(
      /Net margin ([\d.]+)% (?:is below|clears) the ([\d.]+)% floor/i
    );
    if (m) {
      const floor = Number(m[2]);
      if (!Number.isFinite(floor)) return null;
      return { actual, floor, unit: "%" };
    }
  }
  return null;
}

/** F3 implied shelf price (stored Filter 2 MRP) vs already-computed safe max MRP. */
export function f3ActualVsCeiling(doc = {}) {
  const actual = Number(doc?.f2?.mrpInr);
  const ceiling = Number(doc?.f3?.marginElasticity?.maxMrpInr);
  if (!Number.isFinite(actual) || !Number.isFinite(ceiling)) return null;
  return { actual, ceiling, unit: "₹" };
}

export function formatScreenedDuration(ms) {
  if (ms == null || ms === "") return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return null;
  const sec = Math.max(1, Math.round(n / 1000));
  return `${sec}s`;
}

export function formatOutputDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
