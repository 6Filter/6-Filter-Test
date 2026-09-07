import { getDivisionMarginFloor } from "../divisionConfig.js";
import { guardMrpRange, mrpFromMarginPct, PACK_SIZE_UNCONFIRMED_COPY, bandAroundFilter2Mrp, volumeLossPriceIncreasePct, resolveF3MaxMrp } from "../mrpFormula.js";
import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { parseGrammageToNumber } from "./runCostEstimate.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";
import { researchInflation } from "./runVolumeLossResearch.js";
import { withCategoryScope } from "../categoryScopedResearch.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"avgPriceInr":0,"packSizeFound":"...","sourceTier":1,' +
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
  console.log(
    `[primus/margin-elasticity] ceiling computed by solveForVolumeLossCeiling: ${priceCeiling}, called from solveForVolumeLossCeiling`
  );
  return { priceCeiling, priceIncreasePct };
}

/**
 * Prefer the smallest pack actually priced (sachet/pouch) over STATED_PACK_SIZE
 * when the research text names both.
 */
export function pickFoundPackSize({ packSizeFound, basis, grammage } = {}) {
  const declared = String(packSizeFound || "").trim();
  const productUnits = parseGrammageToNumber(grammage);
  const blob = `${declared} ${String(basis || "")}`;
  const re =
    /(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|grams?|g|kgs?|kilograms?|ltrs?|litres?|liters?|l)\b/gi;
  let smallest = null;
  let smallestLabel = declared;
  for (const m of blob.matchAll(re)) {
    const label = `${m[1]}${m[2]}`;
    const units = parseGrammageToNumber(label);
    if (units == null || units <= 0) continue;
    if (smallest == null || units < smallest) {
      smallest = units;
      smallestLabel = `${m[1]}${String(m[2]).toLowerCase().startsWith("l") && !String(m[2]).toLowerCase().startsWith("ml") ? "l" : m[2]}`;
    }
  }
  if (smallest != null && productUnits != null && smallest < productUnits * 0.8) {
    return smallestLabel;
  }
  return declared || null;
}

/**
 * Scale a researched pack price onto this product's declared grammage.
 * A price without a confirmed pack size is unusable for the ceiling.
 */
