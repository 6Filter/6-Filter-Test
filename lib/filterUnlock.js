/** Progressive unlock thresholds for the proposition form (Part 29 foundation + Part 31). */

import { looksLikePercentCopiedAsMrp } from "./mrpFormula.js";
import { isNamedBenchmark } from "./benchmarkName.js";

function filled(value) {
  if (typeof value === "boolean") return value === true;
  if (value == null) return false;
  return String(value).trim() !== "";
}

export function f1HasEnough(f1 = {}) {
  if (f1.pureCommodity) return true;
  return (
    filled(f1.declaredAttribute) &&
    isNamedBenchmark(f1.benchmark) &&
    filled(f1.declaredGap) &&
    filled(f1.growthRoute) &&
    filled(f1.growthArgument)
  );
}

/** COGS + net margin only — MRP, grammage, and Finance signature do not gate later filters. */
export function f2HasEnough(f2 = {}) {
  return filled(f2.cogsAtScale) && filled(f2.netMarginAtScale);
}

export function f2HasCogsAndMargin(f2 = {}) {
  return f2HasEnough(f2);
}

export function f3HasEnough(f3 = {}) {
  if (looksLikePercentCopiedAsMrp(f3.marginElasticity)) return false;
  const max = f3.marginElasticity?.maxMarginPct;
  return max != null && max !== "" && Number.isFinite(Number(max));
}

export function f4HasEnough(f4 = {}) {
  return filled(f4.formatTrajectory) && filled(f4.threatRegister) && Boolean(f4.threatsAnswered);
}

export function f5HasEnough(f5 = {}) {
  return (
    filled(f5.householdsReachedY3Mn) &&
    filled(f5.trialRatePct) &&
    filled(f5.repeatConversionPct) &&
    filled(f5.purchaseFrequencyYr) &&
    filled(f5.avgPackValueInr)
  );
}

export function f6HasEnough(f6 = {}, stage1Cleared = false) {
  // Until Stage 1 is Forum-cleared, F6 correctly sits at "Awaiting panels".
  if (!stage1Cleared) return true;
  return (
    filled(f6.labGapVsBenchmark) &&
    filled(f6.consumerPanelBeaters) &&
    filled(f6.packStandoutGap)
  );
}

export function hasMarketResearchProof(doc = {}) {
  const proof = doc.marketResearchProof;
  return Boolean(proof && (proof.data || proof.name));
}

export function hasGoClassification(doc = {}) {
  return doc?.goNoGo?.classification === "GO";
}

/**
 * @param {"f1"|"f2"|"f3"|"f4"|"proof-gate"|"f5"|"f6"|"send-manager"} key
 * @param {object} doc mergeProposition-shaped draft
 */
export function isFilterUnlocked(key, doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const f3 = doc.f3 || {};
  const f4 = doc.f4 || {};
  const f5 = doc.f5 || {};
  const f6 = doc.f6 || {};
  const proof = hasMarketResearchProof(doc);
  const go = hasGoClassification(doc);
  const stage1Cleared = ["f1", "f2", "f3", "f4", "f5"].every(
    (k) => doc?.[k]?.forumVerdict === "pass"
  );

  switch (key) {
    case "f1":
      return true;
    case "f2":
      return true;
    case "f3":
      return f1HasEnough(f1) && f2HasEnough(f2);
    case "f4":
      return f1HasEnough(f1) && f2HasEnough(f2) && f3HasEnough(f3);
    case "proof-gate":
      return f1HasEnough(f1) && f2HasEnough(f2) && f3HasEnough(f3) && f4HasEnough(f4);
    case "f5":
    case "f6":
      return go && proof;
    case "send-manager":
      return go && proof && f5HasEnough(f5) && f6HasEnough(f6, stage1Cleared);
    default:
      return false;
  }
}

export function nextLockedHint(doc = {}) {
  if (!isFilterUnlocked("f3", doc)) return "Enter COGS and net margin to unlock Filter 3.";
  if (!isFilterUnlocked("f4", doc)) return "Complete Filter 3 to unlock Filter 4.";
  if (!isFilterUnlocked("proof-gate", doc)) return "Complete Filter 4, then Submit again to refresh the GO / NO-GO score.";
  if (!hasMarketResearchProof(doc)) return null;
  if (!isFilterUnlocked("send-manager", doc)) {
    return "Fill Filters 5 and 6 to unlock Send to Manager.";
  }
  return null;
}
