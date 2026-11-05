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
  F3_MRP_RANGE_TOLERANCE_INR,
  F6_CONSUMER_PANEL_MIN,
  F6_LAB_GAP_FLOOR,
  F6_PACK_STANDOUT_FLOOR,
  F6_PANEL_TOTAL,
  VOLUME_LOSS_CEILING_PCT,
} from "./lockedConstants.js";

import { F1_ITEM_CODES, checkF1 as checkF1Six, computeF1 as computeF1Six } from "./filter1Check.js";
import { F2_ITEM_CODES } from "./filter2Check.js";

/** Part 132/133/134 — stable codes for every analytical check item. */
export const ITEM_CODES = Object.freeze({
  ...F1_ITEM_CODES,
  ...F2_ITEM_CODES,
  F1_ATTRIBUTE_NOT_CORE: "F1_ATTRIBUTE_NOT_CORE",
  F1_BENCHMARK_NOT_VERIFIED: "F1_BENCHMARK_NOT_VERIFIED",
  F1_BENCHMARK_RESEARCH_FAILED: "F1_BENCHMARK_RESEARCH_FAILED",
  F1_GROWTH_ROUTE_MISSING: "F1_GROWTH_ROUTE_MISSING",
  F1_GROWTH_ARGUMENT_MISSING: "F1_GROWTH_ARGUMENT_MISSING",
  F1_CATEGORY_SIZE_UNSOURCED: "F1_CATEGORY_SIZE_UNSOURCED",
  F1_CATEGORY_SIZE_RESEARCH_FAILED: "F1_CATEGORY_SIZE_RESEARCH_FAILED",
  F2_MRP_MISSING: "F2_MRP_MISSING",
  F2_QCOM_MISSING: "F2_QCOM_MISSING",
  F3_NOT_RUN: "F3_NOT_RUN",
  F3_MRP_OUTSIDE_RANGE: "F3_MRP_OUTSIDE_RANGE",
  F3_MRP_MISSING: "F3_MRP_MISSING",
  F4_NOT_RUN: "F4_NOT_RUN",
  F4_DIMENSION_RISK: "F4_DIMENSION_RISK",
  F4_RESEARCH_FAILED: "F4_RESEARCH_FAILED",
  RESEARCH_FAILED: "RESEARCH_FAILED",
  FILTER_NOT_RUN: "FILTER_NOT_RUN",
  INPUT_INVALID: "INPUT_INVALID",
});

function item(status, text, extra = {}) {
  const row = { status, text };
  if (extra.formAdmin) row.formAdmin = true;
  if (extra.code) row.code = extra.code;
  return row;
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

/** A filled benchmark field is not enough — AI placeholders and unverified names do not count. */
export function hasGenuinelyVerifiedBenchmark(f1 = {}, findings = {}) {
  return Boolean(String(f1.benchmark || "").trim()) && findings.benchmarkVerified === true;
}

/**
 * Part 133 — first-mover claim is an EXPLICIT gap of 0 with an empty benchmark.
 * A blank gap is a missing input, not a claim. Gap 0 with a typed benchmark is below floor.
 */
export function isClaimingNoCompetitor(f1 = {}, findings = {}) {
  const gapRaw = f1.declaredGap;
  if (gapRaw == null || gapRaw === "") return false;
  const gapNum = Number(gapRaw);
  if (!(Number.isFinite(gapNum) && gapNum === 0)) return false;
  if (String(f1.benchmark || "").trim()) return false;
  return !hasGenuinelyVerifiedBenchmark(f1, findings);
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
      `Declared gap of 0 doesn't reflect genuine absence of competition — found ${found.length} established competitors: ${found.join(", ")}. A real declared gap is required.`,
      { code: ITEM_CODES.F1_GAP_BELOW_FLOOR }
    );
  }
  if (gapRaw == null || gapRaw === "" || !Number.isFinite(gapNum)) {
    return item("pending", "Declared gap missing", { formAdmin: true, code: ITEM_CODES.F1_GAP_MISSING });
  }
  return item("pending", `Declared gap ${gapNum} is below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor (v4)`, {
    code: ITEM_CODES.F1_GAP_BELOW_FLOOR,
  });
}

