import { prepareIdeaInput } from "./extractAttachment.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { runPriceResearch } from "./filters/runPriceResearch.js";
import { runSizingResearch } from "./filters/runSizingResearch.js";
import { detectDivision } from "./npdMaster.js";

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

function parseOwnPricePerUnit(mrpGrammage) {
  const raw = String(mrpGrammage || "").trim();
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const m = raw.match(/([\d.]+)\s*(?:\/|per)\s*([\d.]+)\s*(g|ml|kg|l)\b/i);
  if (m) {
    let price = Number(m[1]);
    let qty = Number(m[2]);
    const unit = m[3].toLowerCase();
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
    if (unit === "kg") qty *= 1000;
    if (unit === "l") qty *= 1000;
    return price / qty;
  }
  return null;
}

/**
 * @param {object} filter1
 * @param {object} filter4
 * @param {object|null} priceResearch
 * @param {object|null} sizingResearch
 */
export function buildSuggestions(filter1 = {}, filter4 = {}, priceResearch = null, sizingResearch = null) {
  const growthRoute =
    filter1.growthStage === "low-penetration"
      ? "low-penetration"
      : filter1.growthStage === "mature-cluttered"
        ? "mature-share-take"
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
      category: filter1.generalCategory || null,
    }),
    f1: compactFields({
      declaredAttribute: filter1.attribute || null,
      benchmark: filter1.benchmarkName || null,
      declaredGap: filter1.estimatedPointsBeat ?? null,
      gapDerivation: [filter1.gapClaim, filter1.gapMagnitude].filter(Boolean).join(" — ") || null,
      growthRoute,
      growthArgument:
        [
          Number.isFinite(Number(filter1.categoryTamCr))
            ? `Category working size ₹${Number(filter1.categoryTamCr)} Cr.`
            : null,
          filter1.verdictReason || filter1.categoryGrowthNote,
        ]
          .filter(Boolean)
          .join(" ") || null,
      parityExceptions:
        filter1.parityRisk === "major" || filter1.parityRisk === "minor"
          ? `AI flagged a ${filter1.parityRisk} parity risk — review before naming exceptions here.`
          : null,
    }),
    // F2 stays almost entirely manual — no MRP / COGS / net margin / Finance suggestions.
    f3: compactFields({
      modelledVolumeLoss: filter1.estimatedVolumeLossPct ?? null,
      priceIndexVsBenchmark: priceResearch?.priceIndexVsBenchmark ?? null,
    }),
    f4: compactFields({
      formatTrajectory,
      channelShiftExposure: filter4.digitalProxySignal || null,
      threatRegister:
        [filter4.threatRegister, filter4.evidenceSummary, filter4.analogTransferSignal, filingNote]
          .filter(Boolean)
          .join("\n") || null,
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
  const ownPricePerUnit = parseOwnPricePerUnit(proposition.f2?.mrpGrammage);

  const declaredAttrs = [
    proposition.f1?.declaredAttribute,
    proposition.f1?.declaredAttribute2,
    proposition.f1?.declaredAttribute3,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const primaryAttribute = declaredAttrs[0] || "";

  const [filter1, filter4] = await Promise.all([
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

  const resolvedDivision =
    division || proposition.division || detectDivision(prepared.idea || "") || "";
  const benchmarkName = String(filter1.benchmarkName || humanBenchmark || "").trim();

  const [priceResearch, sizingResearch] = await Promise.all([
    benchmarkName
      ? runPriceResearch({
          benchmarkName,
          ownPricePerUnit,
          ideaText: prepared.idea,
        })
      : null,
    runSizingResearch({ ideaText: prepared.idea, division: resolvedDivision }),
  ]);

  return {
    division: resolvedDivision,
    suggestions: buildSuggestions(filter1, filter4, priceResearch, sizingResearch),
    notCovered: AI_FIRST_PASS_NOT_COVERED,
    sources: [
      ...(filter1.sources || []),
      ...(filter4.sources || []),
      ...(priceResearch?.sources || []),
      ...(sizingResearch?.sources || []),
    ],
  };
}
