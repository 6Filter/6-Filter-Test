/**
 * Part 138 D52/D53 — Filter 2 has THREE scored checks: net margin vs division minimum,
 * pack size (number + unit) and GST rate. Margin below minimum is a mark-down (never "Below floor",
 * never a hard stop). COGS, MRP and Quick-commerce notes never change the score.
 */
import { SCORE_CHECK_SLOTS_TOTAL } from "./lockedConstants.js";
import { resolveF2Price } from "./mrpFormula.js";
import { parsePackSize } from "./packSize.js";

function financeSignatureCopy(signed) {
  return signed
    ? "Finance has confirmed the margin computation"
    : "The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence; unconfirmed figures are treated as a gap";
}

export const F2_SLOTS = Object.freeze(["margin", "packSize", "gst"]);

export const F2_ITEM_CODES = Object.freeze({
  F2_MARGIN_CLEARS: "F2_MARGIN_CLEARS",
  F2_MARGIN_BELOW_MINIMUM: "F2_MARGIN_BELOW_MINIMUM",
  /** @deprecated Use F2_MARGIN_BELOW_MINIMUM — kept so old sealed snapshots still resolve copy. */
  F2_MARGIN_BELOW_FLOOR: "F2_MARGIN_BELOW_MINIMUM",
  F2_MARGIN_MISSING: "F2_MARGIN_MISSING",
  F2_MARGIN_DIVISION_PENDING: "F2_MARGIN_DIVISION_PENDING",
  F2_DIVISION_PENDING: "F2_MARGIN_DIVISION_PENDING",
  F2_PACK_SIZE_CLEARS: "F2_PACK_SIZE_CLEARS",
  F2_PACK_SIZE_MISSING: "F2_PACK_SIZE_MISSING",
  F2_PACK_SIZE_NEEDS_UNIT: "F2_PACK_SIZE_NEEDS_UNIT",
  F2_GST_CLEARS: "F2_GST_CLEARS",
  F2_GST_MISSING: "F2_GST_MISSING",
  F2_GST_CONTRADICTED: "F2_GST_CONTRADICTED",
});

/** Part 138 D53 — stored web assessment of the GST rate; contradicted marks the check down. */
function gstAssessmentOf(ctx = {}) {
  return (
    ctx.gstAssessment ||
    ctx.findings?.f2?.assessments?.gst ||
    ctx.findings?.assessments?.gst ||
    null
  );
}

function gstContradicted(assessment) {
  if (!assessment || typeof assessment !== "object") return false;
  const raw = assessment.raw && typeof assessment.raw === "object" ? assessment.raw : assessment;
  const verdict = String(assessment.verdict || raw.verdict || "").toLowerCase();
  const reasons = [...(assessment.reasons || []), ...(raw.reasons || [])];
  return (
    assessment.contradicted === true ||
    raw.contradicted === true ||
    verdict === "contradicted" ||
    reasons.includes("CONTRADICTED")
  );
}

function gainPct(credit) {
  const c = Number(credit);
  const remaining = Number.isFinite(c) ? Math.max(0, 1 - c) : 1;
  return Math.round((remaining * 100) / SCORE_CHECK_SLOTS_TOTAL);
}

/** Part 141 — finding (reason / source_url / quote) from a stored assessment, or {} when absent. */
function findingOf(assessment) {
  if (!assessment || typeof assessment !== "object") return {};
  const raw = assessment.raw && typeof assessment.raw === "object" ? assessment.raw : assessment;
  const out = {};
  const reason = String(raw.reason ?? "").trim();
  const sourceUrl = String(raw.source_url ?? raw.sourceUrl ?? "").trim();
  const quote = String(raw.quote ?? "").trim();
  if (reason) out.reason = reason;
  if (sourceUrl) {
    out.source_url = sourceUrl;
    out.sources = [sourceUrl];
  }
  if (quote) out.quote = quote;
  return out;
}

