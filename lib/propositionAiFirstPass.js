import { prepareIdeaInput } from "./extractAttachment.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { runMarginElasticityResearch } from "./filters/runMarginElasticityResearch.js";
import { runSizingResearch } from "./filters/runSizingResearch.js";
import { ownPricePerUnitFromF2, runCostEstimate } from "./filters/runCostEstimate.js";
import { computeDerivedMrp } from "./f2Derived.js";
import { detectDivision } from "./npdMaster.js";
import {
  buildResearchFindings,
  cachedCostEstimateFrom,
  costEstimateFromResearch,
  f2SuggestionsFromCostEstimate,
  hasCachedCostEstimate,
  logCostEstimateCache,
} from "./researchFindings.js";
import { stripCavinKareMentions, sanitizeAiValue } from "./sanitizeAiText.js";
import { normalizeTechShiftRisk } from "./techShiftRisk.js";
import { getResearchCache } from "./db.js";
import { researchHashFor } from "./researchCache.js";
import { attachNoCompetitorCheck, getOrRunNoCompetitorCheck } from "./filters/runNoCompetitorCheck.js";
import { isClaimingNoCompetitor } from "./filterChecks.js";

export const AI_FIRST_PASS_NOT_COVERED = [
  {
    filter: "F6",
    reason:
      "Filter 6 is validation approval only (lab, consumer, pack). This engine does not score it.",
  },
];