export function normalizeCategoryAvgPrice({
  avgPriceInr,
  packSizeFound,
  grammage,
} = {}) {
  const raw = asNum(avgPriceInr);
  const foundUnits = parseGrammageToNumber(packSizeFound);
  const productUnits = parseGrammageToNumber(grammage);
  const packLabel = stripCavinKareMentions(String(packSizeFound || "").trim()) || null;

  if (raw == null || raw <= 0) {
    return {
      avgPriceInr: raw,
      packSizeFound: packLabel,
      pricePerUnitWeight: null,
      normalizedAvgPriceInr: null,
      normalized: false,
      warning: "Category average price research returned no usable rupee figure.",
    };
  }
  if (foundUnits == null || foundUnits <= 0) {
    return {
      avgPriceInr: raw,
      packSizeFound: packLabel,
      pricePerUnitWeight: null,
      normalizedAvgPriceInr: null,
      normalized: false,
      warning: PACK_SIZE_UNCONFIRMED_COPY,
    };
  }
  if (productUnits == null || productUnits <= 0) {
    return {
      avgPriceInr: raw,
      packSizeFound: packLabel,
      pricePerUnitWeight: raw / foundUnits,
      normalizedAvgPriceInr: null,
      normalized: false,
      warning: "Product grammage is missing — cannot scale the found pack price.",
    };
  }

  const pricePerUnitWeight = raw / foundUnits;
  const normalizedAvgPriceInr = pricePerUnitWeight * productUnits;
  return {
    avgPriceInr: raw,
    packSizeFound: packLabel,
    pricePerUnitWeight,
    normalizedAvgPriceInr,
    normalized: true,
    productGrammageUnits: productUnits,
    packSizeFoundUnits: foundUnits,
  };
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

export async function researchCategoryAvgPrice({ category = "", ideaText = "", grammage = "" } = {}) {
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch the typical consumer selling price for this Indian FMCG category.\n" +
    "When researching category average pricing, you must identify and report the\n" +
    "pack size / grammage the price applies to, not just a bare ₹ figure. If you find\n" +
    "a price without a clear pack size, say so explicitly rather than reporting a\n" +
    "number with no stated basis — an unstated pack size makes the price unusable for\n" +
    "comparison.\n" +
    "Prefer a pack that matches STATED_PACK_SIZE when one is given; otherwise name the\n" +
    "pack you actually found. Never report a sachet, pouch or trial-pack price as if it\n" +
    "were STATED_PACK_SIZE — packSizeFound must be the pack on the listing you priced.\n" +
    "Apply the source hierarchy: a publicly-cited Nielsen or Kantar average first; else\n" +
    "category-intelligence engines; else an e-com listing average as last resort. Never\n" +
    "write unsure or not available. Always include sourceTier (1|2|3)."
  );

  const statedPack = String(grammage || "").trim() || "(not declared — name the pack size of any price you find)";
  const userText = await withCategoryScope(
    `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n` +
      `STATED_PACK_SIZE: ${statedPack}\n\n` +
      `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 800)}\n\n` +
      "Return avgPriceInr as the typical pack price in rupees and packSizeFound as the\n" +
      "grammage that price applies to (e.g. 100ml, 10ml sachet). If you priced a sachet,\n" +
      "packSizeFound is the sachet size, not STATED_PACK_SIZE. Do not return a price\n" +
      "with an empty packSizeFound.",
    {
      category,
      baseQuery: "average pack MRP price per gram",
      label: "f3-category-avg-price",
    }
  );

  const jsonSystem =
    "You are the structuring step for F3 category average price. Do not search. " +
    "Use only the research brief. Never omit sourceTier, avgPriceInr, or packSizeFound. " +
    "If the brief did not confirm a pack size, set packSizeFound to an empty string. " +
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
      packSizeFound: null,
      sourceTier: null,
      basis: "Category average price research returned no structured result.",
      sources: sources || [],
      ...normalizeCategoryAvgPrice({ avgPriceInr: null, packSizeFound: null, grammage }),
    };
  }

  const priceInr = asNum(parsed.avgPriceInr ?? parsed.categoryAvgPriceInr);
  const sourceTier = asTier(parsed.sourceTier);
  const basis = stripCavinKareMentions(String(parsed.basis || "").trim()) || null;
  const packSizeFound = pickFoundPackSize({
    packSizeFound: stripCavinKareMentions(String(parsed.packSizeFound || parsed.packSize || "").trim()) || null,
    basis,
    grammage,
  });
  const normalized = normalizeCategoryAvgPrice({
    avgPriceInr: priceInr,
    packSizeFound,
    grammage,
  });
  console.log(
    `[primus/margin-elasticity] category price: raw=${normalized.avgPriceInr} packFound=${normalized.packSizeFound} pricePerUnitWeight=${normalized.pricePerUnitWeight} normalized=${normalized.normalizedAvgPriceInr} (product grammage=${grammage})`
  );
  return {
    priceInr: normalized.normalizedAvgPriceInr,
    rawPriceInr: normalized.avgPriceInr,
    packSize: normalized.packSizeFound,
    packSizeFound: normalized.packSizeFound,
    sourceTier,
    basis,
    sources: mergeSources(parsed.sources, sources),
    ...normalized,
  };
}

