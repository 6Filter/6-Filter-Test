import { getDivisionMarginFloor } from "../divisionConfig.js";
import { mrpFromMarginPct } from "../mrpFormula.js";
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
        "No elasticity data at any source tier — cannot solve a one-in-ten volume-loss ceiling without fabricating a number.",
    };
  }

  const priceIncreasePct = (target * inflation) / loss;
  const priceCeiling = avg * (1 + priceIncreasePct / 100);
  if (!Number.isFinite(priceCeiling) || priceCeiling <= 0) {
    return {
      priceCeiling: null,
      reason:
        "The inverted one-in-ten volume-loss ceiling was not a usable price — cannot convert it into a margin without fabricating a number.",
    };
  }
  return { priceCeiling, priceIncreasePct };
}

/**
 * Implied launch MRP (ex-GST) vs researched category average.
 * Returns null when COGS, margin, or category average cannot support a statement.
 */
export function competitivePositionNote({
  cogsAtScale,
  netMarginAtScale,
  categoryAvgPriceInr,
} = {}) {
  const cogs = asNum(cogsAtScale);
  const margin = asNum(netMarginAtScale);
  const avg = asNum(categoryAvgPriceInr);
  if (cogs == null || cogs <= 0 || margin == null || margin <= 0 || margin >= 100) return null;
  if (avg == null || avg <= 0) return null;
  const impliedMrp = cogs / (1 - margin / 100);
  if (!Number.isFinite(impliedMrp) || impliedMrp <= 0) return null;
  const competitivePositionPct = ((impliedMrp - avg) / avg) * 100;
  if (!Number.isFinite(competitivePositionPct)) return null;
  const avgLabel = `₹${avg.toFixed(0)}`;
  let competitiveNote;
  if (Math.abs(competitivePositionPct) <= 5) {
    competitiveNote = `Priced within 5% of the category average (${avgLabel}) — competitive.`;
  } else if (competitivePositionPct > 0) {
    competitiveNote = `Priced ${competitivePositionPct.toFixed(0)}% above the category average (${avgLabel}) — a real premium to justify, not just a number.`;
  } else {
    competitiveNote = `Priced ${Math.abs(competitivePositionPct).toFixed(0)}% below the category average (${avgLabel}) — room to move up, or a signal the value story isn't landing yet.`;
  }
  return {
    competitiveNote,
    competitivePositionPct,
    impliedMrpInr: impliedMrp,
    categoryAvgPriceInr: avg,
  };
}

function attachCompetitivePosition(payload, position) {
  return {
    ...payload,
    categoryAvgPriceInr: position?.categoryAvgPriceInr ?? payload.categoryAvgPriceInr ?? null,
    competitivePositionPct: position?.competitivePositionPct ?? null,
    competitiveNote: position?.competitiveNote ?? null,
  };
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
  netMarginAtScale = null,
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
  const floorFromDivision = minMarginPct == null ? null : Number(minMarginPct);
  const typedMargin = asNum(netMarginAtScale);
  const floor = Number.isFinite(floorFromDivision)
    ? floorFromDivision
    : typedMargin != null && typedMargin > 0 && typedMargin < 100
      ? typedMargin
      : null;
  const min = Number.isFinite(floor) ? floor : null;
  const minMrpInr = min != null && cogs != null && cogs > 0 ? mrpFromMarginPct(cogs, min) : null;
  const position = competitivePositionNote({
    cogsAtScale: cogs,
    netMarginAtScale,
    categoryAvgPriceInr: categoryAvgPrice?.priceInr,
  });

  if (cogs == null || cogs <= 0) {
    return attachCompetitivePosition(
      {
        minMarginPct: min,
        maxMarginPct: null,
        minMrpInr: null,
        maxMrpInr: null,
        basis:
          "COGS at scale is not yet available, so 5-year inflated cost cannot be converted into a margin ceiling.",
        sources,
        aiSourced: true,
      },
      position
    );
  }

  const ceiling = solveForVolumeLossCeiling({
    categoryAvgPrice: categoryAvgPrice?.priceInr,
    inflationRatePct: inflation?.ratePct,
    volumeLossAtInflationPct: inflation?.volumeLossPct,
    targetVolumeLossPct: 10,
  });

  if (ceiling.priceCeiling == null) {
    return attachCompetitivePosition(
      {
        minMarginPct: min,
        maxMarginPct: null,
        minMrpInr,
        maxMrpInr: null,
        basis: ceiling.reason,
        sources,
        aiSourced: true,
      },
      position
    );
  }

  const projectedCogs5yr = cogs * Math.pow(1 + Number(inflation.ratePct) / 100, 5);
  const maxMarginPct = ((ceiling.priceCeiling - projectedCogs5yr) / ceiling.priceCeiling) * 100;
  const maxMrpInr = ceiling.priceCeiling;
  if (!Number.isFinite(maxMarginPct)) {
    return attachCompetitivePosition(
      {
        minMarginPct: min,
        maxMarginPct: null,
        minMrpInr,
        maxMrpInr,
        basis:
          "The one-in-ten volume-loss price ceiling and 5-year inflated COGS did not produce a usable margin — not fabricating a number.",
        sources,
        aiSourced: true,
      },
      position
    );
  }

  const cited = categoryAvgPrice?.sourceTier === 1;
  const divisionLabel = divisionName || "matched";
  const inflationSource = inflation?.source || "researched inflation";
  return attachCompetitivePosition(
    {
      minMarginPct: min,
      maxMarginPct,
      minMrpInr,
      maxMrpInr,
      basis: `Min MRP from today's COGS against the ${divisionLabel} division floor (v4, non-negotiable). Max MRP is the one-in-ten volume-loss ceiling after ${inflation.ratePct} percent inflation (${inflationSource}) projected over 5 years, from ${
        cited ? "cited" : "modelled"
      } category pricing.`,
      sources,
      aiSourced: true,
    },
    position
  );
}
