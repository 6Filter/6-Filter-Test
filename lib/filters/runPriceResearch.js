import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { withCategoryScope, maxUsesForMatch } from "../categoryScopedResearch.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"benchmarkPricePerUnit":0,"benchmarkPackSize":"...","sourceTier":1,' +
  '"priceIndexVsBenchmark":0,"sources":[{"title":"...","url":"..."}]}';

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asTier(v) {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 3;
}

/**
 * F3 price-index research. Requires a named benchmark.
 * Two-call pattern: web_search research, then structure-only JSON.
 */
export async function runPriceResearch({
  benchmarkName,
  ownPricePerUnit = null,
  ideaText = "",
  category = "",
}) {
  const benchmark = String(benchmarkName || "").trim();
  if (!benchmark) return null;

  const own = asNum(ownPricePerUnit);
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch the F3 price-index check: find the named benchmark's actual price per\n" +
    "unit weight (₹ per g or ₹ per ml) at a comparable pack size to the proposition's\n" +
    "own declared price. Apply the source hierarchy above. Never write unsure or not available.\n" +
    "Always include sourceTier (1|2|3)."
  );

  const { text: userText, nielsenMatchedOn, kantarMatchedOn } = await withCategoryScope(
    `BENCHMARK (named competitor):\n${benchmark}\n\n` +
      `PRODUCT IDEA (context):\n${String(ideaText || "").slice(0, 800)}\n\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n` +
      (own != null
        ? `OWN_PRICE_PER_UNIT (₹ per g or ml, if known): ${own}\n`
        : "OWN_PRICE_PER_UNIT: (not declared — still find benchmark ₹/g or ₹/ml; leave priceIndexVsBenchmark null if own price is unknown)\n") +
      "Find benchmarkPricePerUnit in the same unit basis as own price when possible.",
    {
      category,
      baseQuery: "benchmark MRP price per gram pack size",
      label: "f3-price",
    }
  );

  const { parsed, sources, error, researchText } = await researchThenJson({
    label: "f3-price",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for F3 price research. Do not search. " +
      "Use only the research brief. Never omit sourceTier. " +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 3072,
    jsonMaxTokens: 2048,
    maxUses: maxUsesForMatch(nielsenMatchedOn, kantarMatchedOn, 4),
  });

  if (!parsed) {
    console.warn(`[primus/f3-price] no structured result error=${error || "unknown"}`);
    return null;
  }

  const benchmarkPricePerUnit = asNum(parsed.benchmarkPricePerUnit);
  const sourceTier = asTier(parsed.sourceTier);
  let priceIndexVsBenchmark = asNum(parsed.priceIndexVsBenchmark);
  if (priceIndexVsBenchmark == null && own != null && benchmarkPricePerUnit != null && benchmarkPricePerUnit > 0) {
    priceIndexVsBenchmark = Math.round((own / benchmarkPricePerUnit) * 100);
  }

  console.log(
    `[primus/f3-price] benchmark=${benchmark} tier=${sourceTier} ` +
      `benchmarkPricePerUnit=${benchmarkPricePerUnit} priceIndex=${priceIndexVsBenchmark}`
  );

  return {
    benchmarkPricePerUnit,
    benchmarkPackSize: String(parsed.benchmarkPackSize || "").trim() || null,
    sourceTier,
    priceIndexVsBenchmark,
    sources: mergeSources(parsed.sources, sources),
    researchText: researchText || null,
  };
}
