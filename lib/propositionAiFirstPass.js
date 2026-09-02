import { prepareIdeaInput } from "./extractAttachment.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { runMarginElasticityResearch } from "./filters/runMarginElasticityResearch.js";
import { runSizingResearch } from "./filters/runSizingResearch.js";
import { ownPricePerUnitFromF2, runCostEstimate } from "./filters/runCostEstimate.js";
import { detectDivision } from "./npdMaster.js";
import { currentLlm } from "./llmContext.js";
import { buildResearchFindings } from "./researchFindings.js";
import { stripCavinKareMentions, sanitizeAiValue } from "./sanitizeAiText.js";

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

  const formatTrajectory =
    filter4.formatTrendDirection === "stable"
      ? "flat"
      : filter4.formatTrendDirection || null;

  const filings = Array.isArray(filter4.trademarkFilingsFound) ? filter4.trademarkFilingsFound : [];
  const filingNote = filings.length
    ? `Trademark filings found: ${filings.map((f) => f?.applicant).filter(Boolean).join(", ")}`
    : null;

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
    }),
    f3: compactFields({
      marginElasticity: marginElasticityResearch || null,
    }),
    f4: compactFields({
      formatTrajectory,
      channelShiftExposure: filter4.digitalProxySignal || null,
      threatRegister: stripCavinKareMentions(
        [filter4.threatRegister, filter4.evidenceSummary, filter4.analogTransferSignal, filingNote]
          .filter(Boolean)
          .join("\n") || null
      ),
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
export async function runPropositionResearch({
  ideaText = "",
  attachment = null,
  proposition = {},
  division = "",
}) {
  const prepared = await prepareIdeaInput(ideaText, attachment);
  const humanBenchmark = String(proposition.f1?.benchmark || "").trim();
  const ownPricePerUnit = ownPricePerUnitFromF2(proposition.f2 || {});

  const declaredAttrs = [
    proposition.f1?.declaredAttribute,
    proposition.f1?.declaredAttribute2,
    proposition.f1?.declaredAttribute3,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const primaryAttribute = declaredAttrs[0] || "";

  const serial = currentLlm() === "groq";
  let filter1;
  let filter4;
  if (serial) {
    filter1 = await runFilter1({
      ideaText: prepared.idea,
      attribute: primaryAttribute,
      benchmarkName: humanBenchmark,
      isPureCommodity: Boolean(proposition.f1?.pureCommodity),
      pricePerUnit: ownPricePerUnit,
      image: prepared.image,
    });
    filter4 = await runFilter4({ ideaText: prepared.idea, image: prepared.image });
  } else {
    [filter1, filter4] = await Promise.all([
      runFilter1({
        ideaText: prepared.idea,
        attribute: primaryAttribute,
        benchmarkName: humanBenchmark,
        isPureCommodity: Boolean(proposition.f1?.pureCommodity),
        pricePerUnit: ownPricePerUnit,
        image: prepared.image,
      }),
      runFilter4({ ideaText: prepared.idea, image: prepared.image }),
    ]);
  }

  const resolvedDivision =
    division || proposition.division || detectDivision(prepared.idea || "") || "";

  let sizingResearch;
  let costResearch;
  if (serial) {
    sizingResearch = await runSizingResearch({
      ideaText: prepared.idea,
      division: resolvedDivision,
    });
    costResearch = await runCostEstimate({
      ideaText: prepared.idea,
      name: proposition.name || "",
      category: proposition.category || "",
      division: resolvedDivision,
    });
  } else {
    [sizingResearch, costResearch] = await Promise.all([
      runSizingResearch({ ideaText: prepared.idea, division: resolvedDivision }),
      runCostEstimate({
        ideaText: prepared.idea,
        name: proposition.name || "",
        category: proposition.category || "",
        division: resolvedDivision,
      }),
    ]);
  }

  const cogsAtScale =
    proposition.f2?.cogsAtScale != null && String(proposition.f2.cogsAtScale).trim() !== ""
      ? Number(proposition.f2.cogsAtScale)
      : costResearch?.estimatedCogsPerUnitInr ?? null;

  const netMarginAtScale =
    proposition.f2?.netMarginAtScale != null && String(proposition.f2.netMarginAtScale).trim() !== ""
      ? Number(proposition.f2.netMarginAtScale)
      : costResearch?.estimatedNetMarginPct ?? null;

  const marginElasticityResearch = await runMarginElasticityResearch({
    cogsAtScale,
    netMarginAtScale,
    division: resolvedDivision,
    category: proposition.category || filter1.generalCategory || "",
    ideaText: prepared.idea,
  });

  filter1.verdictReason = stripCavinKareMentions(filter1.verdictReason);
  filter1.generalCategory = stripCavinKareMentions(filter1.generalCategory);
  filter4.verdictReason = stripCavinKareMentions(filter4.verdictReason);
  filter4.evidenceSummary = stripCavinKareMentions(filter4.evidenceSummary);
  filter4.threatRegister = stripCavinKareMentions(filter4.threatRegister);

  const researchFindings = buildResearchFindings({
    filter1,
    filter4,
    marginElasticityResearch,
    sizingResearch,
  });

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
  if (suggestions.f4) {
    suggestions.f4.threatRegister = stripCavinKareMentions(suggestions.f4.threatRegister);
    suggestions.f4.channelShiftExposure = stripCavinKareMentions(suggestions.f4.channelShiftExposure);
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
