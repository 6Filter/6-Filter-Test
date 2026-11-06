/**
 * Part 128/133 fixed-slot scoring — denominator never shrinks as evidence arrives.
 * Part 133 relevance: when an item carries `credit` (0..1), that fraction is summed;
 * otherwise a check without credit counts 1 if done and 0 if not (Filter 3/4 + numeric).
 * Browser-safe (no Node APIs).
 */
import {
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  CHECK_WEIGHTS,
  RELEVANCE_SHADOW_MODE,
  SCORING_MODEL,
} from "./lockedConstants.js";
import { analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { TECH_SHIFT_DIMENSIONS, DIMENSION_LABELS } from "./techShiftRisk.js";

const FINANCE_SIGN_RE =
  /hasn't been confirmed by Finance|Finance has confirmed the margin|Finance has not confirmed|Finance still needs to confirm|confirmed by Finance/i;

function isNotYetRun(check) {
  const label = String(check?.checkLabel || "");
  if (label === "Not yet run") return true;
  const items = Array.isArray(check?.items) ? check.items : [];
  return !items.length && label !== "Cleared" && label !== "Exempt";
}

/** F2 analytical slots exclude the Finance sign-off admin tick. */
export function f2AnalyticalItems(check) {
  const items = Array.isArray(check?.items) ? check.items : [];
  return items.filter((it) => !FINANCE_SIGN_RE.test(String(it?.text || "")));
}

export function expectedSlotKeys() {
  return {
    f1: ["benchmark", "gap", "attributes", "derivation", "parity", "route", "argument"],
    f2: ["margin", "packSize", "gst"],
    f3: ["resilience"],
    f4: [...TECH_SHIFT_DIMENSIONS],
  };
}

function itemMatchesSlot(filterKey, slotKey, it) {
  if ((filterKey === "f1" || filterKey === "f2") && it?.slot) {
    if (filterKey === "f2" && (slotKey === "qcom" || slotKey === "qcomTrajectory")) {
      return String(it.slot) === "qcom" || String(it.slot) === "qcomTrajectory";
    }
    if (filterKey === "f2" && (slotKey === "margin" || slotKey === "netMarginFloor")) {
      return String(it.slot) === "margin" || String(it.slot) === "netMarginFloor";
    }
    return String(it.slot) === String(slotKey);
  }
  const t = String(it?.text || "");
  if (filterKey === "f1") {
    if (slotKey === "benchmark") return /benchmark|first-mover/i.test(t);
    if (slotKey === "gap") return /declared gap|gap of|gap \d|first-mover gap/i.test(t);
    if (slotKey === "attributes") return /attribute|evidence source/i.test(t);
    // Part 138 D51 — derivation and parity are separate items; derivation never matches parity text.
    if (slotKey === "derivation") return /gap derivation/i.test(t) && !/parity/i.test(t);
    if (slotKey === "parity") return /parity/i.test(t);
    if (slotKey === "route") return /growth route/i.test(t);
    if (slotKey === "argument") return /growth argument/i.test(t);
  }
  if (filterKey === "f2") {
    if (slotKey === "margin" || slotKey === "netMarginFloor") {
      return /net margin|division floor|minimum/i.test(t);
    }
    if (slotKey === "packSize") return /pack size|grammage|pack/i.test(t);
    if (slotKey === "gst") return /\bgst\b/i.test(t);
    if (slotKey === "qcom" || slotKey === "qcomTrajectory") {
      return /quick-commerce|q-?com|price plan|volume-loss|3-year|three-year/i.test(t);
    }
  }
  if (filterKey === "f3") {
    if (it?.slot === "resilience" || it?.slot === "mrpInSafeRange") return true;
    return /resilience|volume loss|fixed price|crossing|cliff|MRP|safe|range/i.test(t) || t.length > 0;
  }
  if (filterKey === "f4") {
    const label = String(DIMENSION_LABELS[slotKey] || "").trim();
    if (label && t.toLowerCase().includes(label.toLowerCase())) return true;
    const spaced = String(slotKey || "")
      .replace(/([A-Z])/g, " $1")
      .trim();
    if (spaced && t.toLowerCase().includes(spaced.toLowerCase())) return true;
    return false;
  }
  return false;
}

function weightFor(filterKey, slotKey) {
  const w = CHECK_WEIGHTS?.[filterKey]?.[slotKey];
  return Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : 1;
}

function itemCredit(it) {
  if (it && typeof it === "object" && "credit" in it && Number.isFinite(Number(it.credit))) {
    return Math.max(0, Math.min(1, Number(it.credit)));
  }
  return it?.status === "done" ? 1 : 0;
}

/**
 * Sum of credit (fractions) for one filter. Exempt F1 counts as all slots strong.
 */
export function creditSlots(filterKey, check) {
  const slotKeys = expectedSlotKeys()[filterKey] || [];
  const slots = slotKeys.length || Number(SCORE_CHECK_SLOTS[filterKey] || 0);
  if (!slots) return 0;
  if (!check || isNotYetRun(check)) return 0;

  if (filterKey === "f1" && String(check.checkLabel || "") === "Exempt") {
    const items = Array.isArray(check.items) ? check.items : [];
    if (items.some((i) => i.status === "done" || Number(i.credit) > 0)) {
      return slotKeys.reduce((sum, sk) => sum + weightFor("f1", sk), 0);
    }
    return 0;
  }

  if (filterKey === "f1") {
    const items = Array.isArray(check.items) ? check.items.slice(0, slots) : [];
    let points = 0;
    for (let i = 0; i < Math.min(slots, items.length); i++) {
      const sk = slotKeys[i];
      points += itemCredit(items[i]) * weightFor("f1", sk);
    }
    return points;
  }

  if (filterKey === "f3") {
    const items = Array.isArray(check.items) ? check.items : [];
    const it =
      items.find((i) => i.slot === "resilience") ||
      items.find((i) => i.status === "done") ||
      items[0];
    return itemCredit(it) * weightFor("f3", "resilience");
  }

  let pool =
    filterKey === "f2"
      ? f2AnalyticalItems(check)
      : filterKey === "f4"
        ? (() => {
            const items = Array.isArray(check.items) ? check.items : [];
            const dimItems = items.filter(
              (it) => !isFormAdminCheck(it) || /risk/i.test(String(it?.text || ""))
            );
            return dimItems.length ? dimItems : analysisCheckItems(items);
          })()
        : Array.isArray(check.items)
          ? check.items
          : [];

  const used = new Set();
  let points = 0;

  for (const slotKey of slotKeys) {
    let foundIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      if (!itemMatchesSlot(filterKey, slotKey, pool[i])) continue;
      foundIdx = i;
      break;
    }
    if (foundIdx < 0 && (filterKey === "f2" || filterKey === "f4")) {
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) continue;
    used.add(foundIdx);
    points += itemCredit(pool[foundIdx]) * weightFor(filterKey, slotKey);
  }

  return points;
}

