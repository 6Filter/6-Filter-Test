/**
 * Part 138 E5 — pre-fill Filter 2 net margin with the locked division minimum.
 * Pure, browser-safe. Used by the form (live) and by the server auto-fill pass.
 *
 * Rules:
 *  - never overwrite a value a person typed (netMarginSource === "user", or a value with no source flag);
 *  - fill when the field is empty and the division minimum is known;
 *  - when the value is still our own division-minimum default and the division changes, move it to the new minimum.
 */
import { lockedFloorForProposition } from "./divisionMargin.js";

export const DIVISION_MINIMUM_SOURCE = "division-minimum";
export const NET_MARGIN_STATUS_PATH = "f2.netMarginAtScale";

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

/**
 * @param {object} doc proposition-shaped object (division, f2, researchFindings…)
 * @returns {{ changed: boolean, f2: object, floor: number|null }}
 */
export function applyDivisionMinimumMargin(doc = {}) {
  const f2 = doc?.f2 && typeof doc.f2 === "object" ? doc.f2 : {};
  const floor = lockedFloorForProposition(doc);
  if (floor == null) return { changed: false, f2, floor: null };
  const source = String(f2.netMarginSource || "").toLowerCase();
  if (source === "user") return { changed: false, f2, floor };
  if (isBlank(f2.netMarginAtScale)) {
    return {
      changed: true,
      f2: { ...f2, netMarginAtScale: floor, netMarginSource: DIVISION_MINIMUM_SOURCE },
      floor,
    };
  }
  if (source === DIVISION_MINIMUM_SOURCE && Number(f2.netMarginAtScale) !== floor) {
    return {
      changed: true,
      f2: { ...f2, netMarginAtScale: floor, netMarginSource: DIVISION_MINIMUM_SOURCE },
      floor,
    };
  }
  return { changed: false, f2, floor };
}

/** Status-map entry the form and server both write. */
export function divisionMinimumStatusEntry(floor) {
  return {
    status: "filled",
    source: DIVISION_MINIMUM_SOURCE,
    value: floor,
    at: new Date().toISOString(),
  };
}
