/**
 * Browser-safe Filter 1/3/4/6 check items. No DB, no Node APIs.
 * Research flags only demote "done" when a finding is explicitly false
 * (research ran and came back empty). Missing flags keep presence-only behaviour.
 */

import {
  DIMENSION_LABELS,
  aggregateTechShiftRisk,
  effectiveOverallRisk,
} from "./techShiftRisk.js";
import { computeMrp } from "./mrpFormula.js";

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

function listPhrase(items) {
  const xs = (Array.isArray(items) ? items : []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!xs.length) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

function attributeCheckCopy({ attr1, attrCount, keyAttrs, notCore, aligned }) {
  if (!attr1) return { done: false, text: "Attribute 1 not yet declared (required)" };
  if (notCore.length) {
    const bet = listPhrase(notCore.map((v) => v.stated));
    const sellsOn = listPhrase(keyAttrs);
    const sellBit = sellsOn ? `The category currently sells on ${sellsOn}. ` : "";
    const plural = notCore.length > 1;
    return {
      done: false,
      text: `${sellBit}${bet} ${plural ? "require" : "requires"} primary research — ${
        plural ? "they are" : "it is"
      } not a salient purchase driver across general trade, modern trade, e-com and quick-commerce.`,
    };
  }
  if (aligned.length && attrCount > 1) {
    return {
      done: true,
      text: `Attributes declared (${attrCount} of 3) — category research confirms ${aligned.length} as purchase drivers across channels`,
    };
  }
  if (attrCount > 1) {
    return { done: true, text: `Attributes declared (${attrCount} of 3)` };
  }
  return { done: true, text: "Attribute 1 declared" };
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
  const validation = Array.isArray(findings.attributeValidation) ? findings.attributeValidation : [];
  const keyAttrs = (Array.isArray(findings.categoryKeyAttributes) ? findings.categoryKeyAttributes : [])
    .filter(Boolean)
    .slice(0, 4);
  const notCore = validation.filter((v) => v?.status === "not-core");
  const aligned = validation.filter((v) => v?.status === "aligned");
  const attrCopy = attributeCheckCopy({ attr1, attrCount, keyAttrs, notCore, aligned });

  const benchmarkDone =
    Boolean(f1.benchmark) && !findings.researchFailed && findings.benchmarkVerified !== false;
  const growthDone =
    Boolean(f1.growthRoute && f1.growthArgument) &&
    !findings.researchFailed &&
    findings.categorySizeFound !== false;

  let benchmarkText;
  if (!f1.benchmark) {
    benchmarkText = "Benchmark not named";
  } else if (findings.researchFailed) {
    benchmarkText = "Research failed — retry — benchmark verification did not complete";
  } else if (findings.benchmarkVerified === false) {
    benchmarkText = `Benchmark named but not verified — ${findings.benchmarkEvidence || "Searched and found no verifiable competitive presence for this benchmark"}`;
  } else {
    benchmarkText = `Benchmark named: ${f1.benchmark}`;
  }

  let growthText;
  if (!(f1.growthRoute && f1.growthArgument)) {
    growthText = "Growth route or growth argument incomplete";
  } else if (findings.researchFailed) {
    growthText = "Research failed — retry — category size was not completed";
  } else if (findings.categorySizeFound === false) {
    growthText = "Growth argument entered, but category size could not be substantiated by research";
  } else if (findings.categorySizeFound === true) {
    growthText = "Growth route and argument recorded, backed by researched category size";
  } else {
    growthText = "Growth route and argument recorded";
  }

  const items = [
    item(attrCopy.done ? "done" : "pending", attrCopy.text),
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

function rupeeLabel(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toFixed(0)}` : "₹—";
}

export function checkF3(f2 = {}, f3 = {}, _findings = {}) {
  const range = f3.marginElasticity;
  if (range?.rangeError) {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", range.rangeError)],
    };
  }
  if (range?.packSizeWarning && (range.maxMrpInr == null || range.maxMrpInr === "")) {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", range.packSizeWarning)],
    };
  }
  const min = range?.minMarginPct == null || range.minMarginPct === "" ? null : Number(range.minMarginPct);
  const max = range?.maxMarginPct == null || range.maxMarginPct === "" ? null : Number(range.maxMarginPct);
  const margin = Number(f2.netMarginAtScale);
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return { checkLabel: "Evidence missing", items: [item("pending", "Margin elasticity not yet computed")] };
  }
  if (f2.netMarginAtScale == null || f2.netMarginAtScale === "") {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", "Range computed, but Filter 2's margin isn't entered yet to check against it")],
    };
  }
  const lo = rupeeLabel(range.minMrpInr);
  const hi = rupeeLabel(range.maxMrpInr);
  const minMrp = Number(range.minMrpInr);
  const maxMrp = Number(range.maxMrpInr);
  const typedMrp = Number(f2.mrpInr);
  const computed = computeMrp({
    cogsAtScale: f2.cogsAtScale,
    netMarginAtScale: f2.netMarginAtScale,
    gstRatePct: f2.gstRatePct,
  });
  const liveMrp =
    Number.isFinite(typedMrp) && typedMrp > 0
      ? typedMrp
      : computed?.finalMrp ?? computed?.baseMrp ?? null;
  const withinRange =
    liveMrp != null && Number.isFinite(minMrp) && Number.isFinite(maxMrp)
      ? liveMrp + 0.5 >= minMrp && liveMrp - 0.5 <= maxMrp
      : margin >= min && margin <= max;
  return {
    checkLabel: withinRange ? "Cleared" : "Below floor",
    items: [
      item(
        withinRange ? "done" : "pending",
        withinRange
          ? `Filter 2 MRP sits within the safe ${lo}–${hi} range`
          : (liveMrp != null && Number.isFinite(minMrp) && liveMrp + 0.5 < minMrp) ||
              (liveMrp == null && margin < min)
            ? `Current MRP implies a price below the safe ${lo} floor`
            : `Current MRP implies a price above the safe ${hi} ceiling — risks over 10 percent volume loss`
      ),
    ],
  };
}

export function checkF4(f4 = {}, findings = {}) {
  if (findings.researchFailed || f4.researchFailed) {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", "Research failed — retry — structural obsolescence was not completed")],
    };
  }
  const risk = f4.techShiftRisk;
  if (!risk?.dimensions) {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", "Technology & habit shift risk not yet assessed")],
    };
  }
  const items = Object.entries(risk.dimensions).map(([key, d]) =>
    item(
      d.risk === "Low" ? "done" : "pending",
      `${DIMENSION_LABELS[key] || key}: ${d.risk} risk — ${d.reason}`
    )
  );
  const overall = effectiveOverallRisk(risk) || aggregateTechShiftRisk(risk.dimensions);
  const checkLabel = overall === "High" ? "Below floor" : overall === "Medium" ? "Evidence missing" : "Cleared";
  return { checkLabel, items };
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