/** Binary count of strong/done slots (legacy display / shadow comparison). */
export function countDoneSlots(filterKey, check) {
  const slotKeys = expectedSlotKeys()[filterKey] || [];
  const slots = slotKeys.length || Number(SCORE_CHECK_SLOTS[filterKey] || 0);
  if (!slots) return 0;
  if (!check || isNotYetRun(check)) return 0;

  if (filterKey === "f1" && String(check.checkLabel || "") === "Exempt") {
    const items = Array.isArray(check.items) ? check.items : [];
    return items.some((i) => i.status === "done") ? slots : 0;
  }

  if (filterKey === "f1") {
    const items = Array.isArray(check.items) ? check.items.slice(0, slots) : [];
    let done = 0;
    for (const it of items) {
      if (it?.status === "done" || Number(it?.credit) >= 1) done += 1;
    }
    return Math.min(slots, done);
  }

  // For shadow/legacy: count done OR credit===1
  const points = creditSlots(filterKey, check);
  // Approximate integer done for filters without per-item binary when fractional
  if (filterKey === "f3") return points >= 1 ? 1 : 0;

  let pool =
    filterKey === "f2"
      ? f2AnalyticalItems(check)
      : filterKey === "f4"
        ? (() => {
            const items = Array.isArray(check.items) ? check.items : [];
            const dimItems = items.filter(
              (it) => !isFormAdminCheck(it) || /risk/i.test(String(it?.text || ""))
            );
            return dimItems.length ? dimItems : analysisCheckItems(items);
          })()
        : Array.isArray(check.items)
          ? check.items
          : [];

  const used = new Set();
  let done = 0;
  for (const slotKey of slotKeys) {
    let foundIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      if (!itemMatchesSlot(filterKey, slotKey, pool[i])) continue;
      foundIdx = i;
      break;
    }
    if (foundIdx < 0 && (filterKey === "f2" || filterKey === "f4")) {
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) continue;
    used.add(foundIdx);
    if (pool[foundIdx]?.status === "done" || Number(pool[foundIdx]?.credit) >= 1) done += 1;
  }
  return Math.min(slots, done);
}

export function scoreFixedSlots(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  const useRelevance = SCORING_MODEL === "relevance";
  const byFilter = {};
  let points = 0;
  let binaryDone = 0;
  let total = 0;

  for (const k of keys) {
    const slotKeys = expectedSlotKeys()[k] || [];
    const slots = slotKeys.length || Number(SCORE_CHECK_SLOTS[k] || 0);
    const credit = useRelevance ? creditSlots(k, advisoryChecks[k]) : countDoneSlots(k, advisoryChecks[k]);
    const cleared = countDoneSlots(k, advisoryChecks[k]);
    byFilter[k] = {
      done: useRelevance ? Math.round(credit * 1000) / 1000 : cleared,
      total: slots,
      pct: slots ? Math.round((100 * credit) / slots) : 0,
      unscored: cleared === 0 && isNotYetRun(advisoryChecks[k]),
      slots: true,
      slotKeys,
      credit,
    };
    points += credit;
    binaryDone += cleared;
    total += slots;
  }
  if (keys.length === 4 && keys.every((k) => SCORE_CHECK_SLOTS[k] != null)) {
    total = SCORE_CHECK_SLOTS_TOTAL;
  }

  const relevancePct = total ? Math.round((100 * points) / total) : 0;
  const legacyPct = total ? Math.round((100 * binaryDone) / total) : 0;
  // Primary score is always relevance when SCORING_MODEL=relevance.
  // Shadow mode still computes legacyPct so the stamp/UI can keep showing the old verdict.
  const primaryPct = useRelevance ? relevancePct : legacyPct;
  const primaryDone = useRelevance ? Math.round(points * 1000) / 1000 : binaryDone;

  return {
    byFilter,
    done: primaryDone,
    total,
    pct: primaryPct,
    points: Math.round(points * 1000) / 1000,
    relevancePct,
    legacyPct,
    legacyDone: binaryDone,
    shadowMode: RELEVANCE_SHADOW_MODE,
    scoringModel: SCORING_MODEL,
    denominatorMode: SCORE_DENOMINATOR_MODE,
  };
}
