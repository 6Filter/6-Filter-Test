/**
 * Part 128 fixed-slot scoring — denominator never shrinks as evidence arrives.
 * Browser-safe (no Node APIs).
 */
import {
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
} from "./lockedConstants.js";
import { analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { TECH_SHIFT_DIMENSIONS } from "./techShiftRisk.js";

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

/**
 * Count cleared slots for one filter under the fixed-slot table.
 * Blank / form-admin / missing evidence = open slot (never dropped from total).
 */
export function countDoneSlots(filterKey, check) {
  const slots = Number(SCORE_CHECK_SLOTS[filterKey] || 0);
  if (!slots) return 0;
  if (!check || isNotYetRun(check)) return 0;

  if (filterKey === "f4") {
    const items = Array.isArray(check.items) ? check.items : [];
    // Prefer dimension rows; pad to 7 so missing dims stay open.
    const dimItems = items.filter((it) => !isFormAdminCheck(it) || /risk/i.test(String(it?.text || "")));
    const scored = dimItems.length ? dimItems : analysisCheckItems(items);
    let done = scored.filter((i) => i.status === "done").length;
    // Cap at slot count — overall summary rows must not inflate done.
    if (scored.length > slots) {
      done = scored.slice(0, slots).filter((i) => i.status === "done").length;
    }
    return Math.min(slots, done);
  }

  if (filterKey === "f2") {
    const items = f2AnalyticalItems(check).slice(0, slots);
    // Pad mentally: fewer than 3 items still means open remaining slots.
    return items.filter((i) => i.status === "done").length;
  }

  if (filterKey === "f1") {
    // Pure commodity exempt: one done item still clears the differentiation floor path —
    // count as all F1 slots cleared (commodity does not use the 4-slot checklist).
    if (String(check.checkLabel || "") === "Exempt") {
      const items = Array.isArray(check.items) ? check.items : [];
      return items.some((i) => i.status === "done") ? slots : 0;
    }
    const items = (Array.isArray(check.items) ? check.items : []).slice(0, slots);
    return items.filter((i) => i.status === "done").length;
  }

  if (filterKey === "f3") {
    const items = Array.isArray(check.items) ? check.items : [];
    return items.some((i) => i.status === "done") ? 1 : 0;
  }

  const items = analysisCheckItems(check?.items).slice(0, slots);
  return items.filter((i) => i.status === "done").length;
}

export function scoreFixedSlots(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  const byFilter = {};
  let done = 0;
  let total = 0;
  for (const k of keys) {
    const slots = Number(SCORE_CHECK_SLOTS[k] || 0);
    const cleared = countDoneSlots(k, advisoryChecks[k]);
    byFilter[k] = {
      done: cleared,
      total: slots,
      pct: slots ? Math.round((100 * cleared) / slots) : 0,
      unscored: cleared === 0 && isNotYetRun(advisoryChecks[k]),
      slots: true,
    };
    done += cleared;
    total += slots;
  }
  // Keys subset still use their slot sum; full F1–F4 is always SCORE_CHECK_SLOTS_TOTAL.
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

export function expectedSlotKeys() {
  return {
    f1: ["attribute", "benchmark", "declaredGapOrFirstMover", "growth"],
    f2: ["mrpGrammage", "netMarginFloor", "qcomTrajectory"],
    f3: ["mrpInSafeRange"],
    f4: [...TECH_SHIFT_DIMENSIONS],
  };
}
