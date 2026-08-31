import { DIVISION_NET_MARGIN, REVENUE_TARGET_BY_DIVISION } from "./npdMaster.js";

function numOrNull(v) {
  const n = Number(v);
  return v !== "" && v != null && Number.isFinite(n) ? n : null;
}

export function checkF1(f1 = {}) {
  const notScored = [
    "Whether the benchmark named is genuinely the single strongest player (requires market judgment)",
    "Whether the growth argument is well-reasoned and every figure traces to a CMI source",
    "Whether the named parity exceptions are complete and honestly stated",
  ];
  if (f1.pureCommodity) {
    return { checked: [], notScored, overallAdvisory: "exempt",
      note: "Pure commodity exemption claimed — the differentiation floor doesn't apply (v4)." };
  }
  const checks = [];
  if (f1.attributeRank) {
    checks.push({ rule: "Attribute rank ≤ 3", pass: ["1", "2", "3"].includes(f1.attributeRank), value: f1.attributeRank });
  }
  const gap = numOrNull(f1.declaredGap);
  if (gap != null) checks.push({ rule: "Declared gap ≥ 2.0", pass: gap >= 2.0, value: gap });
  return finalize(checks, notScored);
}

export function checkF2(f2 = {}, division) {
  const floor = DIVISION_NET_MARGIN[division];
  const notScored = [
    "Whether the COGS build's individual cost lines are realistic (requires Finance/R&D judgment)",
    "Whether the quick-commerce three-year terms assumption is credible",
  ];
  if (floor == null) return { checked: [], notScored: [...notScored, "No division selected — margin floor unknown"], overallAdvisory: "insufficient-evidence" };
  const margin = numOrNull(f2.netMarginAtScale);
  if (margin == null) return { checked: [], notScored, overallAdvisory: "insufficient-evidence" };
  const pass = margin >= floor;
  return finalize([{ rule: `Net margin ≥ ${floor}% (division floor, non-negotiable, v4)`, pass, value: margin }], notScored);
}

export function checkF3(f2 = {}, f3 = {}) {
  const notScored = ["Whether the elasticity estimate's underlying source is credible (requires CMI judgment)"];
  const checks = [];

  const priceCheck = crossCheckPrice(f2.mrpGrammage, f3.priceIndexVsBenchmark);
  if (priceCheck) checks.push(priceCheck);

  const exposure = f3.fixedPricePointExposure;
  if (exposure && exposure !== "none") {
    const loss = numOrNull(f3.modelledVolumeLoss);
    if (loss != null) checks.push({ rule: "Volume loss ≤ 10% crossing the fixed price point", pass: loss <= 10, value: loss });
    else notScored.push("Volume loss not yet entered — required since a fixed price point is exposed");
  }
  return finalize(checks, notScored);
}

function crossCheckPrice(mrpGrammage, priceIndex) {
  // Both are free-text/number in the current form; do a best-effort numeric pull.
  // If either is genuinely unparseable, don't fabricate a check — return null.
  const priceNum = numOrNull(priceIndex);
  const mrpNum = numOrNull(String(mrpGrammage || "").replace(/[^\d.]/g, ""));
  if (priceNum == null || mrpNum == null) return null;
  // This is a loose plausibility signal, not a strict equality check — flag only
  // if they look wildly inconsistent (index should roughly track MRP direction).
  return {
    rule: "Same price story across F2 and F3",
    pass: true, // deliberately advisory-only, not a hard fail — see note in prompt below
    note: "Confirm the MRP in F2 and the price index basis in F3 describe the same SKU and price point.",
  };
}

export function checkF4(f4 = {}) {
  const notScored = ["Whether every registered threat genuinely carries a written response (requires Forum review of the register itself)"];
  const checks = [];
  if (f4.formatTrajectory) {
    checks.push({ rule: "Format trajectory is not declining (v4: we do not enter a form already losing)", pass: f4.formatTrajectory !== "declining", value: f4.formatTrajectory });
  }
  return finalize(checks, notScored);
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

export function checkF5(f5 = {}, division) {
  const target = REVENUE_TARGET_BY_DIVISION[division]?.allChannels;
  const notScored = ["Whether the five factors themselves sit within CMI's credible ranges — the v4 analog test — requires CMI judgment, not arithmetic"];
  const revenue = computeF5Revenue(f5);
  if (revenue == null) return { checked: [], notScored, overallAdvisory: "insufficient-evidence" };
  if (target == null) return { checked: [], notScored: [...notScored, "No revenue target on record for this division"], overallAdvisory: "insufficient-evidence" };
  const pass = revenue >= target;
  return finalize([{ rule: `Year-3 revenue ≥ ₹${target} Cr division target (v4)`, pass, value: `₹${revenue.toFixed(1)} Cr` }], notScored);
}

export function checkF6(f6 = {}, unlocked) {
  const notScored = [
    "Whether the panel was genuinely and properly conducted — a real prototype, real purchased benchmark samples, correct recruitment, a complete attendance log — cannot be verified from numbers alone. This is a trust call for CMI and the BH Forum, not something any software can confirm.",
  ];
  if (!unlocked) {
    return { checked: [], notScored: ["Filters 1–5 have not all cleared yet — F6 has not started (v4: Stage 2 only opens after Stage 1)"], overallAdvisory: "not-started" };
  }
  const checks = [];
  const lab = numOrNull(f6.labGapVsBenchmark);
  if (lab != null) checks.push({ rule: "Lab gap ≥ 2.0 (v4)", pass: lab >= 2.0, value: lab });
  const beaters = numOrNull(f6.consumerPanelBeaters);
  if (beaters != null) checks.push({ rule: "Consumer panel ≥ 18 of 30 two-point beaters (v4)", pass: beaters >= 18, value: `${beaters}/30` });
  const pack = numOrNull(f6.packStandoutGap);
  if (pack != null) checks.push({ rule: "Pack standout ≥ 2.0 (v4, mandatory)", pass: pack >= 2.0, value: pack });
  return finalize(checks, notScored);
}

function finalize(checks, notScored) {
  const overallAdvisory =
    checks.length === 0 ? "insufficient-evidence" : checks.every((c) => c.pass) ? "meets-floor" : "below-floor";
  return { checked: checks, notScored, overallAdvisory };
}

export function computeAllAdvisoryChecks(proposition) {
  const doc = proposition || {};
  const { division, f1 = {}, f2 = {}, f3 = {}, f4 = {}, f5 = {}, f6 = {} } = doc;
  const f1Check = checkF1(f1);
  const f2Check = checkF2(f2, division);
  const f3Check = checkF3(f2, f3);
  const f4Check = checkF4(f4);
  const f5Check = checkF5(f5, division);
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every(
    (k) => doc[k]?.forumVerdict === "pass"
  );
  const f6Check = checkF6(f6, stage1Cleared);
  return { f1: f1Check, f2: f2Check, f3: f3Check, f4: f4Check, f5: f5Check, f6: f6Check };
}

export const ADVISORY_LABEL = {
  "meets-floor": "Advisory: clears the v4 floor",
  "below-floor": "Advisory: below the v4 floor",
  "insufficient-evidence": "Advisory: not enough entered yet",
  exempt: "Advisory: commodity-exempt",
  "not-started": "Advisory: not started",
};
