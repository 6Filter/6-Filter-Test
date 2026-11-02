/**
 * Server-only. Do not import this module from anything under src/ —
 * Vite would ship the floors and the arithmetic to every browser.
 */
import { getDivisionMarginFloor, getDivisionRevenueTarget } from "./divisionConfig.js";
import { divisionForScore } from "./divisionForScore.js";
import { checkF1, checkF3, checkF4, checkF6, checkFilter, overallLabel, researchFailedCheck } from "./filterChecks.js";
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
  return extra.formAdmin ? { status, text, formAdmin: true } : { status, text };
}

async function checkF2(f2 = {}, division, category) {
  return checkFilter(f2, () => computeF2(f2, division, category));
}

async function computeF2(f2 = {}, division, category) {
  const hasMrp = Boolean(f2.mrpInr && f2.grammage);
  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const hasQcom = Boolean(f2.qcomTrajectory);
  if (!division) {
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
      item(
        hasQcom ? "done" : "pending",
        hasQcom
          ? `Quick-commerce 3-year terms recorded — ${String(f2.qcomTrajectory || "").trim().replace(/\s+/g, " ").slice(0, 100)}`
          : "Quick-commerce 3-year terms assumption missing — describe take-rate, commission and delivery-fee trajectory for this pack's MRP (v4)",
        { formAdmin: !hasQcom }
      ),
      item(f2.financeSigned ? "done" : "pending", financeSignatureCopy(f2.financeSigned), { formAdmin: true }),
    ];
    return { checkLabel: overallLabel(items), items };
  }

  const floor = await getDivisionMarginFloor(division);
  const margin = Number(f2.netMarginAtScale);
  const marginOk = hasMargin && floor != null && Number.isFinite(margin) && margin >= floor;
  let marginText;
  if (!hasMargin) {
    marginText = "Net margin at scale not yet computed";
  } else if (floor == null) {
    marginText = "Division has no numeric floor on record — Forum judgment";
  } else if (marginOk) {
    marginText = `Net margin ${margin}% clears the ${floor}% floor`;
  } else {
    marginText = `Net margin ${margin}% is below the ${floor}% ${division} floor (v4, non-negotiable). Raise net margin at scale above ${floor}%, or revise COGS/MRP so the path clears that floor.`;
  }
  const qcomSnippet = String(f2.qcomTrajectory || "").trim().replace(/\s+/g, " ").slice(0, 100);
  const items = [
    item(
      hasMrp ? "done" : "pending",
      hasMrp ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared",
      { formAdmin: !hasMrp }
    ),
    item(marginOk ? "done" : "pending", marginText, { formAdmin: !hasMargin }),
    item(
      hasQcom ? "done" : "pending",
      hasQcom
        ? `Quick-commerce 3-year terms recorded — ${qcomSnippet}${qcomSnippet.length >= 100 ? "…" : ""}`
        : "Quick-commerce 3-year terms assumption missing — describe take-rate, commission and delivery-fee trajectory for this pack's MRP (v4)",
      { formAdmin: !hasQcom }
    ),
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
  const { category, f1 = {}, f2 = {}, f3 = {}, f4 = {}, f5 = {}, f6 = {} } = proposition || {};
  const division = divisionForScore(proposition);
  const researchFindings =
    proposition?.researchFindings && typeof proposition.researchFindings === "object"
      ? proposition.researchFindings
      : {};
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every((k) => (proposition || {})[k]?.forumVerdict === "pass");
  const [f2Check, f5Check] = await Promise.all([
    checkF2(f2, division, category),
    checkF5(f5, division, researchFindings.f5 || {}, category),
  ]);
  const result = {
    f1: checkF1(f1, researchFindings.f1 || {}),
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
