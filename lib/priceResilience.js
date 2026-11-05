/**
 * Part 135 — Filter 3 price resilience (10% volume-loss cliff rule).
 * Browser-safe: no I/O, no LLM. Pure functions only.
 *
 * Smooth inflation-covering increases cost no volume. Crossing a fixed price
 * point (₹1, 2, 5, 10, …) is the risk — comparable packs' verified volume loss
 * at that point must stay at or under VOLUME_LOSS_CEILING_PCT.
 */
import {
  F3_HORIZON_YEARS,
  F3_LOSS_STATISTIC,
  FIXED_PRICE_POINTS,
  SCORE_CHECK_SLOTS_TOTAL,
  VOLUME_LOSS_CEILING_PCT,
} from "./lockedConstants.js";
import { RELEVANCE_CREDIT } from "./relevanceGrade.js";

export { FIXED_PRICE_POINTS };

export const F3_SLOTS = Object.freeze(["resilience"]);

export const F3_ITEM_CODES = Object.freeze({
  F3_RESILIENCE_PASS: "F3_RESILIENCE_PASS",
  F3_RESILIENCE_PASS_ADEQUATE: "F3_RESILIENCE_PASS_ADEQUATE",
  F3_RESILIENCE_PASS_WEAK: "F3_RESILIENCE_PASS_WEAK",
  F3_RESILIENCE_FAIL: "F3_RESILIENCE_FAIL",
  F3_RESILIENCE_CANNOT_ASSESS: "F3_RESILIENCE_CANNOT_ASSESS",
});

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function gainPct(credit) {
  const c = Number(credit);
  const remaining = Number.isFinite(c) ? Math.max(0, 1 - c) : 1;
  return Math.round((remaining * 100) / SCORE_CHECK_SLOTS_TOTAL);
}