function row({ status, text, slot, code, level, credit, reasons, formAdmin, finding }) {
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
  if (finding) Object.assign(out, finding);
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

  // —— pack size (Part 138 D52): a number AND a unit ——
  const packRaw = String(f2.grammage ?? "").trim();
  const packParsed = parsePackSize(packRaw);
  let packItem;
  let packMarkedDown = false;
  if (!packRaw) {
    packItem = row({
      status: "pending",
      text: "Pack size not entered — enter a grammage with a unit, e.g. 100 g or 100 ml",
      slot: "packSize",
      code: F2_ITEM_CODES.F2_PACK_SIZE_MISSING,
      level: "none",
      credit: 0,
      reasons: ["NOT_ENTERED"],
    });
  } else if (!packParsed.ok) {
    packMarkedDown = true;
    packItem = row({
      status: "pending",
      text: `Pack size is marked down — "${packRaw}" needs a number and a unit (g, kg, ml or L)`,
      slot: "packSize",
      code: F2_ITEM_CODES.F2_PACK_SIZE_NEEDS_UNIT,
      level: "none",
      credit: 0,
      reasons: ["NEEDS_UNIT", "MARKED_DOWN"],
    });
  } else {
    packItem = row({
      status: "done",
      text: `Pack size ${packParsed.display} entered with a unit`,
      slot: "packSize",
      code: F2_ITEM_CODES.F2_PACK_SIZE_CLEARS,
      level: "strong",
      credit: 1,
      reasons: [],
    });
  }

  // —— GST (Part 138 D53): blank cannot be priced; web assessment may mark down later ——
  const gstRaw = f2.gstRatePct;
  const gstEntered = gstRaw != null && String(gstRaw).trim() !== "";
  const gstNum = gstEntered ? Number(gstRaw) : null;
  const gstNumeric = gstEntered && Number.isFinite(gstNum) && gstNum >= 0;
  let gstItem;
  let gstMarkedDown = false;
  if (!gstEntered) {
    gstItem = row({
      status: "pending",
      text: "GST rate not entered — without it the MRP cannot be priced",
      slot: "gst",
      code: F2_ITEM_CODES.F2_GST_MISSING,
      level: "none",
      credit: 0,
      reasons: ["NOT_ENTERED"],
    });
  } else if (!gstNumeric) {
    gstItem = row({
      status: "pending",
      text: `GST rate "${String(gstRaw).trim()}" is not a valid percentage — enter a number such as 18`,
      slot: "gst",
      code: F2_ITEM_CODES.F2_GST_MISSING,
      level: "none",
      credit: 0,
      reasons: ["NOT_NUMERIC"],
    });
  } else if (gstContradicted(gstAssessmentOf(ctx))) {
    gstMarkedDown = true;
    gstItem = row({
      status: "pending",
      text: `GST rate ${gstNum}% is marked down — the web check contradicts it for this category`,
      slot: "gst",
      code: F2_ITEM_CODES.F2_GST_CONTRADICTED,
      level: "none",
      credit: 0,
      reasons: ["CONTRADICTED", "MARKED_DOWN"],
      finding: findingOf(gstAssessmentOf(ctx)),
    });
  } else {
    gstItem = row({
      status: "done",
      text: `GST rate ${gstNum}% entered`,
      slot: "gst",
      code: F2_ITEM_CODES.F2_GST_CLEARS,
      level: "strong",
      credit: 1,
      reasons: [],
      finding: findingOf(gstAssessmentOf(ctx)),
    });
  }

  const items = [marginItem, packItem, gstItem, financeItem];
  const anyMarkedDown = Boolean(markedDown) || packMarkedDown || gstMarkedDown;
  const allAnalyticalDone =
    marginItem.status === "done" && packItem.status === "done" && gstItem.status === "done";
  let checkLabel = "Evidence missing";
  if (anyMarkedDown) checkLabel = "Marked down";
  else if (allAnalyticalDone) checkLabel = "Cleared";

  return { checkLabel, items, markedDown: anyMarkedDown };
}

/** Sync check used by browser preview and tests (floor must be supplied). */
export function checkF2Sync(f2 = {}, ctx = {}) {
  return applyFilter2Rules(f2, ctx);
}