function listPhrase(items) {
  const xs = (Array.isArray(items) ? items : []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!xs.length) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

function attributeCheckCopy({ attr1, attrCount, keyAttrs, notCore, aligned }) {
  if (!attr1) {
    return {
      done: false,
      text: "Attribute 1 not yet declared (required)",
      code: ITEM_CODES.F1_ATTRIBUTE_MISSING,
    };
  }
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
      code: ITEM_CODES.F1_ATTRIBUTE_NOT_CORE,
    };
  }
  // Attributes 2 and 3 are optional — never required for the attribute slot or the percent.
  if (aligned.length && attrCount > 1) {
    return {
      done: true,
      text: `Attributes declared (${attrCount}) — category research confirms ${aligned.length} as purchase drivers across channels`,
    };
  }
  if (attrCount > 1) {
    return { done: true, text: `Attributes declared (${attrCount})` };
  }
  return { done: true, text: "Attribute 1 declared" };
}

/** Part 133 — six Filter 1 checks. Optional ctx: { evidenceRead, autofillStatus }. */
export function checkF1(f1 = {}, findings = {}, ctx = {}) {
  return checkF1Six(f1, findings, ctx);
}

export function computeF1(f1 = {}, findings = {}, ctx = {}) {
  return computeF1Six(f1, findings, ctx);
}

function rupeeLabel(n) {
  if (n == null || n === "") return "₹—";
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toFixed(0)}` : "₹—";
}

export function researchFailedCheck(detail) {
  return {
    checkLabel: "Evidence missing",
    items: [
      item("pending", `Research failed — retry — ${detail}`, { code: ITEM_CODES.RESEARCH_FAILED }),
    ],
  };
}

export function checkF3(f2 = {}, f3 = {}, findings = {}, ctx = {}) {
  if (findings.researchFailed || f3.researchFailed) {
    return researchFailedCheck(findings.failureReason || "price resilience was not completed");
  }
  return checkFilter(f3, () => computeF3(f2, f3, findings, ctx));
}

function computeF3(f2 = {}, f3 = {}, _findings = {}, ctx = {}) {
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
      item(
        "pending",
        "Range computed, but Filter 2's MRP isn't entered yet to check against it",
        { formAdmin: true, code: ITEM_CODES.F3_MRP_MISSING }
      ),
    ];
    return { checkLabel: overallLabel(items), items };
  }
  const tol = Number(F3_MRP_RANGE_TOLERANCE_INR);
  const withinRange = liveMrp + tol >= minMrp && liveMrp - tol <= maxMrp;
  if (withinRange) {
    return {
      checkLabel: "Cleared",
      items: [
        item("done", `Filter 2 MRP sits within the safe ${lo}–${hi} range`, {
          slot: "mrpInSafeRange",
          credit: 1,
          level: "strong",
        }),
      ],
    };
  }
  const outsideText =
    liveMrp + tol < minMrp
      ? `Current MRP implies a price below the safe ${lo} floor`
      : `Current MRP implies a price above the safe ${hi} ceiling — risks over ${VOLUME_LOSS_CEILING_PCT} percent volume loss`;
  return {
    checkLabel: "Below floor",
    items: [
      item("pending", outsideText, {
        slot: "mrpInSafeRange",
        credit: 0,
        level: "none",
        code: ITEM_CODES.F3_MRP_OUTSIDE_RANGE,
      }),
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
      items: [
        item("pending", "Research failed — retry — structural obsolescence was not completed", {
          code: ITEM_CODES.F4_RESEARCH_FAILED,
        }),
      ],
    };
  }
  const risk = f4.techShiftRisk;
  if (!risk?.dimensions) {
    const items = [
      item("pending", "Technology & habit shift risk not yet assessed", {
        formAdmin: true,
        code: ITEM_CODES.F4_NOT_RUN,
      }),
    ];
    return { checkLabel: "Not yet run", items };
  }
  const dims = listTechShiftDimensions(risk.dimensions);
  if (!dims.length) {
    const items = [
      item("pending", "Technology & habit shift risk not yet assessed", {
        formAdmin: true,
        code: ITEM_CODES.F4_NOT_RUN,
      }),
    ];
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
    return item(cleared ? "done" : "pending", text, cleared ? {} : { code: ITEM_CODES.F4_DIMENSION_RISK });
  });
  const overall = hasReassessedDimension(risk.dimensions)
    ? aggregateTechShiftRiskWithResponses(risk.dimensions)
    : effectiveOverallRisk(risk) || aggregateTechShiftRisk(risk.dimensions);
  const allAssessed = items.every((it) => !/no research rating recorded/i.test(it.text));
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
