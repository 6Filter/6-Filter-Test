import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { withCategoryScope } from "../categoryScopedResearch.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"householdsReachedY3Mn":0,"trialRatePct":0,"repeatConversionPct":0,' +
  '"purchaseFrequencyYr":0,"avgPackValueInr":0,' +
  '"factorTiers":{"households":1,"trial":1,"repeat":1,"frequency":1,"packValue":1},' +
  '"sources":[{"title":"...","url":"..."}]}';

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asTier(v) {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 3;
}

/**
 * F5 five-factor sizing research.
 * Two-call pattern: web_search research, then structure-only JSON.
 * Always returns a finding (tier 3 digital-proxy/analog if nothing stronger).
 */
export async function runSizingResearch({ ideaText = "", category = "", division = "" }) {
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch the F5 revenue-sizing factors for this proposition's category: households\n" +
    "reached in year 3 (millions), trial rate (%), repeat conversion (%), purchase\n" +
    "frequency (per year), and average pack value (₹). Apply the source hierarchy\n" +
    "above — a Nielsen/Kantar citation for any one factor is stronger than an engine\n" +
    "estimate for that same factor; don't let a strong household figure and a weak\n" +
    "pack-value guess get presented with the same confidence.\n" +
    "Always fill all five factors. Never write unsure or not available. Include factorTiers\n" +
    "for each factor (1|2|3)."
  );

  const userText = await withCategoryScope(
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 1600)}\n\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n` +
      `DIVISION: ${division || "(unspecified)"}\n` +
      "Derive year-3 households reached (millions of households the brand can reach, not national population).\n" +
      "If no public footprint exists, use digital-proxy / analog-transfer (tier 3) and still fill every factor.",
    {
      category,
      baseQuery: "Kantar household panel trial repeat frequency pack value",
      label: "f5-sizing",
    }
  );

  const { parsed, sources, error, researchText } = await researchThenJson({
    label: "f5-sizing",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for F5 sizing research. Do not search. " +
      "Use only the research brief. Always include all five factors and factorTiers. " +
      "Never omit a factor. " +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 4096,
    jsonMaxTokens: 3072,
    maxUses: 4,
  });

  if (!parsed) {
    console.warn(`[primus/f5-sizing] no structured result error=${error || "unknown"} — emitting tier-3 analog skeleton`);
    return {
      householdsReachedY3Mn: null,
      trialRatePct: null,
      repeatConversionPct: null,
      purchaseFrequencyYr: null,
      avgPackValueInr: null,
      factorTiers: {
        households: 3,
        trial: 3,
        repeat: 3,
        frequency: 3,
        packValue: 3,
      },
      sources: sources || [],
      researchText: researchText || null,
      error: error || "parse",
    };
  }

  const tiersIn = parsed.factorTiers && typeof parsed.factorTiers === "object" ? parsed.factorTiers : {};
  const factorTiers = {
    households: asTier(tiersIn.households),
    trial: asTier(tiersIn.trial),
    repeat: asTier(tiersIn.repeat),
    frequency: asTier(tiersIn.frequency),
    packValue: asTier(tiersIn.packValue),
  };

  const result = {
    householdsReachedY3Mn: asNum(parsed.householdsReachedY3Mn),
    trialRatePct: asNum(parsed.trialRatePct),
    repeatConversionPct: asNum(parsed.repeatConversionPct),
    purchaseFrequencyYr: asNum(parsed.purchaseFrequencyYr),
    avgPackValueInr: asNum(parsed.avgPackValueInr),
    factorTiers,
    sources: mergeSources(parsed.sources, sources),
    researchText: researchText || null,
  };

  console.log(
    `[primus/f5-sizing] tiers=${JSON.stringify(factorTiers)} ` +
      `hh=${result.householdsReachedY3Mn} trial=${result.trialRatePct} ` +
      `repeat=${result.repeatConversionPct} freq=${result.purchaseFrequencyYr} pack=${result.avgPackValueInr}`
  );

  return result;
}