function median(nums) {
  const sorted = [...nums].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Recompute the single fixed point left by a from→to move.
 * null if none or several (model-claimed crossed_point is ignored elsewhere).
 */
export function crossedPointFromPrices(fromPrice, toPrice) {
  const from = asNum(fromPrice);
  const to = asNum(toPrice);
  if (from == null || to == null) return null;
  const crossed = FIXED_PRICE_POINTS.filter((p) => from <= p && to > p);
  return crossed.length === 1 ? crossed[0] : null;
}

/** Quote must contain the volume-change figure (digits of the number). */
export function quoteContainsFigure(quote, figure) {
  const q = String(quote || "");
  if (!q.trim()) return false;
  const n = asNum(figure);
  if (n == null) return false;
  const abs = Math.abs(n);
  const variants = new Set([
    String(n),
    String(abs),
    abs.toFixed(0),
    abs.toFixed(1),
    abs.toFixed(2),
    String(Math.round(abs)),
  ]);
  // Also allow "8 percent" / "8%" style without forcing a match on sign.
  const normalized = q.replace(/,/g, "");
  for (const v of variants) {
    if (!v || v === "NaN") continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^0-9.])${escaped}(?:[^0-9.]|$)`).test(normalized)) return true;
  }
  return false;
}

/**
 * Raise price each year by the inflation-covering increase; list fixed points crossed.
 * A point is crossed in the first year the price exceeds it, having been at or below it before.
 * A pack priced exactly ON a point is exposed at its first increase.
 */
export function priceCrossings({ launchPrice, annualIncreasePct, horizonYears } = {}) {
  const price = asNum(launchPrice);
  const rise = asNum(annualIncreasePct);
  const years = asNum(horizonYears) ?? F3_HORIZON_YEARS;
  if (price == null || price <= 0) return { ok: false, reason: "NEEDS_PRICE" };
  if (rise == null || rise < 0) return { ok: false, reason: "NEEDS_INFLATION_COVER" };
  if (rise === 0 || years <= 0) {
    return { ok: true, crossings: [], path: [{ year: 0, price }] };
  }

  const lastPoint = FIXED_PRICE_POINTS[FIXED_PRICE_POINTS.length - 1];
  const crossings = [];
  const path = [{ year: 0, price }];
  let current = price;
  const remaining = new Set(FIXED_PRICE_POINTS.filter((p) => current <= p));

  for (let year = 1; year <= years; year += 1) {
    const prev = current;
    current = Math.round(current * (1 + rise / 100) * 100) / 100;
    path.push({ year, price: current });
    for (const point of [...remaining]) {
      if (prev <= point && current > point) {
        crossings.push({ point, year, fromPrice: prev, toPrice: current });
        remaining.delete(point);
      }
    }
    if (current > lastPoint && remaining.size === 0) break;
  }

  return { ok: true, crossings, path };
}

/**
 * Volume lost when comparable products crossed `point`.
 * Only VERIFIED events count. Loss = max(0, −volume_change_pct).
 * Same-point events beat analogous events at other points.
 */
export function cliffLossFromEvents(events = [], point, { statistic = F3_LOSS_STATISTIC } = {}) {
  const target = asNum(point);
  if (target == null) {
    return { ok: false, reason: "NEEDS_POINT", evidenceLevel: "none", lossPct: null, n: 0 };
  }

  const list = Array.isArray(events) ? events : [];
  const verified = list.filter((e) => e && e.verified === true);
  const samePoint = verified.filter((e) => asNum(e.crossed_point) === target);
  const analogous = verified.filter((e) => {
    const cp = asNum(e.crossed_point);
    return cp != null && cp !== target;
  });

  function lossesOf(pool) {
    return pool
      .map((e) => {
        const change = asNum(e.volume_change_pct);
        if (change == null) return null;
        return Math.max(0, -change);
      })
      .filter((n) => n != null);
  }

  let pool = samePoint;
  let analogousOnly = false;
  if (!pool.length) {
    pool = analogous;
    analogousOnly = true;
  }
  const losses = lossesOf(pool);
  if (!losses.length) {
    return {
      ok: false,
      reason: `NO_EVIDENCE_FOR_POINT_${target}`,
      evidenceLevel: "none",
      lossPct: null,
      n: 0,
      samePointCount: samePoint.length,
      analogousCount: analogous.length,
    };
  }

  let evidenceLevel;
  if (!analogousOnly) {
    if (samePoint.length >= 3) evidenceLevel = "strong";
    else if (samePoint.length === 2) evidenceLevel = "adequate";
    else evidenceLevel = "weak";
  } else {
    evidenceLevel = analogous.length >= 3 ? "adequate" : "weak";
  }

  const lossPct =
    String(statistic || F3_LOSS_STATISTIC) === "worst"
      ? Math.max(...losses)
      : median(losses);
  const worstPct = Math.max(...losses);
  const medianPct = median(losses);

  return {
    ok: true,
    evidenceLevel,
    lossPct,
    medianPct,
    worstPct,
    n: losses.length,
    samePointCount: samePoint.length,
    analogousCount: analogous.length,
    analogousOnly,
  };
}

/**
 * @returns {{ status: "pass"|"fail"|"cannot-assess", level, credit, reasons, crossings, worstPoint?, modelledLossPct? }}
 */
export function evaluatePriceResilience({
  launchPrice,
  annualIncreasePct,
  horizonYears = F3_HORIZON_YEARS,
  events = [],
  lossStatistic = F3_LOSS_STATISTIC,
} = {}) {
  const crossed = priceCrossings({ launchPrice, annualIncreasePct, horizonYears });
  if (!crossed.ok) {
    return {
      status: "cannot-assess",
      level: "none",
      credit: 0,
      reasons: [crossed.reason],
      crossings: [],
    };
  }

  if (!crossed.crossings.length) {
    return {
      status: "pass",
      level: "strong",
      credit: RELEVANCE_CREDIT.strong,
      reasons: ["NO_CROSSING"],
      crossings: [],
      path: crossed.path,
    };
  }

  const detail = [];
  let sawFail = false;
  let sawCannot = false;
  let worstFail = null;
  let worstLevel = "strong";
  const reasons = [];

  for (const c of crossed.crossings) {
    const loss = cliffLossFromEvents(events, c.point, { statistic: lossStatistic });
    const row = { ...c, ...loss };
    detail.push(row);
    if (!loss.ok) {
      sawCannot = true;
      reasons.push(loss.reason || `NO_EVIDENCE_FOR_POINT_${c.point}`);
      continue;
    }
    const levelRank = { none: 0, weak: 1, adequate: 2, strong: 3 };
    if ((levelRank[loss.evidenceLevel] ?? 0) < (levelRank[worstLevel] ?? 0)) {
      worstLevel = loss.evidenceLevel;
    }
    if (loss.lossPct > VOLUME_LOSS_CEILING_PCT + 1e-9) {
      sawFail = true;
      if (!worstFail || loss.lossPct > worstFail.lossPct) {
        worstFail = { point: c.point, year: c.year, lossPct: loss.lossPct, level: loss.evidenceLevel };
      }
    }
  }

  // Fail beats cannot-assess.
  if (sawFail) {
    reasons.unshift(`VOLUME_LOSS_ABOVE_CEILING_AT_${worstFail.point}`);
    return {
      status: "fail",
      level: "none",
      credit: 0,
      reasons,
      crossings: detail,
      path: crossed.path,
      worstPoint: worstFail.point,
      modelledLossPct: worstFail.lossPct,
    };
  }

  if (sawCannot) {
    return {
      status: "cannot-assess",
      level: "none",
      credit: 0,
      reasons: reasons.length ? reasons : ["NO_EVIDENCE"],
      crossings: detail,
      path: crossed.path,
    };
  }

  const credit = RELEVANCE_CREDIT[worstLevel] ?? 0;
  return {
    status: "pass",
    level: worstLevel,
    credit,
    reasons: ["WITHIN_CEILING"],
    crossings: detail,
    path: crossed.path,
  };
}

function row({ status, text, slot, code, level, credit, reasons, crossings, formAdmin }) {
  const out = {
    status,
    text,
    slot: slot || "resilience",
    code,
    level: level || "none",
    credit: Number.isFinite(Number(credit)) ? Number(credit) : 0,
    reasons: Array.isArray(reasons) ? reasons : [],
    gainPct: gainPct(credit),
  };
  if (Array.isArray(crossings)) out.crossings = crossings;
  if (formAdmin) out.formAdmin = true;
  return out;
}

function passCode(level) {
  if (level === "adequate") return F3_ITEM_CODES.F3_RESILIENCE_PASS_ADEQUATE;
  if (level === "weak") return F3_ITEM_CODES.F3_RESILIENCE_PASS_WEAK;
  return F3_ITEM_CODES.F3_RESILIENCE_PASS;
}

function plainVerdict(evalResult) {
  const crossings = evalResult.crossings || [];
  if (evalResult.status === "pass" && evalResult.reasons?.includes("NO_CROSSING")) {
    return "Raising the price smoothly to cover inflation costs no volume — no fixed price point is crossed in the planning horizon.";
  }
  if (evalResult.status === "pass") {
    const bits = crossings
      .filter((c) => c.ok)
      .map(
        (c) =>
          `Crossing ₹${c.point} in year ${c.year}: comparable packs lost about ${Number(c.lossPct).toFixed(1)}% (limit ${VOLUME_LOSS_CEILING_PCT}%)`
      );
    return bits.length
      ? `Raising the price smoothly to cover inflation costs no volume. ${bits.join(". ")}.`
      : "Price resilience clears the 10% volume-loss cliff test.";
  }
  if (evalResult.status === "fail") {
    return `Crossing ₹${evalResult.worstPoint} models about ${Number(evalResult.modelledLossPct).toFixed(1)}% volume loss — above the ${VOLUME_LOSS_CEILING_PCT}% limit.`;
  }
  const missing = (evalResult.reasons || []).find((r) => String(r).startsWith("NO_EVIDENCE_FOR_POINT_"));
  if (missing) {
    const point = String(missing).replace("NO_EVIDENCE_FOR_POINT_", "");
    return `Cannot assess: no verified volume evidence when comparable packs crossed ₹${point}.`;
  }
  if (evalResult.reasons?.includes("NEEDS_INFLATION_COVER")) {
    return "Cannot assess: the inflation-covering annual increase is missing or not cited.";
  }
  if (evalResult.reasons?.includes("NEEDS_PRICE")) {
    return "Cannot assess: Filter 2 MRP is not available to test.";
  }
  if (evalResult.reasons?.includes("NOT_RESEARCHED")) {
    return "Price resilience is assessed when you Submit.";
  }
  return "Price resilience cannot be assessed yet.";
}

/**
 * Pure Filter 3 rules. `price` is Filter 2 MRP from resolveF2Price.
 * `priceEvents` is researchFindings.f3.priceEvents (or null if not researched).
 * Preview callers pass `{ preview: true }` so the browser never invents a verdict.
 */
export function applyFilter3Rules({ price, priceEvents, preview = false } = {}) {
  const mrp = asNum(price);

  if (preview) {
    return {
      checkLabel: mrp != null && mrp > 0 ? "Evidence missing" : "Not yet run",
      markedDown: false,
      capsGo: false,
      items:
        mrp != null && mrp > 0
          ? [
              row({
                status: "pending",
                text: "Price resilience — assessed when you Submit",
                code: F3_ITEM_CODES.F3_RESILIENCE_CANNOT_ASSESS,
                level: "none",
                credit: 0,
                reasons: ["NOT_RESEARCHED"],
              }),
            ]
          : [],
    };
  }

  if (mrp == null || mrp <= 0) {
    return {
      checkLabel: "Not yet run",
      markedDown: false,
      capsGo: false,
      items: [],
    };
  }

  if (!priceEvents || typeof priceEvents !== "object") {
    return {
      checkLabel: "Marked down",
      markedDown: true,
      capsGo: true,
      items: [
        row({
          status: "pending",
          text: plainVerdict({ status: "cannot-assess", reasons: ["NOT_RESEARCHED"] }),
          code: F3_ITEM_CODES.F3_RESILIENCE_CANNOT_ASSESS,
          level: "none",
          credit: 0,
          reasons: ["NOT_RESEARCHED"],
        }),
      ],
    };
  }

  const annual = asNum(priceEvents.annualIncreasePct);
  const evaluated = evaluatePriceResilience({
    launchPrice: mrp,
    annualIncreasePct: annual,
    horizonYears: F3_HORIZON_YEARS,
    events: priceEvents.events || [],
    lossStatistic: F3_LOSS_STATISTIC,
  });

  if (evaluated.status === "pass") {
    const weak = evaluated.level === "weak";
    const adequate = evaluated.level === "adequate";
    return {
      checkLabel: "Cleared",
      markedDown: false,
      // D24 / D35 — weak evidence caps GO at WATCH; adequate does not.
      capsGo: weak,
      items: [
        row({
          status: "done",
          text: plainVerdict(evaluated),
          code: passCode(evaluated.level),
          level: evaluated.level,
          credit: evaluated.credit,
          reasons: evaluated.reasons,
          crossings: evaluated.crossings,
        }),
      ],
      evaluation: evaluated,
      weakPass: weak,
      adequatePass: adequate,
    };
  }

  const fail = evaluated.status === "fail";
  return {
    checkLabel: "Marked down",
    markedDown: true,
    capsGo: true,
    items: [
      row({
        status: "pending",
        text: plainVerdict(evaluated),
        code: fail ? F3_ITEM_CODES.F3_RESILIENCE_FAIL : F3_ITEM_CODES.F3_RESILIENCE_CANNOT_ASSESS,
        level: "none",
        credit: 0,
        reasons: evaluated.reasons,
        crossings: evaluated.crossings,
      }),
    ],
    evaluation: evaluated,
  };
}
