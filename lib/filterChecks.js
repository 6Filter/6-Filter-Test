/**
 * Browser-safe Filter 1/3/4/6 check items. No DB, no Node APIs.
 * Research flags only demote "done" when a finding is explicitly false
 * (research ran and came back empty). Missing flags keep presence-only behaviour.
 */

function item(status, text) {
  return { status, text };
}

export function overallLabel(items, belowFloor = false) {
  if (belowFloor) return "Below floor";
  if (!items.length) return "Evidence missing";
  if (items.every((i) => i.status === "done")) return "Cleared";
  return "Evidence missing";
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

function priceConsistencyOk(f2, f3) {
  return Boolean(f2.mrpInr && f3.priceIndexVsBenchmark);
}

export function checkF1(f1 = {}, findings = {}) {
  if (f1.pureCommodity) {
    return {
      checkLabel: "Exempt",
      items: [item("done", "Pure commodity — differentiation floor doesn't apply (v4)")],
    };
  }
  const attr1 = String(f1.declaredAttribute || "").trim();
  const attrExtras = [f1.declaredAttribute2, f1.declaredAttribute3]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const attrCount = (attr1 ? 1 : 0) + attrExtras.length;
  const attrText = !attr1
    ? "Attribute 1 not yet declared (required)"
    : attrCount > 1
      ? `Attributes declared (${attrCount} of 3)`
      : "Attribute 1 declared";

  const benchmarkDone = Boolean(f1.benchmark) && findings.benchmarkVerified !== false;
  const growthDone =
    Boolean(f1.growthRoute && f1.growthArgument) && findings.categorySizeFound !== false;

  let benchmarkText;
  if (!f1.benchmark) {
    benchmarkText = "Benchmark not named";
  } else if (findings.benchmarkVerified === false) {
    benchmarkText = `Benchmark named but not verified — ${findings.benchmarkEvidence || "no competitive evidence found"}`;
  } else {
    benchmarkText = `Benchmark named: ${f1.benchmark}`;
  }

  let growthText;
  if (!(f1.growthRoute && f1.growthArgument)) {
    growthText = "Growth route or growth argument incomplete";
  } else if (findings.categorySizeFound === false) {
    growthText = "Growth argument entered, but category size could not be substantiated by research";
  } else if (findings.categorySizeFound === true) {
    growthText = "Growth route and argument recorded, backed by researched category size";
  } else {
    growthText = "Growth route and argument recorded";
  }

  const items = [
    item(attr1 ? "done" : "pending", attrText),
    item(benchmarkDone ? "done" : "pending", benchmarkText),
    item(gapItemStatus(f1.declaredGap), gapItemText(f1.declaredGap)),
    item(growthDone ? "done" : "pending", growthText),
  ];
  const gapN = Number(f1.declaredGap);
  const belowFloor =
    f1.declaredGap != null &&
    f1.declaredGap !== "" &&
    Number.isFinite(gapN) &&
    gapN < 2.0;
  return { checkLabel: overallLabel(items, belowFloor), items };
}

export function checkF3(f2 = {}, f3 = {}, findings = {}) {
  const exposure = f3.fixedPricePointExposure;
  const noExposure = !exposure || exposure === "none";
  const loss = Number(f3.modelledVolumeLoss);
  const lossOk = noExposure || (f3.modelledVolumeLoss != null && f3.modelledVolumeLoss !== "" && loss <= 10);

  let priceText;
  if (!f3.priceIndexVsBenchmark) {
    priceText = "Price index vs benchmark missing";
  } else if (findings.priceResearchFound === false) {
    priceText = `Price index entered, but research could not substantiate a benchmark price${
      findings.priceEvidence ? ` — ${findings.priceEvidence}` : ""
    }`;
  } else {
    priceText = "Price index vs benchmark recorded";
  }

  const items = [
    item(
      Boolean(f3.priceIndexVsBenchmark) && findings.priceResearchFound !== false ? "done" : "pending",
      priceText
    ),
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
      f3.elasticityEstimate && f3.elasticitySource
        ? "Elasticity estimate and source recorded"
        : "Elasticity estimate or its source missing"
    ),
    item(
      priceConsistencyOk(f2, f3) ? "done" : "pending",
      priceConsistencyOk(f2, f3) ? "Price consistent with Filter 2" : "Price consistency with Filter 2 unconfirmed"
    ),
  ];
  const belowFloor =
    !noExposure &&
    f3.modelledVolumeLoss != null &&
    f3.modelledVolumeLoss !== "" &&
    Number.isFinite(loss) &&
    loss > 10;
  return { checkLabel: overallLabel(items, belowFloor), items };
}

export function checkF4(f4 = {}, findings = {}) {
  let formatText;
  if (!f4.formatTrajectory) {
    formatText = "Format trajectory pending — retail-audit format shares (CMI)";
  } else if (findings.formatTrajectoryFound === false) {
    formatText = "Format trajectory entered, but research could not substantiate format shares";
  } else {
    formatText = `Format trajectory: ${f4.formatTrajectory}`;
  }

  let threatText;
  if (!f4.threatRegister) {
    threatText = "Threat register empty — substitutes, technology, clean-label, regulatory";
  } else if (findings.threatRegisterFound === false) {
    threatText = `Threat register entered, but research could not substantiate threats${
      findings.threatEvidence ? ` — ${findings.threatEvidence}` : ""
    }`;
  } else {
    threatText = "Threat register recorded";
  }

  let answeredText;
  if (!f4.threatsAnswered) {
    answeredText = "Threat responses incomplete — missing evidence counts as FAIL (v4)";
  } else if (findings.threatRegisterFound === false) {
    answeredText = "Threat responses recorded, but research found no threat register to answer";
  } else {
    answeredText = "Threat responses complete";
  }

  const items = [
    item(
      Boolean(f4.formatTrajectory) && findings.formatTrajectoryFound !== false ? "done" : "pending",
      formatText
    ),
    item(
      Boolean(f4.threatRegister) && findings.threatRegisterFound !== false ? "done" : "pending",
      threatText
    ),
    item(
      Boolean(f4.threatsAnswered) && findings.threatRegisterFound !== false ? "done" : "pending",
      answeredText
    ),
  ];
  const label = f4.formatTrajectory === "declining" ? "Below floor" : overallLabel(items);
  return { checkLabel: label, items };
}

export function checkF6(f6 = {}, unlocked) {
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
    item(
      f6.packQualityParity ? "done" : "pending",
      f6.packQualityParity
        ? "Pack quality confirmed at parity or better"
        : "Pack quality parity not yet confirmed"
    ),
  ];
  const allNumericCleared = items.every((i) => i.status === "done");
  if (allNumericCleared && !f6.bmAttendedAll30) {
    return {
      checkLabel: "Attendance incomplete",
      items,
      infoLine:
        "All three floors are cleared, but the attendance log isn't confirmed complete — the v4 document treats the report as invalid without it, not just missing one more line.",
    };
  }
  return { checkLabel: overallLabel(items), items };
}
