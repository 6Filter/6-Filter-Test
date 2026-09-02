/**
 * Server-only. Do not import this module from anything under src/ —
 * Vite would ship the floors and the arithmetic to every browser.
 */
import { getDivisionMarginFloor, getDivisionRevenueTarget } from "./divisionConfig.js";
import { checkF1, checkF3, checkF4, checkF6 } from "./filterChecks.js";
import {
  computeGoNoGo,
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

function item(status, text) {
  return { status, text };
}

function overallLabel(items, belowFloor = false) {
  if (belowFloor) return "Below floor";
  if (items.length === 0) return "Evidence missing";
  if (items.every((i) => i.status === "done")) return "Cleared";
  return "Evidence missing";
}

async function checkF2(f2 = {}, division) {
  if (!division) {
    return {
      checkLabel: "Evidence missing",
      items: [
        item(
          "pending",
          "Division could not be determined automatically — the idea doesn't clearly match any of CavinKare's divisions."
        ),
        item(
          f2.mrpInr && f2.grammage ? "done" : "pending",
          f2.mrpInr && f2.grammage
            ? `MRP ₹${f2.mrpInr} · ${f2.grammage}`
            : "MRP and grammage not yet declared"
        ),
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

  const floor = await getDivisionMarginFloor(division);
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
    item(
      f2.mrpInr && f2.grammage ? "done" : "pending",
      f2.mrpInr && f2.grammage
        ? `MRP ₹${f2.mrpInr} · ${f2.grammage}`
        : "MRP and grammage not yet declared"
    ),
    item(marginOk ? "done" : "pending", marginText),
    item(f2.qcomTrajectory ? "done" : "pending", f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)"),
    item(f2.financeSigned ? "done" : "pending", f2.financeSigned ? "Finance signature recorded" : "Finance signature pending — missing evidence counts as FAIL (v4)"),
  ];
  const belowFloor = hasMargin && floor != null && !marginOk;
  return { checkLabel: overallLabel(items, belowFloor), items };
}

async function checkF5(f5 = {}, division, findings = {}) {
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
    item(sizingDone ? "done" : "pending", sizingText),
    item(f5.cmiHeadSigned ? "done" : "pending", f5.cmiHeadSigned ? "CMI signature recorded" : "CMI signature pending on the sizing model — out-of-range factors must be argued in writing"),
  ];
  return { checkLabel: overallLabel(items), items };
}

export async function computeAllAdvisoryChecks(proposition) {
  const { division, f1 = {}, f2 = {}, f3 = {}, f4 = {}, f5 = {}, f6 = {} } = proposition || {};
  const researchFindings =
    proposition?.researchFindings && typeof proposition.researchFindings === "object"
      ? proposition.researchFindings
      : {};
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every((k) => (proposition || {})[k]?.forumVerdict === "pass");
  const [f2Check, f5Check] = await Promise.all([
    checkF2(f2, division),
    checkF5(f5, division, researchFindings.f5 || {}),
  ]);
  return {
    f1: checkF1(f1, researchFindings.f1 || {}),
    f2: f2Check,
    f3: checkF3(f2, f3, researchFindings.f3 || {}),
    f4: checkF4(f4, researchFindings.f4 || {}),
    f5: f5Check,
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
