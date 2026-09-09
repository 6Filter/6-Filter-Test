import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";
import { withCategoryScope, maxUsesForMatch } from "../categoryScopedResearch.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"inflationRatePct":0,"inflationSource":"...","inflationPeriod":"...",' +
  '"competitivePositionNote":"one sentence on how the price index affects headroom",' +
  '"modelledVolumeLossPct":0,"sourceTier":1,' +
  '"basis":"one sentence connecting inflation + position to the number",' +
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
 * F3 volume-loss research. Only meaningful once priceIndexVsBenchmark is known —
 * call after that field is populated, or with 100 (at-parity) to recover the
 * category inflation + elasticity relationship for margin-elasticity solving.
 */
export async function runVolumeLossResearch({
  benchmarkName = "",
  priceIndexVsBenchmark,
  category = "",
  ideaText = "",
} = {}) {
  const priceIndex = asNum(priceIndexVsBenchmark);
  if (priceIndex == null) return null;

  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch two things, applying the six-filter-test skill's source hierarchy to\n" +
    "each (cited figures first, category-intelligence engines second, digital proxy last):\n" +
    "1. Current and 5-year inflation relevant to this category — the most recent\n" +
    "   published WPI or CPI figure for the relevant item group, plus commodity,\n" +
    "   capacity, shortage, listed-player outlook or input-cost signals that would\n" +
    "   move COGS. Cite the source and the period it covers.\n" +
    "2. Given this proposition's price index vs the benchmark, and the researched\n" +
    "   inflation rate, estimate the volume loss that would follow an inflation-matching\n" +
    "   price increase. A proposition already priced above the benchmark has less room\n" +
    "   before crossing resistance; one priced below has more headroom — factor this\n" +
    "   into the estimate, don't treat every price index the same.\n" +
    "Never write unsure or not available. Always include sourceTier (1|2|3)."
  );

  const { text: userText, nielsenMatchedOn, kantarMatchedOn } = await withCategoryScope(
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 800)}\n\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n` +
      `BENCHMARK: ${String(benchmarkName || "").trim() || "(none named)"}\n` +
      `PRICE_INDEX_VS_BENCHMARK: ${priceIndex} — 100 means priced the same, above 100 means priced higher, below 100 means priced lower.\n\n` +
      "Research current and forward inflation (WPI/CPI plus commodity, capacity, shortage or listed-player outlook)\n" +
      "and estimate modelledVolumeLossPct for an inflation-matching price increase given this competitive position.",
    {
      category,
      baseQuery: "WPI CPI inflation volume loss",
      label: "f3-volume-loss",
    }
  );

  const jsonSystem =
    "You are the structuring step for F3 volume-loss research. Do not search. " +
    "Use only the research brief. Never omit sourceTier, inflationRatePct, competitivePositionNote, or basis. " +
    "basis must name both the inflation figure and how the price index affects headroom. " +
    STRUCTURE_SYSTEM;

  const { parsed, sources, error } = await researchThenJson({
    label: "f3-volume-loss",
    researchSystem,
    researchUser: userText,
    jsonSystem,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 3072,
    jsonMaxTokens: 2048,
    maxUses: maxUsesForMatch(nielsenMatchedOn, kantarMatchedOn, 4),
  });

  if (!parsed) {
    console.warn(`[primus/f3-volume-loss] no structured result error=${error || "unknown"}`);
    return null;
  }

  const inflationRatePct = asNum(parsed.inflationRatePct);
  const modelledVolumeLossPct = asNum(parsed.modelledVolumeLossPct);
  const inflationSource = stripCavinKareMentions(String(parsed.inflationSource || "").trim()) || null;
  const inflationPeriod = stripCavinKareMentions(String(parsed.inflationPeriod || "").trim()) || null;
  const competitivePositionNote =
    stripCavinKareMentions(String(parsed.competitivePositionNote || "").trim()) || null;
  const basis = stripCavinKareMentions(String(parsed.basis || "").trim()) || null;
  const sourceTier = asTier(parsed.sourceTier);

  console.log(
    `[primus/f3-volume-loss] priceIndex=${priceIndex} inflation=${inflationRatePct} ` +
      `loss=${modelledVolumeLossPct} tier=${sourceTier}`
  );

  return {
    inflationRatePct,
    inflationSource,
    inflationPeriod,
    competitivePositionNote,
    modelledVolumeLossPct,
    sourceTier,
    basis,
    sources: mergeSources(parsed.sources, sources),
  };
}

/**
 * Part 43 inflation + elasticity relationship for this category, recovered at
 * parity (price index 100) so later solvers can invert it without a second
 * derivation. Returns null-shaped fields rather than fabricating numbers.
 */
export async function researchInflation({ category = "", ideaText = "" } = {}) {
  const vl = await runVolumeLossResearch({
    category,
    ideaText,
    priceIndexVsBenchmark: 100,
  });
  if (!vl) {
    return {
      ratePct: null,
      source: null,
      sources: [],
      volumeLossPct: null,
      sourceTier: null,
      basis: null,
    };
  }
  const source = [vl.inflationSource, vl.inflationPeriod].filter(Boolean).join(", ") || null;
  return {
    ratePct: vl.inflationRatePct,
    source,
    sources: vl.sources || [],
    volumeLossPct: vl.modelledVolumeLossPct,
    sourceTier: vl.sourceTier,
    basis: vl.basis,
  };
}
