/**
 * Part 134 revised — Filter 2 has ONE scored check: net margin vs division minimum.
 * Below minimum is a mark-down (never "Below floor", never a hard stop).
 * COGS, GST, pack size, MRP and Quick-commerce notes never change the score.
 */
import { SCORE_CHECK_SLOTS_TOTAL } from "./lockedConstants.js";
import { resolveF2Price } from "./mrpFormula.js";

function financeSignatureCopy(signed) {
  return signed
    ? "Finance has confirmed the margin computation"
    : "The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence, per v4's rule that unconfirmed figures are treated as a gap";
}

export const F2_SLOTS = Object.freeze(["margin"]);

export const F2_ITEM_CODES = Object.freeze({
  F2_MARGIN_CLEARS: "F2_MARGIN_CLEARS",
  F2_MARGIN_BELOW_MINIMUM: "F2_MARGIN_BELOW_MINIMUM",
  /** @deprecated Use F2_MARGIN_BELOW_MINIMUM — kept so old sealed snapshots still resolve copy. */
  F2_MARGIN_BELOW_FLOOR: "F2_MARGIN_BELOW_MINIMUM",
  F2_MARGIN_MISSING: "F2_MARGIN_MISSING",
  F2_MARGIN_DIVISION_PENDING: "F2_MARGIN_DIVISION_PENDING",
  F2_DIVISION_PENDING: "F2_MARGIN_DIVISION_PENDING",
});

function gainPct(credit) {
  const c = Number(credit);
  const remaining = Number.isFinite(c) ? Math.max(0, 1 - c) : 1;
  return Math.round((remaining * 100) / SCORE_CHECK_SLOTS_TOTAL);
}

function row({ status, text, slot, code, level, credit, reasons, formAdmin }) {
  const out = {
    status,
    text,
    slot,
    code,
    level: level || "none",
    credit: Number.isFinite(Number(credit)) ? Number(credit) : 0,
    reasons: Array.isArray(reasons) ? reasons : [],
    gainPct: gainPct(credit),
  };
  if (formAdmin) out.formAdmin = true;
  return out;
}

/**
 * Pure Filter 2 rules. `floor` is the locked division minimum (or null if pending).
 * Uses `resolveF2Price` so an overridden MRP is checked through the margin it implies.
 */
export function applyFilter2Rules(f2 = {}, ctx = {}) {
  const floor = ctx.floor;
  const divisionLabel = String(ctx.divisionLabel || "").trim() || "division";
  const priced = resolveF2Price(f2);
  const typedMargin =
    f2.netMarginAtScale != null && String(f2.netMarginAtScale).trim() !== ""
      ? Number(f2.netMarginAtScale)
      : null;
  const effectiveMargin =
    priced.ok && Number.isFinite(Number(priced.effectiveMargin))
      ? Number(priced.effectiveMargin)
      : typedMargin;
  const hasMargin = effectiveMargin != null && Number.isFinite(effectiveMargin);
  const marginOk = hasMargin && floor != null && effectiveMargin >= floor;
  const markedDown =
    hasMargin && floor != null && Number.isFinite(effectiveMargin) && effectiveMargin < floor && !ctx.divisionPending;

  let marginItem;
  if (floor == null && ctx.divisionPending) {
    marginItem = row({
      status: "pending",
      text: "Pending: division not determined",
      slot: "margin",
      code: F2_ITEM_CODES.F2_MARGIN_DIVISION_PENDING,
      level: "none",
      credit: 0,
      reasons: ["DIVISION_PENDING"],
    });
  } else if (!hasMargin) {
    marginItem = row({
      status: "pending",
      text: "Net margin at scale not yet entered",
      slot: "margin",
      code: F2_ITEM_CODES.F2_MARGIN_MISSING,
      level: "none",
      credit: 0,
      reasons: ["NOT_ENTERED"],
    });
  } else if (floor == null) {
    marginItem = row({
      status: "pending",
      text: "Division has no numeric floor on record — Forum judgment",
      slot: "margin",
      code: F2_ITEM_CODES.F2_MARGIN_MISSING,
      level: "none",
      credit: 0,
      reasons: ["NO_FLOOR"],
    });
  } else if (marginOk) {
    const via =
      priced.ok && priced.driver === "mrp"
        ? ` (implied by your MRP of ₹${priced.mrp})`
        : "";
    marginItem = row({
      status: "done",
      text: `Net margin ${effectiveMargin}% clears the ${floor}% ${divisionLabel} minimum${via}`,
      slot: "margin",
      code: F2_ITEM_CODES.F2_MARGIN_CLEARS,
      level: "strong",
      credit: 1,
      reasons: ["CLEARS_MINIMUM"],
    });
  } else {
    const via =
      priced.ok && priced.driver === "mrp"
        ? ` Your MRP of ₹${priced.mrp} implies ${effectiveMargin}%.`
        : "";
    marginItem = row({
      status: "pending",
      text: `Net margin ${effectiveMargin}% is below the ${floor}% minimum for ${divisionLabel}.${via} Raise the net margin, lower COGS, or revisit the MRP.`,
      slot: "margin",
      code: F2_ITEM_CODES.F2_MARGIN_BELOW_MINIMUM,
      level: "none",
      credit: 0,
      reasons: ["BELOW_MINIMUM"],
    });
  }

  const financeItem = row({
    status: f2.financeSigned ? "done" : "pending",
    text: financeSignatureCopy(f2.financeSigned),
    slot: "finance",
    code: "F2_FINANCE_SIGN",
    level: f2.financeSigned ? "strong" : "none",
    credit: 0,
    reasons: [],
    formAdmin: true,
  });

  const items = [marginItem, financeItem];
  let checkLabel = "Evidence missing";
  if (markedDown) checkLabel = "Marked down";
  else if (marginOk) checkLabel = "Cleared";
  else if (ctx.divisionPending) checkLabel = "Evidence missing";
  else if (!hasMargin) checkLabel = "Evidence missing";
  else if (marginItem.status === "done") checkLabel = "Cleared";

  return { checkLabel, items, markedDown: Boolean(markedDown) };
}

/** Sync check used by browser preview and tests (floor must be supplied). */
export function checkF2Sync(f2 = {}, ctx = {}) {
  return applyFilter2Rules(f2, ctx);
}
