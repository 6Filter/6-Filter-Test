/**
 * Locked division minimum net margin — scoring reads only from lockedConstants.
 * Database min_net_margin_pct is ignored for scoring; drift is reported separately.
 */
import {
  DIVISION_MIN_NET_MARGIN_PCT,
  INTERNATIONAL_BUSINESS_MARGIN,
  LOCKED_DIVISION_NAMES,
  NET_MARGIN_ASSIGNMENT,
  UNMATCHED_DIVISION_F2,
  isLockedDivisionName,
  minNetMarginForDivision,
} from "./lockedConstants.js";

export const INTERNATIONAL_BUSINESS = "International Business";

export function divisionDetectionOf(proposition = {}) {
  const fromFindings = proposition?.researchFindings?.divisionDetection;
  if (fromFindings && typeof fromFindings === "object") return fromFindings;
  if (proposition?.divisionDetection && typeof proposition.divisionDetection === "object") {
    return proposition.divisionDetection;
  }
  return null;
}

/** Division whose locked floor applies (resolves International Business → respective). */
export function effectiveMarginDivision(proposition = {}) {
  const division = String(proposition.division || "").trim();
  if (!division) return null;
  if (division === INTERNATIONAL_BUSINESS) {
    if (INTERNATIONAL_BUSINESS_MARGIN !== "respective-division") return null;
    const det = divisionDetectionOf(proposition);
    const respective =
      String(det?.respectiveDivision || proposition.respectiveDivision || "").trim() || null;
    return respective && respective !== INTERNATIONAL_BUSINESS ? respective : null;
  }
  return isLockedDivisionName(division) ? division : null;
}

export function lockedFloorForProposition(proposition = {}) {
  return minNetMarginForDivision(effectiveMarginDivision(proposition));
}

export function formatLockedDivisionLabel(proposition = {}) {
  const division = String(proposition.division || "").trim();
  if (!division) return "";
  const floorDiv = effectiveMarginDivision(proposition);
  const floor = minNetMarginForDivision(floorDiv);
  if (division === INTERNATIONAL_BUSINESS) {
    if (floorDiv && floor != null) {
      return `International Business · respective division ${floorDiv} · ${floor}% (INR at group level)`;
    }
    return "International Business · respective division not determined";
  }
  if (floor != null) return `Division: ${division} · minimum net margin ${floor}% (locked)`;
  return `Division: ${division}`;
}

/**
 * Floor hint only — does not write netMarginAtScale (AI cost estimate / user fill that).
 * Kept for callers that still import the old name.
 */
export function assignDivisionMinimumMargin(f2 = {}, proposition = {}) {
  const floor = lockedFloorForProposition(proposition);
  const label = formatMinimumMarginHint(proposition);
  return {
    f2: { ...f2 },
    assigned: false,
    floor,
    hint: label,
    assignmentMode: NET_MARGIN_ASSIGNMENT,
  };
}

/** Hint shown under the Net margin input — never auto-fills the field. */
export function formatMinimumMarginHint(proposition = {}) {
  const division = String(proposition.division || "").trim();
  if (!division) {
    return unmatchedDivisionPending()
      ? "Division not detected: the minimum is unknown and Filter 2 will wait"
      : "Division not detected";
  }
  const floorDiv = effectiveMarginDivision(proposition);
  const floor = minNetMarginForDivision(floorDiv);
  if (division === INTERNATIONAL_BUSINESS) {
    if (floorDiv && floor != null) {
      return `Minimum net margin for ${floorDiv}: ${floor}% (fixed) · INR at group level (International Business)`;
    }
    return "International Business · respective division not determined — minimum unknown";
  }
  if (floor != null) return `Minimum net margin for ${division}: ${floor}% (fixed)`;
  return `Division: ${division} — minimum not in the locked table`;
}

export function marginBelowFloorWarning(typedMargin, proposition = {}) {
  const floor = lockedFloorForProposition(proposition);
  if (floor == null) return "";
  const n = Number(typedMargin);
  if (!Number.isFinite(n)) return "";
  if (n < floor) {
    return "Below the minimum: this fails Filter 2 and the verdict will be NO-GO.";
  }
  return "";
}

export function marginWasAiFilled(f2 = {}) {
  return String(f2?.netMarginSource || "").toLowerCase() === "ai";
}

export function unmatchedDivisionPending() {
  return UNMATCHED_DIVISION_F2 === "pending";
}

export function lockedDivisionNamesExcludingIb() {
  return LOCKED_DIVISION_NAMES.filter((n) => n !== INTERNATIONAL_BUSINESS);
}

export { DIVISION_MIN_NET_MARGIN_PCT, minNetMarginForDivision, isLockedDivisionName };
