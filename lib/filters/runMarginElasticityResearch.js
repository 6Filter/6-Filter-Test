import { getDivisionMarginFloor } from "../divisionConfig.js";
import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { skillTextForProvider, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";
import { researchInflation } from "./runVolumeLossResearch.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"categoryAvgPriceInr":0,"packSize":"...","sourceTier":1,' +
  '"basis":"one sentence on how the average was obtained",' +
  '"sources":[{"title":"...","url":"..."}]}';

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asTier(v) {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 3;
}

/**
 * Invert Part 43's inflation-matching volume-loss observation into a rupee
 * price ceiling at `targetVolumeLossPct`. Never fabricates elasticity.
 */
export function solveForVolumeLossCeiling({
  categoryAvgPrice,
  inflationRatePct,
  volumeLossAtInflationPct,
  targetVolumeLossPct = 10,
} = {}) {
  const avg = asNum(categoryAvgPrice);
  const inflation = asNum(inflationRatePct);
  const loss = asNum(volumeLossAtInflationPct);
  const target = asNum(targetVolumeLossPct) ?? 10;

  if (avg == null || avg <= 0) {
    return {
      priceCeiling: null,
      reason:
        "No category average price at any source tier — cannot convert a volume-loss ceiling into a rupee price without fabricating a number.",
    };
  }
  if (inflation == null || inflation <= 0) {
    return {
      priceCeiling: null,
      reason:
        "No usable inflation rate from Part 43 research — cannot invert the elasticity relationship without fabricating a number.",
    };
  }
  if (loss == null || loss <= 0) {
    return {
      priceCeiling: null,
      reason:
        "No elasticity data at any source tier — cannot solve a 10% volume-loss ceiling without fabricating a number.",
    };
  }

  const priceIncreasePct = (target * inflation) / loss;
  const priceCeiling = avg * (1 + priceIncreasePct / 100);
  if (!Number.isFinite(priceCeiling) || priceCeiling <= 0) {
    return {
      priceCeiling: null,
      reason:
        "The inverted 10% volume-loss ceiling was not a usable price — cannot convert it into a margin without fabricating a number.",
    };
  }
  return { priceCeiling, priceIncreasePct };
}

export async function researchCategoryAvgPrice({ category = "", ideaText = "" } = {}) {
  const researchSystem =
    skillTextForProvider(
      "six-filter-test/SKILL.md",
      "six-filter-test/references/filter-checklist-research.md"
    ) +
    "\n\n---\n\n" +
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch the typical consumer selling price (₹ per pack, equal grammage)\n" +
    "for this Indian FMCG category. Apply the source hierarchy: a publicly-cited\n" +
    "Nielsen or Kantar average first; else category-intelligence engines; else an\n" +
    "e-com listing average as last resort. Never write unsure or not available.\n" +
    "Always include sourceTier (1|2|3).";

  const userText =
    `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n\n` +
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 800)}\n\n` +
    "Return categoryAvgPriceInr as the typical pack price in rupees at a named packSize.";

  const jsonSystem =
    "You are the structuring step for F3 category average price. Do not search. " +
    "Use only the research brief. Never omit sourceTier or categoryAvgPriceInr. " +
    STRUCTURE_SYSTEM;

  const { parsed, sources, error } = await researchThenJson({
    label: "f3-category-avg-price",
    researchSystem,
    researchUser: userText,
    jsonSystem,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 2048,
    jsonMaxTokens: 1024,
    maxUses: 4,
  });

  if (!parsed) {
    console.warn(`[primus/f3-category-avg-price] no structured result error=${error || "unknown"}`);
    return {
      priceInr: null,
      packSize: null,
      sourceTier: null,
      basis: "Category average price research returned no structured result.",
      sources: sources || [],
    };
  }

  const priceInr = asNum(parsed.categoryAvgPriceInr);
  const sourceTier = asTier(parsed.sourceTier);
  const packSize = stripCavinKareMentions(String(parsed.packSize || "").trim()) || null;
  const basis = stripCavinKareMentions(String(parsed.basis || "").trim()) || null;
  console.log(`[primus/f3-category-avg-price] price=${priceInr} tier=${sourceTier} pack=${packSize}`);
  return {
    priceInr,
    packSize,
    sourceTier,
    basis,
    sources: mergeSources(parsed.sources, sources),
  };
}

export async function runMarginElasticityResearch({
  cogsAtScale,
  division,
  category = "",
  ideaText = "",
} = {}) {
  const cogs = asNum(cogsAtScale);
  const divisionName = String(division || "").trim();

  const [categoryAvgPrice, inflation, minMarginPct] = await Promise.all([
    researchCategoryAvgPrice({ category, ideaText }),
    researchInflation({ category, ideaText }),
    getDivisionMarginFloor(divisionName),
  ]);

  const sources = mergeSources(categoryAvgPrice?.sources, inflation?.sources);
  const floor = minMarginPct == null ? null : Number(minMarginPct);
  const min = Number.isFinite(floor) ? floor : null;

  if (cogs == null || cogs <= 0) {
    return {
      minMarginPct: min,
      maxMarginPct: null,
      basis:
        "COGS at scale is not yet available, so 5-year inflated cost cannot be converted into a margin ceiling.",
      sources,
      aiSourced: true,
    };
  }

  const ceiling = solveForVolumeLossCeiling({
    categoryAvgPrice: categoryAvgPrice?.priceInr,
    inflationRatePct: inflation?.ratePct,
    volumeLossAtInflationPct: inflation?.volumeLossPct,
    targetVolumeLossPct: 10,
  });

  if (ceiling.priceCeiling == null) {
    return {
      minMarginPct: min,
      maxMarginPct: null,
      basis: ceiling.reason,
      sources,
      aiSourced: true,
    };
  }

  const projectedCogs5yr = cogs * Math.pow(1 + Number(inflation.ratePct) / 100, 5);
  const maxMarginPct = ((ceiling.priceCeiling - projectedCogs5yr) / ceiling.priceCeiling) * 100;
  if (!Number.isFinite(maxMarginPct)) {
    return {
      minMarginPct: min,
      maxMarginPct: null,
      basis:
        "The 10% volume-loss price ceiling and 5-year inflated COGS did not produce a usable margin — not fabricating a number.",
      sources,
      aiSourced: true,
    };
  }

  const cited = categoryAvgPrice?.sourceTier === 1;
  const divisionLabel = divisionName || "matched";
  const inflationSource = inflation?.source || "researched inflation";
  return {
    minMarginPct: min,
    maxMarginPct,
    basis: `Min from the ${divisionLabel} division floor (v4, non-negotiable). Max from ${
      cited ? "cited" : "modelled"
    } category pricing, ${inflation.ratePct}% inflation (${inflationSource}) projected over 5 years, capped at the 10% volume-loss ceiling.`,
    sources,
    aiSourced: true,
  };
}
