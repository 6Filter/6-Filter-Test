/**
 * Browser-safe Filter 1/3/4/6 check items. No DB, no Node APIs.
 * Research flags only demote "done" when a finding is explicitly false
 * (research ran and came back empty). Missing flags keep presence-only behaviour.
 */

import {
  aggregateTechShiftRisk,
  aggregateTechShiftRiskWithResponses,
  effectiveOverallRisk,
  hasReassessedDimension,
  listTechShiftDimensions,
} from "./techShiftRisk.js";
import { computeMrp } from "./mrpFormula.js";
import { BENCHMARK_UNVERIFIED_COPY, isAttributePlaceholderCopy } from "./researchFailureCopy.js";
import {
  DECLARED_GAP_FLOOR,
  F6_CONSUMER_PANEL_MIN,
  F6_LAB_GAP_FLOOR,
  F6_PACK_STANDOUT_FLOOR,
  F6_PANEL_TOTAL,
  VOLUME_LOSS_CEILING_PCT,
} from "./lockedConstants.js";

function item(status, text, extra = {}) {
  return extra.formAdmin ? { status, text, formAdmin: true } : { status, text };
}

const META_FILTER_KEYS = new Set([
  "forumVerdict",
  "verdictNote",
  "gstRatePct",
  "gstBasis",
  "confirmedByHuman",
]);

function valueIsFilled(v) {
  if (v == null || v === "") return false;
  if (typeof v === "boolean") return v === true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.some(valueIsFilled);
  if (typeof v === "object") return Object.values(v).some(valueIsFilled);
  return String(v).trim() !== "";
}

/** Shared blank-filter gate — one rule for F1–F6, not a per-filter special case. */
export function hasAnyRealInput(filterData = {}) {
  return Object.entries(filterData).some(([key, v]) => {
    if (META_FILTER_KEYS.has(key)) return false;
    return valueIsFilled(v);
  });
}

export const NOT_YET_RUN = Object.freeze({ checkLabel: "Not yet run", items: [] });

export function checkFilter(filterData, computeFn) {
  if (!hasAnyRealInput(filterData)) return { ...NOT_YET_RUN, items: [] };
  return computeFn();
}

const FORM_ADMIN_TEXT =
  /hasn't been confirmed by Finance|Finance has confirmed the margin|Finance has not confirmed|Finance still needs to confirm|confirmed by Finance|CMI signature pending|^CMI signature recorded$|signature pending|not yet declared|not yet entered|not yet computed|not yet assessed|not yet confirmed|assumption missing|^Declared gap missing$|^Benchmark not named$|^Growth route or growth argument incomplete$|^Attribute 1 not yet declared|Sizing incomplete — needs households|isn't entered yet to check against it|no separate division label is required|not filled on the input form|Category is not filled/i;

/** Blank fields, unsigned ticks, and other form-admin gaps — not analytical findings. */
export function isFormAdminCheck(it) {
  if (it && typeof it === "object" && it.formAdmin === true) return true;
  return FORM_ADMIN_TEXT.test(String(it?.text || "").trim());
}

export function analysisCheckItems(items) {
  return (Array.isArray(items) ? items : []).filter((i) => !isFormAdminCheck(i));
}

export function overallLabel(items, belowFloor = false) {
  if (belowFloor) return "Below floor";
  const scored = analysisCheckItems(items);
  if (!scored.length) return "Cleared";
  if (scored.every((i) => i.status === "done")) return "Cleared";
  return "Evidence missing";
}