export function assembleMarginElasticity({
  cogsAtScale,
  netMarginAtScale = null,
  division = "",
  minMarginPct = null,
  categoryAvgPrice = null,
  inflation = null,
  grammage = "",
  mrpInr = null,
} = {}) {
  const cogs = asNum(cogsAtScale);
  const divisionName = String(division || "").trim();
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
  const usableAvg =
    categoryAvgPrice?.normalized === true ? categoryAvgPrice.normalizedAvgPriceInr : null;
  const position = competitivePositionNote({
    cogsAtScale: cogs,
    netMarginAtScale,
    categoryAvgPriceInr: usableAvg,
  });

  const finish = (payload) => {
    const guarded = guardMrpRange(
      {
        ...payload,
        inflationRatePct: inflation?.ratePct ?? payload.inflationRatePct ?? null,
        volumeLossPct: inflation?.volumeLossPct ?? payload.volumeLossPct ?? null,
        inflationSource: inflation?.source || payload.inflationSource || "",
      },
      cogs
    );
    if (guarded.rangeError) {
      console.log(
        `[primus/margin-elasticity] category price: raw=${categoryAvgPrice?.avgPriceInr} packFound=${categoryAvgPrice?.packSizeFound} normalized=${categoryAvgPrice?.normalizedAvgPriceInr} (product grammage=${grammage}) -> ceiling=${payload.maxMrpInr} -> maxMrpInr=null`
      );
    }
    return attachCompetitivePosition(guarded, position);
  };

  if (cogs == null || cogs <= 0) {
    return finish({
      minMarginPct: min,
      maxMarginPct: null,
      minMrpInr: null,
      maxMrpInr: null,
      basis:
        "COGS at scale is not yet available, so 5-year inflated cost cannot be converted into a margin ceiling.",
      sources,
      aiSourced: true,
    });
  }

  if (categoryAvgPrice && categoryAvgPrice.normalized !== true) {
    return finish({
      minMarginPct: min,
      maxMarginPct: null,
      minMrpInr,
      maxMrpInr: null,
      packSizeWarning: categoryAvgPrice.warning || PACK_SIZE_UNCONFIRMED_COPY,
      basis: categoryAvgPrice.warning || PACK_SIZE_UNCONFIRMED_COPY,
      sources,
      aiSourced: true,
      categoryAvgPriceInr: null,
      rawCategoryAvgPriceInr: categoryAvgPrice.avgPriceInr ?? null,
      packSizeFound: categoryAvgPrice.packSizeFound ?? null,
    });
  }

  const lift = volumeLossPriceIncreasePct({
    inflationRatePct: inflation?.ratePct,
    volumeLossAtInflationPct: inflation?.volumeLossPct,
  });
  const ceiling = solveForVolumeLossCeiling({
    categoryAvgPrice: usableAvg,
    inflationRatePct: inflation?.ratePct,
    volumeLossAtInflationPct: inflation?.volumeLossPct,
    targetVolumeLossPct: 10,
  });
  const centre = asNum(mrpInr);
  const f2Band =
    centre != null && centre > 0 && lift != null
      ? bandAroundFilter2Mrp({
          cogsAtScale: cogs,
          minMarginPct: min,
          mrpInr: centre,
          liftPct: lift,
        })
      : null;
  const maxMrpInr = resolveF3MaxMrp({
    categoryCeiling: ceiling.priceCeiling,
    f2BandMax: f2Band?.maxMrpInr,
    minMrpInr,
    callSite: "assembleMarginElasticity",
  });
  const minForDisplay =
    f2Band?.maxMrpInr != null && maxMrpInr != null && maxMrpInr <= f2Band.maxMrpInr + 1e-6
      ? f2Band.minMrpInr
      : minMrpInr;

  if (maxMrpInr == null) {
    return finish({
      minMarginPct: min,
      maxMarginPct: null,
      minMrpInr: minForDisplay,
      maxMrpInr: null,
      volumeLossPriceIncreasePct: lift,
      basis: ceiling.reason,
      sources,
      aiSourced: true,
    });
  }

  const projectedCogs5yr = Number.isFinite(Number(inflation?.ratePct))
    ? cogs * Math.pow(1 + Number(inflation.ratePct) / 100, 5)
    : cogs;
  const maxMarginPct = ((maxMrpInr - projectedCogs5yr) / maxMrpInr) * 100;
  console.log(
    `[primus/margin-elasticity] category price: raw=${categoryAvgPrice?.avgPriceInr} packFound=${categoryAvgPrice?.packSizeFound} normalized=${usableAvg} (product grammage=${grammage}) centre=${centre} lift=${lift} -> maxMrpInr=${maxMrpInr}`
  );

  if (!Number.isFinite(maxMarginPct)) {
    return finish({
      minMarginPct: min,
      maxMarginPct: null,
      minMrpInr: minForDisplay,
      maxMrpInr,
      volumeLossPriceIncreasePct: lift,
      basis:
        "The one-in-ten volume-loss price ceiling and 5-year inflated COGS did not produce a usable margin — not fabricating a number.",
      sources,
      aiSourced: true,
    });
  }

  const cited = categoryAvgPrice?.sourceTier === 1;
  const divisionLabel = divisionName || "matched";
  const inflationSource = inflation?.source || "researched inflation";
  let recommendedMrpInr = null;
  let elasticityDownPct = null;
  let elasticityUpPct = null;
  let mrpAdjustmentNote = null;
  const floorMrp = minMrpInr;
  if (centre != null && centre > 0 && floorMrp != null && centre + 0.5 < floorMrp) {
    recommendedMrpInr = floorMrp;
    mrpAdjustmentNote = `Filter 2 MRP ₹${centre.toFixed(0)} sits below the margin-floor MRP — move toward ₹${floorMrp.toFixed(0)} to hold the ${divisionLabel} floor.`;
  } else if (centre != null && centre > 0 && minForDisplay != null && maxMrpInr != null) {
    recommendedMrpInr = Math.min(maxMrpInr, Math.max(minForDisplay, centre));
    elasticityDownPct = ((centre - minForDisplay) / centre) * 100;
    elasticityUpPct = ((maxMrpInr - centre) / centre) * 100;
    if (Math.abs(recommendedMrpInr - centre) > 0.5) {
      mrpAdjustmentNote =
        centre > maxMrpInr
          ? `Filter 2 MRP ₹${centre.toFixed(0)} sits above the 5-year competitive ceiling — move toward ₹${recommendedMrpInr.toFixed(0)} to stay inside a one-in-ten volume-loss band.`
          : `Filter 2 MRP ₹${centre.toFixed(0)} sits below the margin-floor MRP — move toward ₹${recommendedMrpInr.toFixed(0)} to hold the ${divisionLabel} floor.`;
    }
  }
  const centreBit =
    centre != null && centre > 0
      ? ` Band is centred on the Filter 2 MRP of ₹${centre.toFixed(0)} (COGS + net margin + GST).`
      : "";
  const adjustBit = mrpAdjustmentNote ? ` ${mrpAdjustmentNote}` : "";
  const maxBit = f2Band?.maxMrpInr != null
    ? `Max MRP is that Filter 2 MRP plus the researched one-in-ten volume-loss lift after ${inflation.ratePct} percent inflation (${inflationSource}).`
    : `Max MRP is the one-in-ten volume-loss ceiling after ${inflation.ratePct} percent inflation (${inflationSource}) projected over 5 years, from ${
        cited ? "cited" : "modelled"
      } category pricing scaled to ${String(grammage || "").trim() || "the declared pack"}.`;
  return finish({
    minMarginPct: min,
    maxMarginPct,
    minMrpInr: minForDisplay,
    maxMrpInr,
    volumeLossPriceIncreasePct: lift,
    recommendedMrpInr,
    elasticityDownPct,
    elasticityUpPct,
    mrpAdjustmentNote,
    basis: `Min MRP is the higher of today's COGS against the ${divisionLabel} division floor (v4, non-negotiable) and the downside of the Filter 2 MRP band. ${maxBit}${centreBit}${adjustBit}`,
    sources,
    aiSourced: true,
    rawCategoryAvgPriceInr: categoryAvgPrice?.avgPriceInr ?? null,
    packSizeFound: categoryAvgPrice?.packSizeFound ?? null,
    normalizedAvgPriceInr: usableAvg,
  });
}

