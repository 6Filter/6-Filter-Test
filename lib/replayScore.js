import { computeAllAdvisoryChecks } from "./propositionScoring.js";
import { computeGoNoGo, scoreAdvisoryChecks, goNoGoIsFloorFailure, filterCheckScore } from "./goNoGo.js";
import { ideaSizeTier, computeIdeaRevenueCr } from "./ideaScale.js";
import { computeDerivedMrp } from "./f2Derived.js";
import { isFilterUnlocked, hasMarketResearchProof, hasManagerApproval } from "./filterUnlock.js";

function round2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function leadOf(check) {
  return String(check?.items?.[0]?.text || "").slice(0, 120);
}

/** Ids, labels, and numbers only. No idea text. */
export async function scoreReplayRecord(proposition) {
  const checks = await computeAllAdvisoryChecks(proposition);
  const score = scoreAdvisoryChecks(checks);
  const labels = {};
  const items = {};
  const leads = {};
  for (const key of ["f1", "f2", "f3", "f4"]) {
    labels[key] = checks[key]?.checkLabel || "";
    const counted = filterCheckScore(checks[key]);
    items[key] = [counted.done, counted.total];
    leads[key] = leadOf(checks[key]);
  }
  const storedMrp = Number(proposition.f2?.mrpInr);
  const mrp =
    Number.isFinite(storedMrp) && storedMrp > 0
      ? storedMrp
      : computeDerivedMrp(
          proposition.f2?.cogsAtScale,
          proposition.f2?.netMarginAtScale,
          proposition.f2?.gstRatePct
        );
  const tier = ideaSizeTier(computeIdeaRevenueCr(proposition.f5 || {}));
  const range = proposition.f3?.marginElasticity || {};
  return {
    id: proposition.id,
    classification: computeGoNoGo(checks),
    pct: score.pct,
    floorFailure: goNoGoIsFloorFailure(checks),
    labels,
    items,
    leads,
    derived: {
      mrp: round2(mrp),
      f3Min: round2(range.minMrpInr),
      f3Max: round2(range.maxMrpInr),
      sizeTier: tier?.tier || null,
    },
    f5Unlocked: isFilterUnlocked("f5", proposition),
    proofUploaded: hasMarketResearchProof(proposition),
    managerApproved: hasManagerApproval(proposition),
    hasFinalSummary: Boolean(proposition.finalSummary?.summaryText),
  };
}
