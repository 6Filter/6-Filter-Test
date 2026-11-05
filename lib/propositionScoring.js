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
  overallLabel,
  researchFailedCheck,
} from "./filterChecks.js";
import { categoryCheckCopy } from "./ideaScale.js";
import {
  computeGoNoGo,
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
} from "./goNoGo.js";
import { applyFilter2Rules, F2_ITEM_CODES } from "./filter2Check.js";

export {
  computeGoNoGo,
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
  F2_ITEM_CODES,
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

async function checkF2(f2 = {}, division, category, findings = {}, proposition = {}) {
  return checkFilter(f2, () => computeF2(f2, division, category, findings, proposition));
}

async function computeF2(f2 = {}, division, category, findings = {}, proposition = {}) {
  const hasCogs = f2.cogsAtScale != null && String(f2.cogsAtScale).trim() !== "";
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
  const divisionPending = unmatchedDivisionPending() && (!division || floor == null);

  if (divisionPending) {
    return applyFilter2Rules(f2, {
      floor: null,
      divisionPending: true,
      divisionLabel: "",
    });
  }

  if (!division && floor == null) {
    void categoryCheckCopy(category);
  }

  return applyFilter2Rules(f2, {
    floor,
    divisionPending: false,
    divisionLabel: marginDivision || division || "",
  });
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
    f3: checkF3(f2, f3, researchFindings.f3 || {}, {
      autofillStatus: researchFindings.autofillStatus || {},
    }),
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