export async function runMarginElasticityResearch({
  cogsAtScale,
  netMarginAtScale = null,
  division,
  category = "",
  ideaText = "",
  grammage = "",
  mrpInr = null,
  competitorPriceInr = null,
  competitorPackSize = null,
} = {}) {
  const divisionName = String(division || "").trim();

  const [researchedAvg, inflation, minMarginPct] = await Promise.all([
    researchCategoryAvgPrice({ category, ideaText, grammage }),
    researchInflation({ category, ideaText }),
    getDivisionMarginFloor(divisionName),
  ]);

  let categoryAvgPrice = researchedAvg;
  if (categoryAvgPrice?.normalized !== true && asNum(competitorPriceInr) != null) {
    const competitorPack = String(competitorPackSize || "").trim();
    if (!parseGrammageToNumber(competitorPack)) {
      console.log(
        `[primus/margin-elasticity] competitor price ${competitorPriceInr} ignored — no packSizeFound (will not assume product grammage ${grammage})`
      );
    } else {
      const fromCompetitor = normalizeCategoryAvgPrice({
        avgPriceInr: competitorPriceInr,
        packSizeFound: competitorPack,
        grammage,
      });
      if (fromCompetitor.normalized) {
        categoryAvgPrice = {
          ...categoryAvgPrice,
          ...fromCompetitor,
          sourceTier: categoryAvgPrice?.sourceTier || 3,
          sources: categoryAvgPrice?.sources || [],
        };
      }
    }
  }

  return assembleMarginElasticity({
    cogsAtScale,
    netMarginAtScale,
    division: divisionName,
    minMarginPct,
    categoryAvgPrice,
    inflation,
    grammage,
    mrpInr,
  });
}
