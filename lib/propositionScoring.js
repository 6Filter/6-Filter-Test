/**
 * Server-only. Do not import this module from anything under src/ —
 * Vite would ship the floors and the arithmetic to every browser.
 */
import { DIVISION_NET_MARGIN, REVENUE_TARGET_BY_DIVISION } from "./npdMaster.js";

function numOrNull(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

function item(status, text) {
  return { status, text };
} // status: "done" | "pending"

function checkF1(f1 = {}) {
  if (f1.pureCommodity) {
    return {
      checkLabel: "Exempt",
      items: [item("done", "Pure commodity — differentiation floor doesn't apply (v4)")],
    };
  }
  const items = [
    item(f1.declaredAttribute ? "done" : "pending", f1.declaredAttribute ? "Attribute declared" : "Attribute not yet declared"),
    item(f1.attributeRank ? "done" : "pending", f1.attributeRank ? `Attribute rank ${f1.attributeRank}` : "Attribute rank pending — CMI category hierarchy"),
    item(f1.benchmark ? "done" : "pending", f1.benchmark ? `Benchmark named: ${f1.benchmark}` : "Benchmark not named"),
    item(gapItemStatus(f1.declaredGap), gapItemText(f1.declaredGap)),
    item(
      f1.growthRoute && f1.growthArgument ? "done" : "pending",
      f1.growthRoute && f1.growthArgument ? "Growth route and argument recorded" : "Growth route or growth argument incomplete"
    ),
  ];
  return { checkLabel: overallLabel(items), items };
}

function gapItemStatus(gap) {
  const n = Number(gap);
  if (gap == null || gap === "") return "pending";
  return Number.isFinite(n) && n >= 2.0 ? "done" : "pending";
}

function gapItemText(gap) {
  const n = Number(gap);
  if (gap == null || gap === "") return "Declared gap missing";
  if (!Number.isFinite(n)) return "Declared gap missing";
  return n >= 2.0 ? `Declared gap ${n} clears the 2.0 floor` : `Declared gap ${n} is below the 2.0 floor (v4)`;
}

function checkF2(f2 = {}, division) {
  if (!division) {
    return {
      checkLabel: "Evidence missing",
      items: [
        item(
          "pending",
          "Division could not be determined automatically — the idea doesn't clearly match any of CavinKare's divisions."
        ),
        item(f2.mrpGrammage ? "done" : "pending", f2.mrpGrammage ? "MRP & grammage declared" : "MRP & grammage not declared"),
        item(
          f2.netMarginAtScale != null && f2.netMarginAtScale !== "" ? "done" : "pending",
          f2.netMarginAtScale != null && f2.netMarginAtScale !== ""
            ? `Net margin ${Number(f2.netMarginAtScale)}% recorded — no division floor to screen against`
            : "Net margin at scale not yet computed"
        ),
        item(f2.qcomTrajectory ? "done" : "pending", f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)"),
        item(f2.financeSigned ? "done" : "pending", f2.financeSigned ? "Finance signature recorded" : "Finance signature pending — missing evidence counts as FAIL (v4)"),
      ],
    };
  }

  const floor = DIVISION_NET_MARGIN[division];
  const margin = Number(f2.netMarginAtScale);
  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const marginOk = hasMargin && floor != null && Number.isFinite(margin) && margin >= floor;
  let marginText;
  if (!hasMargin) {
    marginText = "Net margin at scale not yet computed";
  } else if (floor == null) {
    marginText = "Division has no numeric floor on record — Forum judgment";
  } else if (marginOk) {
    marginText = `Net margin ${margin}% clears the ${floor}% floor`;
  } else {
    marginText = `Net margin ${margin}% is below the ${floor}% floor (v4, non-negotiable)`;
  }
  const items = [
    item(f2.mrpGrammage ? "done" : "pending", f2.mrpGrammage ? "MRP & grammage declared" : "MRP & grammage not declared"),
    item(marginOk ? "done" : "pending", marginText),
    item(f2.qcomTrajectory ? "done" : "pending", f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)"),
    item(f2.financeSigned ? "done" : "pending", f2.financeSigned ? "Finance signature recorded" : "Finance signature pending — missing evidence counts as FAIL (v4)"),
  ];
  return { checkLabel: overallLabel(items), items };
}

function checkF3(f2 = {}, f3 = {}) {
  const exposure = f3.fixedPricePointExposure;
  const noExposure = !exposure || exposure === "none";
  const loss = Number(f3.modelledVolumeLoss);
  const lossOk = noExposure || (f3.modelledVolumeLoss != null && f3.modelledVolumeLoss !== "" && loss <= 10);
  const items = [
    item(f3.priceIndexVsBenchmark ? "done" : "pending", f3.priceIndexVsBenchmark ? "Price index vs benchmark recorded" : "Price index vs benchmark missing"),
    noExposure
      ? item("done", "No fixed price point is crossed — the 10% loss cap is not triggered (v4)")
      : item(
          lossOk ? "done" : "pending",
          f3.modelledVolumeLoss == null || f3.modelledVolumeLoss === ""
            ? "Modelled volume loss not yet entered"
            : lossOk
              ? `Modelled loss ${loss}% clears the 10% cap`
              : `Modelled loss ${loss}% exceeds the 10% cap (v4)`
        ),
    item(
      f3.elasticityEstimate && f3.elasticitySource ? "done" : "pending",
      f3.elasticityEstimate && f3.elasticitySource ? "Elasticity estimate and source recorded" : "Elasticity estimate or its source missing"
    ),
    item(priceConsistencyOk(f2, f3) ? "done" : "pending", priceConsistencyOk(f2, f3) ? "Price consistent with Filter 2" : "Price consistency with Filter 2 unconfirmed"),
  ];
  return { checkLabel: overallLabel(items), items };
}

function priceConsistencyOk(f2, f3) {
  // Deliberately soft — see Part 15's note on why these two fields aren't the same shape.
  return Boolean(f2.mrpGrammage && f3.priceIndexVsBenchmark);
}

function checkF4(f4 = {}) {
  const items = [
    item(f4.formatTrajectory ? "done" : "pending", f4.formatTrajectory ? `Format trajectory: ${f4.formatTrajectory}` : "Format trajectory pending — retail-audit format shares (CMI)"),
    item(f4.threatRegister ? "done" : "pending", f4.threatRegister ? "Threat register recorded" : "Threat register empty — substitutes, technology, clean-label, regulatory"),
    item(f4.threatsAnswered ? "done" : "pending", f4.threatsAnswered ? "Threat responses complete" : "Threat responses incomplete — missing evidence counts as FAIL (v4)"),
  ];
  const label = f4.formatTrajectory === "declining" ? "Below floor" : overallLabel(items);
  return { checkLabel: label, items };
}

function checkF5(f5 = {}, division) {
  if (!division) {
    return {
      checkLabel: "Evidence missing",
      items: [
        item(
          "pending",
          "Division could not be determined automatically — the idea doesn't clearly match any of CavinKare's divisions."
        ),
        item(
          "pending",
          "No division revenue target until a division is matched"
        ),
        item(f5.cmiHeadSigned ? "done" : "pending", f5.cmiHeadSigned ? "CMI signature recorded" : "CMI signature pending on the sizing model — out-of-range factors must be argued in writing"),
      ],
    };
  }

  const revenue = computeF5Revenue(f5);
  const target = REVENUE_TARGET_BY_DIVISION[division]?.allChannels;
  const sizingDone = revenue != null;
  const items = [
    item(
      sizingDone ? "done" : "pending",
      sizingDone
        ? (target != null ? `Year-3 revenue ₹${revenue.toFixed(1)} Cr vs ₹${target} Cr target` : `Year-3 revenue ₹${revenue.toFixed(1)} Cr computed`)
        : "Sizing incomplete — needs households, trial, repeat, frequency and pack value (CMI model)"
    ),
    item(f5.cmiHeadSigned ? "done" : "pending", f5.cmiHeadSigned ? "CMI signature recorded" : "CMI signature pending on the sizing model — out-of-range factors must be argued in writing"),
  ];
  return { checkLabel: overallLabel(items), items };
}

function checkF6(f6 = {}, unlocked) {
  if (!unlocked) {
    return {
      checkLabel: "Awaiting panels",
      infoLine:
        "Awaiting prototype panels — Filter 6 is not part of the paper check; it is read when the lab, consumer and pack results exist (v4)",
      items: [],
    };
  }
  const lab = Number(f6.labGapVsBenchmark);
  const beaters = Number(f6.consumerPanelBeaters);
  const pack = Number(f6.packStandoutGap);
  const items = [
    item(
      f6.labGapVsBenchmark != null && f6.labGapVsBenchmark !== "" && lab >= 2.0 ? "done" : "pending",
      f6.labGapVsBenchmark != null && f6.labGapVsBenchmark !== ""
        ? `Lab gap ${lab} vs 2.0 floor`
        : "Lab gap not yet entered"
    ),
    item(
      f6.consumerPanelBeaters != null && f6.consumerPanelBeaters !== "" && beaters >= 18
        ? "done"
        : "pending",
      f6.consumerPanelBeaters != null && f6.consumerPanelBeaters !== ""
        ? `${beaters} of 30 vs the 18 gate`
        : "Consumer panel result not yet entered"
    ),
    item(
      f6.packStandoutGap != null && f6.packStandoutGap !== "" && pack >= 2.0 ? "done" : "pending",
      f6.packStandoutGap != null && f6.packStandoutGap !== ""
        ? `Pack standout ${pack} vs 2.0 floor`
        : "Pack standout not yet entered"
    ),
  ];
  return { checkLabel: overallLabel(items), items };
}

function overallLabel(items) {
  if (items.length === 0) return "Evidence missing";
  if (items.every((i) => i.status === "done")) return "Cleared";
  if (items.some((i) => i.status === "done")) return "Evidence missing";
  return "Evidence missing";
}

export function computeAllAdvisoryChecks(proposition) {
  const { division, f1 = {}, f2 = {}, f3 = {}, f4 = {}, f5 = {}, f6 = {} } = proposition || {};
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every((k) => (proposition || {})[k]?.forumVerdict === "pass");
  return {
    f1: checkF1(f1),
    f2: checkF2(f2, division),
    f3: checkF3(f2, f3),
    f4: checkF4(f4),
    f5: checkF5(f5, division),
    f6: checkF6(f6, stage1Cleared),
  };
}

export function computeF5Revenue(f5 = {}) {
  const households = numOrNull(f5.householdsReachedY3Mn);
  const trial = numOrNull(f5.trialRatePct);
  const repeat = numOrNull(f5.repeatConversionPct);
  const freq = numOrNull(f5.purchaseFrequencyYr);
  const pack = numOrNull(f5.avgPackValueInr);
  if ([households, trial, repeat, freq, pack].some((v) => v == null)) return null;
  return (households * 1e6 * (trial / 100) * (repeat / 100) * freq * pack) / 1e7; // ₹ Cr
}