function namedCompetitors(check) {
  return (Array.isArray(check?.majorCompetitorsFound) ? check.majorCompetitorsFound : [])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

function gapIsZeroOrBlank(f1 = {}) {
  const gapRaw = f1.declaredGap;
  const gapNum = Number(gapRaw);
  return !gapRaw || (Number.isFinite(gapNum) && gapNum === 0);
}

/** A filled benchmark field is not enough — AI placeholders and unverified names do not count. */
export function hasGenuinelyVerifiedBenchmark(f1 = {}, findings = {}) {
  return Boolean(String(f1.benchmark || "").trim()) && findings.benchmarkVerified === true;
}

/** Gap 0/blank and no *verified* competitor — a first-mover claim, not a short declared value. */
export function isClaimingNoCompetitor(f1 = {}, findings = {}) {
  return gapIsZeroOrBlank(f1) && !hasGenuinelyVerifiedBenchmark(f1, findings);
}

export function evaluateDeclaredGap(f1 = {}, findings = {}) {
  const gapRaw = f1.declaredGap;
  const gapNum = Number(gapRaw);
  if (Number.isFinite(gapNum) && gapNum >= DECLARED_GAP_FLOOR) {
    return item("done", `Declared gap ${gapNum} clears the ${DECLARED_GAP_FLOOR.toFixed(1)} floor`);
  }
  if (isClaimingNoCompetitor(f1, findings) && findings.noCompetitorCheck) {
    const found = namedCompetitors(findings.noCompetitorCheck);
    const searchSummary =
      String(findings.noCompetitorCheck.searchSummary || "").trim() || "research complete";
    if (found.length < 2) {
      return item(
        "done",
        `No established competitor found (${searchSummary}) — declared gap of 0 accepted as a genuine first-mover claim, not scored against the floor.`
      );
    }
    return item(
      "pending",
      `Declared gap of 0 doesn't reflect genuine absence of competition — found ${found.length} established competitors: ${found.join(", ")}. A real declared gap is required.`
    );
  }
  if (gapRaw == null || gapRaw === "" || !Number.isFinite(gapNum)) {
    return item("pending", "Declared gap missing", { formAdmin: true });
  }
  return item("pending", `Declared gap ${gapNum} is below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor (v4)`);
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
  return checkFilter(f1, () => computeF1(f1, findings));
}

function computeF1(f1 = {}, findings = {}) {
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
  const currentAttrs = new Set(
    [attr1, ...attrExtras].map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
  );
  const liveValidation = validation.filter((v) =>
    currentAttrs.has(String(v?.stated || "").trim().toLowerCase())
  );
  const notCore = liveValidation.filter((v) => v?.status === "not-core");
  const aligned = liveValidation.filter((v) => v?.status === "aligned");
  const attrCopy = attributeCheckCopy({ attr1, attrCount, keyAttrs, notCore, aligned });

  const benchmarkDone =
    Boolean(f1.benchmark) && !findings.researchFailed && findings.benchmarkVerified === true;
  const growthDone =
    Boolean(f1.growthRoute && f1.growthArgument) &&
    !findings.researchFailed &&
    findings.categorySizeFound === true;

  let benchmarkText;
  if (!f1.benchmark) {
    benchmarkText = "Benchmark not named";
  } else if (findings.researchFailed) {
    benchmarkText = "Research failed — retry — benchmark verification did not complete";
  } else if (findings.benchmarkVerified === false) {
    const evidence = isAttributePlaceholderCopy(findings.benchmarkEvidence)
      ? BENCHMARK_UNVERIFIED_COPY
      : findings.benchmarkEvidence || BENCHMARK_UNVERIFIED_COPY;
    benchmarkText = `Benchmark named (${f1.benchmark}) but not verified — ${evidence}`;
  } else if (findings.benchmarkVerified === true) {
    const finding = String(findings.benchmarkEvidence || "").trim();
    benchmarkText =
      finding && finding !== f1.benchmark
        ? `Benchmark verified: ${f1.benchmark} — ${finding}`
        : `Benchmark verified: ${f1.benchmark}`;
  } else {
    benchmarkText = `Benchmark named: ${f1.benchmark}`;
  }

  let growthText;
  const growthRoute = String(f1.growthRoute || "").trim();
  const growthArg = String(f1.growthArgument || "").trim();
  const sizeEvidence = String(findings.categorySizeEvidence || "").trim().slice(0, 160);
  if (!(growthRoute && growthArg)) {
    growthText = !growthRoute
      ? "Growth route not selected — choose penetration, frequency, or new market"
      : "Growth argument missing — write one paragraph with numbers traceable to a CMI source";
  } else if (findings.researchFailed) {
    growthText = `Research failed on category size for growth route "${growthRoute}" — retry Submit so the size evidence can be researched`;
  } else if (findings.categorySizeFound === false) {
    growthText = sizeEvidence
      ? `Growth route "${growthRoute}" is entered, but category size was not substantiated — ${sizeEvidence}`
      : `Growth route "${growthRoute}" is entered, but researched category size could not be substantiated for this idea/category. Strengthen the idea description or category, then Submit again.`;
  } else if (findings.categorySizeFound === true) {
    growthText = sizeEvidence
      ? `Growth route "${growthRoute}" recorded, backed by researched category size — ${sizeEvidence}`
      : `Growth route "${growthRoute}" and argument recorded, backed by researched category size`;
  } else {
    growthText = `Growth route "${growthRoute}" and argument recorded — category size research has not returned a result yet`;
  }

  const gapItem = evaluateDeclaredGap(f1, findings);
  const items = [
    item(attrCopy.done ? "done" : "pending", attrCopy.text, { formAdmin: !attr1 }),
    item(benchmarkDone ? "done" : "pending", benchmarkText, { formAdmin: !f1.benchmark }),
    gapItem,
    item(growthDone ? "done" : "pending", growthText, {
      formAdmin: !(f1.growthRoute && f1.growthArgument),
    }),
  ];
  const gapN = Number(f1.declaredGap);
  const found = namedCompetitors(findings.noCompetitorCheck);
  const firstMoverAccepted = isClaimingNoCompetitor(f1, findings) && findings.noCompetitorCheck && found.length < 2;
  const claimDisproved = isClaimingNoCompetitor(f1, findings) && findings.noCompetitorCheck && found.length >= 2;
  const numericBelow =
    f1.declaredGap != null &&
    f1.declaredGap !== "" &&
    Number.isFinite(gapN) &&
    gapN < DECLARED_GAP_FLOOR &&
    !firstMoverAccepted;
  const belowFloor = numericBelow || claimDisproved;
  return { checkLabel: overallLabel(items, belowFloor), items };
}

function rupeeLabel(n) {
  if (n == null || n === "") return "₹—";
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toFixed(0)}` : "₹—";
}

export function researchFailedCheck(detail) {
  return {
    checkLabel: "Evidence missing",
    items: [item("pending", `Research failed — retry — ${detail}`)],
  };
}

export function checkF3(f2 = {}, f3 = {}, findings = {}) {
  if (findings.researchFailed || f3.researchFailed) {
    return researchFailedCheck(findings.failureReason || "price resilience was not completed");
  }
  return checkFilter(f3, () => computeF3(f2, f3, findings));
}

function computeF3(f2 = {}, f3 = {}, _findings = {}) {
  const range =
    f3?.marginElasticity && typeof f3.marginElasticity === "object" ? f3.marginElasticity : null;
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
  const minMrp = Number(range?.minMrpInr);
  const maxMrp = Number(range?.maxMrpInr);
  const hasRupeeRange =
    Number.isFinite(minMrp) && minMrp > 0 && Number.isFinite(maxMrp) && maxMrp > 0;
  if (!range || !hasRupeeRange) {
    const items = [item("pending", "Margin elasticity not yet computed", { formAdmin: true })];
    return { checkLabel: "Evidence missing", items };
  }
  if (f2.netMarginAtScale == null || f2.netMarginAtScale === "") {
    const items = [
      item("pending", "Range computed, but Filter 2's margin isn't entered yet to check against it", { formAdmin: true }),
    ];
    return { checkLabel: overallLabel(items), items };
  }
  const lo = rupeeLabel(range?.minMrpInr);
  const hi = rupeeLabel(range?.maxMrpInr);
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
  if (liveMrp == null) {
    const items = [
      item("pending", "Range computed, but Filter 2's MRP isn't entered yet to check against it", { formAdmin: true }),
    ];
    return { checkLabel: overallLabel(items), items };
  }
  const withinRange = liveMrp + 0.5 >= minMrp && liveMrp - 0.5 <= maxMrp;
  return {
    checkLabel: withinRange ? "Cleared" : "Below floor",
    items: [
      item(
        withinRange ? "done" : "pending",
        withinRange
          ? `Filter 2 MRP sits within the safe ${lo}–${hi} range`
          : liveMrp + 0.5 < minMrp
            ? `Current MRP implies a price below the safe ${lo} floor`
            : `Current MRP implies a price above the safe ${hi} ceiling — risks over ${VOLUME_LOSS_CEILING_PCT} percent volume loss`
      ),
    ],
  };
}

export function checkF4(f4 = {}, findings = {}) {
  if (findings.researchFailed || f4.researchFailed) {
    return researchFailedCheck("structural obsolescence was not completed");
  }
  return checkFilter(f4, () => computeF4(f4, findings));
}

function computeF4(f4 = {}, findings = {}) {
  if (findings.researchFailed || f4.researchFailed) {
    return {
      checkLabel: "Evidence missing",
      items: [item("pending", "Research failed — retry — structural obsolescence was not completed")],
    };
  }
  const risk = f4.techShiftRisk;
  if (!risk?.dimensions) {
    const items = [item("pending", "Technology & habit shift risk not yet assessed", { formAdmin: true })];
    return { checkLabel: "Not yet run", items };
  }
  const dims = listTechShiftDimensions(risk.dimensions);
  if (!dims.length) {
    const items = [item("pending", "Technology & habit shift risk not yet assessed", { formAdmin: true })];
    return { checkLabel: "Not yet run", items };
  }
  const items = dims.map((d) => {
    const assessed = d.risk === "Low" || d.risk === "Medium" || d.risk === "High";
    const reason = String(d.reason || "").trim();
    const realReason = Boolean(reason && reason !== "—");
    const effective = d.effectiveRisk || d.risk;
    const reassessed = d.reassessedRisk;
    const after = String(d.reassessedReason || "").trim();
    const cleared = effective === "Low" && assessed && realReason;
    let text;
    if (!assessed) {
      text = `${d.label}: no research rating recorded — re-run Filter 4 research for this idea`;
    } else if (reassessed) {
      text = `${d.label}: original ${d.risk} risk — ${reason || "no evidence recorded"}. After response: ${reassessed} risk — ${after || "no reassessed reason recorded"}`;
      if (!cleared) {
        text += `. Still open — add a more specific Filter 4 mitigation response for "${d.label}" with verifiable evidence`;
      }
    } else if (cleared) {
      text = `${d.label}: ${d.risk} risk — ${reason}`;
    } else {
      text = `${d.label}: ${d.risk} risk — ${reason || "research found this exposure"}. Clear via a Filter 4 mitigation response on "${d.label}" naming contracts, lab proof, or a dated certification path`;
    }
    return item(cleared ? "done" : "pending", text);
  });
  const overall = hasReassessedDimension(risk.dimensions)
    ? aggregateTechShiftRiskWithResponses(risk.dimensions)
    : effectiveOverallRisk(risk) || aggregateTechShiftRisk(risk.dimensions);
  const allAssessed = items.every((it) => !/no research rating recorded$/.test(it.text));
  if (!allAssessed) {
    return { checkLabel: overallLabel(items), items };
  }
  const checkLabel = overall === "High" ? "Below floor" : overall === "Medium" ? "Evidence missing" : "Cleared";
  return { checkLabel, items };
}

export function checkF6(f6 = {}, unlocked) {
  return checkFilter(f6, () => computeF6(f6, unlocked));
}

function computeF6(f6 = {}, unlocked) {
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
      f6.labGapVsBenchmark != null && f6.labGapVsBenchmark !== "" && lab >= F6_LAB_GAP_FLOOR ? "done" : "pending",
      f6.labGapVsBenchmark != null && f6.labGapVsBenchmark !== ""
        ? `Lab gap ${lab} vs ${F6_LAB_GAP_FLOOR} floor`
        : "Lab gap not yet entered",
      { formAdmin: f6.labGapVsBenchmark == null || f6.labGapVsBenchmark === "" }
    ),
    item(
      f6.consumerPanelBeaters != null && f6.consumerPanelBeaters !== "" && beaters >= F6_CONSUMER_PANEL_MIN
        ? "done"
        : "pending",
      f6.consumerPanelBeaters != null && f6.consumerPanelBeaters !== ""
        ? `${beaters} of ${F6_PANEL_TOTAL} vs the ${F6_CONSUMER_PANEL_MIN} gate`
        : "Consumer panel result not yet entered",
      { formAdmin: f6.consumerPanelBeaters == null || f6.consumerPanelBeaters === "" }
    ),
    item(
      f6.packStandoutGap != null && f6.packStandoutGap !== "" && pack >= F6_PACK_STANDOUT_FLOOR ? "done" : "pending",
      f6.packStandoutGap != null && f6.packStandoutGap !== ""
        ? `Pack standout ${pack} vs ${F6_PACK_STANDOUT_FLOOR} floor`
        : "Pack standout not yet entered",
      { formAdmin: f6.packStandoutGap == null || f6.packStandoutGap === "" }
    ),
    item(
      f6.packQualityParity ? "done" : "pending",
      f6.packQualityParity
        ? "Pack quality confirmed at parity or better"
        : "Pack quality parity not yet confirmed",
      { formAdmin: true }
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