function compactFields(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

/**
 * @param {object} filter1
 * @param {object} filter4
 * @param {object|null} _priceResearch
 * @param {object|null} sizingResearch
 * @param {object|null} costResearch
 * @param {object|null} marginElasticityResearch
 */
export function buildSuggestions(
  filter1 = {},
  filter4 = {},
  _priceResearch = null,
  sizingResearch = null,
  costResearch = null,
  marginElasticityResearch = null
) {
  const growthRoute =
    filter1.growthStage === "low-penetration"
      ? "penetration"
      : filter1.growthStage === "mature-cluttered"
        ? "frequency"
        : null;

  const techShiftRisk = normalizeTechShiftRisk(
    filter4.techShiftRisk || { dimensions: filter4.dimensions, sources: filter4.sources }
  );

  return {
    top: compactFields({
      category: stripCavinKareMentions(filter1.generalCategory || null),
    }),
    f1: compactFields({
      declaredAttribute: filter1.attribute || null,
      benchmark: filter1.benchmarkName || null,
      declaredGap: filter1.estimatedPointsBeat ?? null,
      gapDerivation: stripCavinKareMentions(
        [filter1.gapClaim, filter1.gapMagnitude].filter(Boolean).join(" — ") || null
      ),
      growthRoute,
      growthArgument: stripCavinKareMentions(
        [
          Number.isFinite(Number(filter1.categoryTamCr))
            ? `Category working size ₹${Number(filter1.categoryTamCr)} Cr.`
            : null,
          filter1.verdictReason || filter1.categoryGrowthNote,
        ]
          .filter(Boolean)
          .join(" ") || null
      ),
      parityExceptions:
        filter1.parityRisk === "major" || filter1.parityRisk === "minor"
          ? `AI flagged a ${filter1.parityRisk} parity risk — review before naming exceptions here.`
          : null,
    }),
    // F2 is auto-filled on the client (Part 32) — still returned here for the autofill merge.
    f2: compactFields({
      cogsAtScale: costResearch?.estimatedCogsPerUnitInr ?? null,
      netMarginAtScale: costResearch?.estimatedNetMarginPct ?? null,
      gstRatePct: costResearch?.estimatedGstRatePct ?? null,
      gstBasis: costResearch?.gstBasis || null,
      grammage: costResearch?.estimatedGrammage || null,
      qcomTrajectory: stripCavinKareMentions(costResearch?.qcomTrajectory || null),
      mrpInr: marginElasticityResearch?.recommendedMrpInr ?? costResearch?.estimatedMrpInr ?? null,
      competitorPriceInr: costResearch?.competitorPriceInr ?? null,
      competitorPackSize: costResearch?.competitorPackSize || null,
    }),
    f3: compactFields({
      marginElasticity: marginElasticityResearch || null,
    }),
    f4: compactFields({
      techShiftRisk: techShiftRisk
        ? {
            ...techShiftRisk,
            dimensions: Object.fromEntries(
              Object.entries(techShiftRisk.dimensions || {}).map(([key, d]) => [
                key,
                { risk: d?.risk, reason: stripCavinKareMentions(d?.reason) },
              ])
            ),
          }
        : null,
    }),
    f5: compactFields({
      householdsReachedY3Mn: sizingResearch?.householdsReachedY3Mn ?? null,
      trialRatePct: sizingResearch?.trialRatePct ?? null,
      repeatConversionPct: sizingResearch?.repeatConversionPct ?? null,
      purchaseFrequencyYr: sizingResearch?.purchaseFrequencyYr ?? null,
      avgPackValueInr: sizingResearch?.avgPackValueInr ?? null,
    }),
  };
}

/**
 * One-shot research used by Submit. Does not write forumVerdict / finalVerdict.
 */
function researchDocForHash(proposition = {}, division = "") {
  return {
    ...proposition,
    division: division || proposition.division || "",
  };
}

function cachedResearchResult(cached, fallbackDivision = "") {
  const cost = cachedCostEstimateFrom(cached);
  const suggestions = {
    ...(cached.suggestions || {}),
    f2: {
      ...(cached.suggestions?.f2 || {}),
      ...f2SuggestionsFromCostEstimate(cost),
    },
  };
  const findings = cached.researchFindings && typeof cached.researchFindings === "object"
    ? {
        ...cached.researchFindings,
        f2: {
          ...(cached.researchFindings.f2 || {}),
          costEstimate: cost || cached.researchFindings.f2?.costEstimate || null,
        },
      }
    : { f2: { costEstimate: cost } };
  return {
    division: cached.division || fallbackDivision || "",
    suggestions: sanitizeAiValue(suggestions),
    researchFindings: sanitizeAiValue(findings),
    notCovered: cached.notCovered || AI_FIRST_PASS_NOT_COVERED,
    sources: Array.isArray(cached.sources) ? cached.sources : findings.sources || [],
    fromCache: true,
  };
}

export async function runPropositionResearch({
  ideaText = "",
  attachment = null,
  proposition = {},
  division = "",
  inputHash = "",
  forceFresh = false,
}) {
  const hash = String(inputHash || researchHashFor(researchDocForHash(proposition, division))).trim();
  let cachedIncomplete = null;
  if (!forceFresh && hash) {
    try {
      const cached = await getResearchCache(hash);
      const cachedCost = cachedCostEstimateFrom(cached);
      logCostEstimateCache(hash, cachedCost);
      if (hasCachedCostEstimate(cached) && cached?.researchFindings) {
        const merged = await attachNoCompetitorCheck(
          proposition,
          cached.researchFindings,
          { forceFresh }
        );
        return cachedResearchResult({ ...cached, researchFindings: merged }, division || proposition.division || "");
      }
      if (cached?.researchFindings?.f1) cachedIncomplete = cached;
    } catch (e) {
      console.warn(`[primus/cost-estimate] cache lookup failed: ${e.message || e}`);
    }
  } else {
    logCostEstimateCache(hash, null);
  }

  const prepared = await prepareIdeaInput(ideaText, attachment);
  const resolvedDivisionEarly =
    division || proposition.division || "";

  if (cachedIncomplete) {
    const costResearch = await runCostEstimate({
      ideaText: prepared.idea,
      name: proposition.name || "",
      category: proposition.category || "",
      division: resolvedDivisionEarly,
    });
    const costEstimate = costEstimateFromResearch(costResearch);
    const researchFindings = await attachNoCompetitorCheck(
      proposition,
      {
        ...cachedIncomplete.researchFindings,
        f2: { ...(cachedIncomplete.researchFindings.f2 || {}), costEstimate },
      },
      { forceFresh }
    );
    const suggestions = {
      ...(cachedIncomplete.suggestions || {}),
      f2: {
        ...(cachedIncomplete.suggestions?.f2 || {}),
        ...f2SuggestionsFromCostEstimate(costEstimate),
      },
    };
    return {
      division: cachedIncomplete.division || resolvedDivisionEarly,
      suggestions: sanitizeAiValue(suggestions),
      researchFindings: sanitizeAiValue(researchFindings),
      notCovered: cachedIncomplete.notCovered || AI_FIRST_PASS_NOT_COVERED,
      sources: [
        ...(Array.isArray(cachedIncomplete.sources) ? cachedIncomplete.sources : []),
        ...(costResearch?.sources || []),
      ],
      fromCache: false,
    };
  }
  const humanBenchmark = String(proposition.f1?.benchmark || "").trim();
  const ownPricePerUnit = ownPricePerUnitFromF2(proposition.f2 || {});
  const category = proposition.category || "";
  const claimingNoCompetitor = isClaimingNoCompetitor(proposition.f1, proposition.researchFindings?.f1);
  console.log(
    `[primus/no-competitor] trigger claiming=${claimingNoCompetitor} ` +
      `gap=${proposition.f1?.declaredGap ?? "(blank)"} ` +
      `verified=${proposition.researchFindings?.f1?.benchmarkVerified === true} ` +
      `benchmark=${String(proposition.f1?.benchmark || "").slice(0, 80) || "(empty)"}`
  );
  const noCompetitorTask = claimingNoCompetitor
    ? getOrRunNoCompetitorCheck({
        ideaDescription: proposition.ideaDescription || prepared.idea || "",
        category,
        forceFresh,
      })
    : Promise.resolve(null);

  const declaredAttrs = [
    proposition.f1?.declaredAttribute,
    proposition.f1?.declaredAttribute2,
    proposition.f1?.declaredAttribute3,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const primaryAttribute = declaredAttrs[0] || "";

  let [filter1, filter4, noCompetitorCheck] = await Promise.all([
    runFilter1({
      ideaText: prepared.idea,
      category,
      attribute: primaryAttribute,
      attributes: declaredAttrs,
      benchmarkName: humanBenchmark,
      isPureCommodity: Boolean(proposition.f1?.pureCommodity),
      pricePerUnit: ownPricePerUnit,
      image: prepared.image,
    }),
    runFilter4({
      ideaText: prepared.idea,
      category,
      image: prepared.image,
    }),
    noCompetitorTask,
  ]);

  const resolvedDivision =
    division || proposition.division || detectDivision(prepared.idea || "") || "";

  let [sizingResearch, costResearch] = await Promise.all([
    runSizingResearch({ ideaText: prepared.idea, category, division: resolvedDivision }),
    runCostEstimate({
      ideaText: prepared.idea,
      name: proposition.name || "",
      category: proposition.category || "",
      division: resolvedDivision,
    }),
  ]);

  const cogsAtScale =
    proposition.f2?.cogsAtScale != null && String(proposition.f2.cogsAtScale).trim() !== ""
      ? Number(proposition.f2.cogsAtScale)
      : costResearch?.estimatedCogsPerUnitInr ?? null;

  const netMarginAtScale =
    proposition.f2?.netMarginAtScale != null && String(proposition.f2.netMarginAtScale).trim() !== ""
      ? Number(proposition.f2.netMarginAtScale)
      : costResearch?.estimatedNetMarginPct ?? null;

  const grammage =
    (proposition.f2?.grammage && String(proposition.f2.grammage).trim()) ||
    costResearch?.estimatedGrammage ||
    "";

  const gstForMrp =
    proposition.f2?.gstRatePct != null && String(proposition.f2.gstRatePct).trim() !== ""
      ? Number(proposition.f2.gstRatePct)
      : costResearch?.estimatedGstRatePct ?? null;
  const humanMrp =
    proposition.f2?.mrpInr != null && String(proposition.f2.mrpInr).trim() !== ""
      ? Number(proposition.f2.mrpInr)
      : null;
  const derivedMrp = computeDerivedMrp(cogsAtScale, netMarginAtScale, gstForMrp);
  const mrpInr = humanMrp != null && Number.isFinite(humanMrp) && humanMrp > 0 ? humanMrp : derivedMrp;

  const marginElasticityResearch = await runMarginElasticityResearch({
    cogsAtScale,
    netMarginAtScale,
    division: resolvedDivision,
    category: proposition.category || filter1.generalCategory || "",
    ideaText: prepared.idea,
    grammage,
    mrpInr,
    competitorPriceInr: costResearch?.competitorPriceInr,
    competitorPackSize: costResearch?.competitorPackSize,
  });

  filter1.verdictReason = stripCavinKareMentions(filter1.verdictReason);
  filter1.generalCategory = stripCavinKareMentions(filter1.generalCategory);
  filter4.verdictReason = stripCavinKareMentions(filter4.verdictReason);
  filter4.obsolescenceVerdict = stripCavinKareMentions(filter4.obsolescenceVerdict);
  if (filter4.techShiftRisk?.dimensions) {
    for (const d of Object.values(filter4.techShiftRisk.dimensions)) {
      if (d && typeof d === "object") d.reason = stripCavinKareMentions(d.reason);
    }
  }

  const researchFindings = await attachNoCompetitorCheck(
    proposition,
    buildResearchFindings({
      filter1: { ...filter1, noCompetitorCheck },
      filter4,
      marginElasticityResearch,
      sizingResearch,
      costResearch,
    }),
    { forceFresh }
  );

  const suggestions = buildSuggestions(
    filter1,
    filter4,
    null,
    sizingResearch,
    costResearch,
    marginElasticityResearch
  );
  suggestions.top.category = stripCavinKareMentions(suggestions.top?.category);
  if (suggestions.f1) {
    suggestions.f1.growthArgument = stripCavinKareMentions(suggestions.f1.growthArgument);
    suggestions.f1.gapDerivation = stripCavinKareMentions(suggestions.f1.gapDerivation);
  }
  if (suggestions.f2) {
    suggestions.f2.qcomTrajectory = stripCavinKareMentions(suggestions.f2.qcomTrajectory);
    suggestions.f2.gstBasis = stripCavinKareMentions(suggestions.f2.gstBasis);
  }
  if (suggestions.f3?.marginElasticity?.basis) {
    suggestions.f3.marginElasticity.basis = stripCavinKareMentions(
      suggestions.f3.marginElasticity.basis
    );
  }
  if (suggestions.f3?.marginElasticity?.competitiveNote) {
    suggestions.f3.marginElasticity.competitiveNote = stripCavinKareMentions(
      suggestions.f3.marginElasticity.competitiveNote
    );
  }
  if (suggestions.f4?.techShiftRisk?.dimensions) {
    suggestions.f4.techShiftRisk = normalizeTechShiftRisk(suggestions.f4.techShiftRisk);
    for (const d of Object.values(suggestions.f4.techShiftRisk.dimensions)) {
      if (d && typeof d === "object") d.reason = stripCavinKareMentions(d.reason);
    }
  }

  return {
    division: resolvedDivision,
    suggestions: sanitizeAiValue(suggestions),
    researchFindings: sanitizeAiValue(researchFindings),
    notCovered: AI_FIRST_PASS_NOT_COVERED,
    sources: [
      ...(filter1.sources || []),
      ...(filter4.sources || []),
      ...(marginElasticityResearch?.sources || []),
      ...(sizingResearch?.sources || []),
      ...(costResearch?.sources || []),
    ],
  };
}
