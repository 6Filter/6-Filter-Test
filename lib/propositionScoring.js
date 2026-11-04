/**
 * Server-only. Do not import this module from anything under src/ —
 * Vite would ship the floors and the arithmetic to every browser.
 */
import { getDivisionMarginFloor, getDivisionRevenueTarget } from "./divisionConfig.js";
import {
  effectiveMarginDivision,
  lockedFloorForProposition,
  unmatchedDivisionPending,
} from "./divisionMargin.js";
import {
  checkF1,
  checkF3,
  checkF4,
  checkF6,
  checkFilter,
  ITEM_CODES,
  overallLabel,
  researchFailedCheck,
} from "./filterChecks.js";
import { textConfirmedByPerson } from "./filter1Check.js";
import {
  RELEVANCE_CREDIT,
  gradeAssessment,
  isTooShort,
  hasEnteredText,
} from "./relevanceGrade.js";
import { SCORE_CHECK_SLOTS_TOTAL } from "./lockedConstants.js";
import { categoryCheckCopy } from "./ideaScale.js";
import {
  computeGoNoGo,
  financeSignatureCopy,
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
} from "./goNoGo.js";

export {
  computeGoNoGo,
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
};

function numOrNull(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

function item(status, text, extra = {}) {
  const row = { status, text };
  if (extra.formAdmin) row.formAdmin = true;
  if (extra.code) row.code = extra.code;
  if (extra.slot) row.slot = extra.slot;
  if (extra.level != null) row.level = extra.level;
  if (extra.credit != null) row.credit = extra.credit;
  if (extra.reasons) row.reasons = extra.reasons;
  if (extra.gainPct != null) row.gainPct = extra.gainPct;
  return row;
}

function gradeQcomItem(f2, findings = {}, autofillStatus = {}) {
  const text = String(f2.qcomTrajectory || "").trim();
  const gain = (credit) => Math.round(((1 - Number(credit || 0)) * 100) / SCORE_CHECK_SLOTS_TOTAL);

  if (!hasEnteredText(text)) {
    return item(
      "pending",
      "Quick-commerce 3-year terms assumption missing — describe take-rate, commission and delivery-fee trajectory",
      {
        slot: "qcom",
        code: "F2_QCOM_NOT_ENTERED",
        level: "none",
        credit: 0,
        reasons: ["NOT_ENTERED"],
        gainPct: gain(0),
        formAdmin: true,
      }
    );
  }
  if (isTooShort(text)) {
    return item("pending", "Describe this properly: one word or letter cannot be assessed", {
      slot: "qcom",
      code: "F2_QCOM_TOO_SHORT",
      level: "none",
      credit: 0,
      reasons: ["TOO_SHORT"],
      gainPct: gain(0),
    });
  }
  if (!textConfirmedByPerson("f2.qcomTrajectory", f2.qcomTrajectory, autofillStatus)) {
    return item("pending", "Written by AI: edit or confirm quick-commerce terms before they can score", {
      slot: "qcom",
      code: "F2_QCOM_NEEDS_CONFIRMATION",
      level: "none",
      credit: 0,
      reasons: ["NEEDS_CONFIRMATION"],
      gainPct: gain(0),
    });
  }
  const stored = findings?.assessments?.qcom;
  const raw = stored?.raw || null;
  const grade = gradeAssessment("plan", raw, {
    entered: true,
    humanWritten: true,
    notAssessed: !raw,
  });
  const snippet = text.replace(/\s+/g, " ").slice(0, 100);
  const label =
    grade.level === "strong"
      ? `Quick-commerce terms strong — ${snippet}${snippet.length >= 100 ? "…" : ""}`
      : grade.reasons.includes("NOT_ASSESSED")
        ? "Quick-commerce terms awaiting relevance assessment on Submit"
        : `Quick-commerce terms ${grade.level} — ${snippet}${snippet.length >= 100 ? "…" : ""}`;
  return item(grade.level === "strong" ? "done" : "pending", label, {
    slot: "qcom",
    code: grade.level === "strong" ? "F2_QCOM_STRONG" : `F2_QCOM_${grade.reasons[0] || "NOT_ASSESSED"}`,
    level: grade.level,
    credit: grade.credit ?? RELEVANCE_CREDIT[grade.level] ?? 0,
    reasons: grade.reasons,
    gainPct: gain(grade.credit ?? 0),
  });
}

async function checkF2(f2 = {}, division, category, findings = {}, proposition = {}) {
  return checkFilter(f2, () => computeF2(f2, division, category, findings, proposition));
}

async function computeF2(f2 = {}, division, category, findings = {}, proposition = {}) {
  const hasMrp = Boolean(f2.mrpInr && f2.grammage);
  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const hasCogs = f2.cogsAtScale != null && String(f2.cogsAtScale).trim() !== "";
  const autofillStatus = proposition?.researchFindings?.autofillStatus || findings?.autofillStatus || {};
  const qcomItem = gradeQcomItem(f2, findings, autofillStatus);
  const costResearchFailed = Boolean(findings.researchFailed || f2.researchFailed);
  if (costResearchFailed && !hasCogs) {
    return researchFailedCheck(
      findings.failureReason || "COGS / cost estimate was not completed"
    );
  }
  const propForFloor = { ...proposition, division: division || proposition.division || "" };
  const marginDivision = effectiveMarginDivision(propForFloor);
  const floor =
    lockedFloorForProposition(propForFloor) ??
    (marginDivision ? await getDivisionMarginFloor(marginDivision) : null);

  if (!division || (division && floor == null && unmatchedDivisionPending())) {
    const pendingDivision = unmatchedDivisionPending() && (!division || floor == null);
    if (pendingDivision) {
      const items = [
        item("pending", "Pending: division not determined", { code: ITEM_CODES.F2_DIVISION_PENDING }),
        item(
          hasMrp ? "done" : "pending",
          hasMrp ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared",
          { formAdmin: !hasMrp, ...(hasMrp ? {} : { code: ITEM_CODES.F2_MRP_MISSING }) }
        ),
        qcomItem,
        item(f2.financeSigned ? "done" : "pending", financeSignatureCopy(f2.financeSigned), { formAdmin: true }),
      ];
      return { checkLabel: overallLabel(items), items };
    }
    const categoryText = categoryCheckCopy(category);
    const items = [
      item(String(category || "").trim() ? "done" : "pending", categoryText, {
        formAdmin: !String(category || "").trim(),
      }),
      item(
        hasMrp ? "done" : "pending",
        hasMrp ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared",
        { formAdmin: !hasMrp }
      ),
      item(
        hasMargin ? "done" : "pending",
        hasMargin
          ? `Net margin ${Number(f2.netMarginAtScale)}% recorded — no division floor to screen against`
          : "Net margin at scale not yet computed",
        { formAdmin: !hasMargin }
      ),
      qcomItem,
      item(f2.financeSigned ? "done" : "pending", financeSignatureCopy(f2.financeSigned), { formAdmin: true }),
    ];
    return { checkLabel: overallLabel(items), items };
  }

  const margin = Number(f2.netMarginAtScale);
  const marginOk = hasMargin && floor != null && Number.isFinite(margin) && margin >= floor;
  const floorLabel = marginDivision || division;
  let marginText;
  if (!hasMargin) {
    marginText = "Net margin at scale not yet computed";
  } else if (floor == null) {
    marginText = "Division has no numeric floor on record — Forum judgment";
  } else if (marginOk) {
    marginText = `Net margin ${margin}% clears the ${floor}% floor`;
  } else {
    marginText = `Net margin ${margin}% is below the ${floor}% ${floorLabel} floor (v4, non-negotiable). Raise net margin at scale above ${floor}%, or revise COGS/MRP so the path clears that floor.`;
  }
  const items = [
    item(
      hasMrp ? "done" : "pending",
      hasMrp ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared",
      {
        formAdmin: !hasMrp,
        slot: "mrpGrammage",
        credit: hasMrp ? 1 : 0,
        level: hasMrp ? "strong" : "none",
        ...(hasMrp ? {} : { code: ITEM_CODES.F2_MRP_MISSING }),
      }
    ),
    item(marginOk ? "done" : "pending", marginText, {
      formAdmin: !hasMargin,
      slot: "netMarginFloor",
      credit: marginOk ? 1 : 0,
      level: marginOk ? "strong" : "none",
      ...(!hasMargin
        ? { code: ITEM_CODES.F2_MARGIN_MISSING }
        : !marginOk && floor != null
          ? { code: ITEM_CODES.F2_MARGIN_BELOW_FLOOR }
          : {}),
    }),
    qcomItem,
    item(f2.financeSigned ? "done" : "pending", financeSignatureCopy(f2.financeSigned), { formAdmin: true }),
  ];
  const belowFloor = hasMargin && floor != null && !marginOk;
  return { checkLabel: overallLabel(items, belowFloor), items };
}

async function checkF5(f5 = {}, division, findings = {}, category) {
  if (findings.researchFailed || f5.researchFailed) {
    return researchFailedCheck("household sizing was not completed");
  }
  return checkFilter(f5, () => computeF5(f5, division, findings, category));
}

async function computeF5(f5 = {}, division, findings = {}, category) {
  if (!division) {
    const categoryText = categoryCheckCopy(category);
    const items = [
      item(String(category || "").trim() ? "done" : "pending", categoryText, {
        formAdmin: !String(category || "").trim(),
      }),
      item(
        "pending",
        "Year-3 revenue is sized in Filter 5 — no separate division label is required",
        { formAdmin: true }
      ),
      item(
        f5.cmiHeadSigned ? "done" : "pending",
        f5.cmiHeadSigned
          ? "CMI signature recorded"
          : "CMI signature pending on the sizing model — out-of-range factors must be argued in writing",
        { formAdmin: true }
      ),
    ];
    return { checkLabel: overallLabel(items), items };
  }

  const revenue = computeF5Revenue(f5);
  const target = (await getDivisionRevenueTarget(division))?.allChannels;
  const sizingPresent = revenue != null;
  const sizingDone = sizingPresent && findings.sizingFactorsFound !== false;

  let sizingText;
  if (!sizingPresent) {
    sizingText = "Sizing incomplete — needs households, trial, repeat, frequency and pack value (CMI model)";
  } else if (findings.sizingFactorsFound === false) {
    sizingText = `Sizing numbers entered, but research could not substantiate the household model${
      findings.sizingEvidence ? ` — ${findings.sizingEvidence}` : ""
    }`;
  } else {
    sizingText =
      target != null
        ? `Year-3 revenue ₹${revenue.toFixed(1)} Cr vs ₹${target} Cr target`
        : `Year-3 revenue ₹${revenue.toFixed(1)} Cr computed`;
  }

  const items = [
    item(sizingDone ? "done" : "pending", sizingText, { formAdmin: !sizingPresent }),
    item(
      f5.cmiHeadSigned ? "done" : "pending",
      f5.cmiHeadSigned
        ? "CMI signature recorded"
        : "CMI signature pending on the sizing model — out-of-range factors must be argued in writing",
      { formAdmin: true }
    ),
  ];
  return { checkLabel: overallLabel(items), items };
}

export function logScoringFresh(proposition, result) {
  const f2 = proposition?.f2 || {};
  console.log(
    `[primus/scoring] recomputed fresh from current field values, cogs=${f2.cogsAtScale}, margin=${f2.netMarginAtScale} -> checkLabel=${result?.f2?.checkLabel}`
  );
}

export async function computeAllAdvisoryChecks(proposition) {
  const { division, category, f1 = {}, f2 = {}, f3 = {}, f4 = {}, f5 = {}, f6 = {} } = proposition || {};
  const researchFindings =
    proposition?.researchFindings && typeof proposition.researchFindings === "object"
      ? proposition.researchFindings
      : {};
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every((k) => (proposition || {})[k]?.forumVerdict === "pass");
  const [f2Check, f5Check] = await Promise.all([
    checkF2(f2, division, category, researchFindings.f2 || {}, proposition || {}),
    checkF5(f5, division, researchFindings.f5 || {}, category),
  ]);
  const f1Findings = {
    ...(researchFindings.f1 || {}),
    evidenceRead: researchFindings.evidenceRead || researchFindings.f1?.evidenceRead,
    claimChecks: researchFindings.f1?.claimChecks,
    benchmarkCheck: researchFindings.f1?.benchmarkCheck,
    routeCheck: researchFindings.f1?.routeCheck,
    noCompetitorCheck: researchFindings.f1?.noCompetitorCheck,
  };
  const result = {
    f1: checkF1(f1, f1Findings, {
      evidenceRead: researchFindings.evidenceRead || researchFindings.f1?.evidenceRead,
      autofillStatus: researchFindings.autofillStatus || {},
    }),
    f2: f2Check,
    f3: checkF3(f2, f3, researchFindings.f3 || {}),
    f4: checkF4(f4, researchFindings.f4 || {}),
    f5: f5Check,
    f6: checkF6(f6, stage1Cleared),
  };
  logScoringFresh(proposition, result);
  return result;
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
