/**
 * Part 134 — three-year same-pack price plan vs Filter 3's volume-loss lift.
 * Browser-safe, no I/O, no LLM.
 */
import { VOLUME_LOSS_CEILING_PCT } from "./lockedConstants.js";
import { parsePackSize, samePackSize } from "./packSize.js";

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function yearRows(plan) {
  if (!Array.isArray(plan)) return [];
  return plan
    .map((row, i) => ({
      year: Number(row?.year) || i + 1,
      mrpInr: asNum(row?.mrpInr),
      priceChangePct: asNum(row?.priceChangePct),
      takeRatePct: asNum(row?.takeRatePct),
      deliveryFeeInr: asNum(row?.deliveryFeeInr),
      grammage: row?.grammage != null ? String(row.grammage).trim() : "",
    }))
    .sort((a, b) => a.year - b.year);
}

/**
 * @param {{ launchMrp: number|string|null, plan: object[], liftPct: number|string|null, grammage?: string }} args
 * @returns {{ status: "pass"|"fail"|"cannot-assess", reasons: string[], worstYear?: number, estimatedVolumeLossPct?: number, years?: object[] }}
 */
export function evaluateThreeYearPrice({ launchMrp, plan, liftPct, grammage } = {}) {
  const launch = asNum(launchMrp);
  const lift = asNum(liftPct);
  const reasons = [];
  if (launch == null || launch <= 0) reasons.push("NEEDS_LAUNCH_MRP");
  if (lift == null || lift <= 0) reasons.push("NEEDS_VOLUME_LOSS_LIFT");

  const rows = yearRows(plan);
  if (!rows.length) {
    reasons.push("NEEDS_PRICE_FOR_YEAR_1");
    return { status: "cannot-assess", reasons: [...new Set(reasons)] };
  }

  const baseGram = String(grammage || "").trim();
  const yearDetails = [];
  let worstYear = null;
  let worstLoss = 0;
  let sawFail = false;

  const hasExplicitYears = rows.some((r) => Number(r.year) >= 1 && Number(r.year) <= 3);
  for (let i = 0; i < 3; i++) {
    const year = i + 1;
    const byYear = rows.find((r) => Number(r.year) === year);
    // Positional fallback only when the plan is a dense 3-row array without gaps.
    const row =
      byYear ||
      (!hasExplicitYears && rows[i]) ||
      (rows.length === 3 && rows.every((r, idx) => Number(r.year) === idx + 1) ? rows[i] : null);
    if (!row) {
      reasons.push(`NEEDS_PRICE_FOR_YEAR_${year}`);
      continue;
    }
    if (row.grammage && baseGram) {
      const parsedRow = parsePackSize(row.grammage);
      const parsedBase = parsePackSize(baseGram);
      if (parsedRow.ok && parsedBase.ok && !samePackSize(row.grammage, baseGram)) {
        reasons.push("PACK_CHANGED");
        return { status: "cannot-assess", reasons: [...new Set(reasons)], years: yearDetails };
      }
    }

    let mrp = row.mrpInr;
    if (mrp == null && row.priceChangePct != null && launch != null) {
      // Compound from launch: year N price = launch × Π(1 + Δ%/100) for years 1..N
      let compounded = launch;
      for (let y = 1; y <= year; y++) {
        const yr = rows.find((r) => r.year === y) || rows[y - 1];
        const pct = asNum(yr?.priceChangePct);
        if (pct == null) {
          compounded = null;
          break;
        }
        compounded = compounded * (1 + pct / 100);
      }
      mrp = compounded;
    }
    if (mrp == null || mrp <= 0) {
      reasons.push(`NEEDS_PRICE_FOR_YEAR_${year}`);
      // A later fail still counts; keep scanning
      continue;
    }

    const risePct = launch != null && launch > 0 ? ((mrp - launch) / launch) * 100 : null;
    const rise = risePct != null && risePct > 0 ? risePct : 0;
    const estimatedVolumeLossPct =
      lift != null && lift > 0 ? (VOLUME_LOSS_CEILING_PCT * rise) / lift : null;
    const fails =
      estimatedVolumeLossPct != null && estimatedVolumeLossPct > VOLUME_LOSS_CEILING_PCT + 1e-9;
    yearDetails.push({
      year,
      mrpInr: mrp,
      risePct: risePct ?? 0,
      estimatedVolumeLossPct,
      fails,
    });
    if (fails) {
      sawFail = true;
      if (estimatedVolumeLossPct > worstLoss) {
        worstLoss = estimatedVolumeLossPct;
        worstYear = year;
      }
    }
  }

  if (sawFail && launch != null && lift != null) {
    return {
      status: "fail",
      reasons: [`WOULD_LOSE_VOLUME_YEAR_${worstYear}`],
      worstYear,
      estimatedVolumeLossPct: worstLoss,
      years: yearDetails,
    };
  }

  const missingPrice = reasons.some((r) => /^NEEDS_PRICE_FOR_YEAR_/.test(r));
  if (reasons.includes("NEEDS_LAUNCH_MRP") || reasons.includes("NEEDS_VOLUME_LOSS_LIFT") || missingPrice) {
    return { status: "cannot-assess", reasons: [...new Set(reasons)], years: yearDetails };
  }

  return { status: "pass", reasons: [], years: yearDetails };
}
