/**
 * Part 128/129 fixed-slot scoring — denominator never shrinks as evidence arrives.
 * Slots are matched by name via expectedSlotKeys(), not list position.
 * Browser-safe (no Node APIs).
 */
import {
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
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
    f1: ["benchmark", "gap", "attributes", "derivation", "route", "argument"],
    f2: ["mrpGrammage", "netMarginFloor", "qcomTrajectory"],
    f3: ["mrpInSafeRange"],
    f4: [...TECH_SHIFT_DIMENSIONS],
  };
}

function itemMatchesSlot(filterKey, slotKey, it) {
  if (filterKey === "f1" && it?.slot) return String(it.slot) === String(slotKey);
  const t = String(it?.text || "");
  if (filterKey === "f1") {
    if (slotKey === "benchmark") return /benchmark|first-mover/i.test(t);
    if (slotKey === "gap") return /declared gap|gap of|gap \d|first-mover gap/i.test(t);
    if (slotKey === "attributes") return /attribute|evidence source/i.test(t);
    if (slotKey === "derivation") return /gap derivation|parity/i.test(t);
    if (slotKey === "route") return /growth route/i.test(t);
    if (slotKey === "argument") return /growth argument/i.test(t);
  }
  if (filterKey === "f2") {
    if (slotKey === "mrpGrammage") return /\bMRP\b|grammage|pack size/i.test(t);
    if (slotKey === "netMarginFloor") return /net margin|division floor|minimum/i.test(t);
    if (slotKey === "qcomTrajectory") return /quick-commerce|q-?com|take-rate|commission/i.test(t);
  }
  if (filterKey === "f3") {
    return /safe|range|floor|ceiling|volume loss|MRP|elasticity/i.test(t) || t.length > 0;
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

/**
 * Count cleared slots for one filter under the fixed-slot table.
 * Part 133: Filter 1 counts the first six items by position (slot field preferred).
 */
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
    const items = Array.isArray(check.items) ? check.items.slice(0, 6) : [];
    let done = 0;
    for (const it of items) {
      if (it?.status === "done") done += 1;
    }
    return Math.min(slots, done);
  }

  if (filterKey === "f3") {
    const items = Array.isArray(check.items) ? check.items : [];
    return items.some((i) => i.status === "done") ? 1 : 0;
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
  let done = 0;

  for (const slotKey of slotKeys) {
    let foundIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      if (!itemMatchesSlot(filterKey, slotKey, pool[i])) continue;
      foundIdx = i;
      break;
    }
    // Ordered fallback when copy is atypical: claim the next unused analytical row.
    // Name match still wins first (expectedSlotKeys); this only fills unmatched slots.
    if (foundIdx < 0 && (filterKey === "f1" || filterKey === "f2" || filterKey === "f4")) {
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) continue;
    used.add(foundIdx);
    if (pool[foundIdx]?.status === "done") done += 1;
  }

  return Math.min(slots, done);
}

export function scoreFixedSlots(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  const byFilter = {};
  let done = 0;
  let total = 0;
  for (const k of keys) {
    const slotKeys = expectedSlotKeys()[k] || [];
    const slots = slotKeys.length || Number(SCORE_CHECK_SLOTS[k] || 0);
    const cleared = countDoneSlots(k, advisoryChecks[k]);
    byFilter[k] = {
      done: cleared,
      total: slots,
      pct: slots ? Math.round((100 * cleared) / slots) : 0,
      unscored: cleared === 0 && isNotYetRun(advisoryChecks[k]),
      slots: true,
      slotKeys,
    };
    done += cleared;
    total += slots;
  }
  if (keys.length === 4 && keys.every((k) => SCORE_CHECK_SLOTS[k] != null)) {
    total = SCORE_CHECK_SLOTS_TOTAL;
  }
  return {
    byFilter,
    done,
    total,
    pct: total ? Math.round((100 * done) / total) : 0,
    denominatorMode: SCORE_DENOMINATOR_MODE,
  };
}
