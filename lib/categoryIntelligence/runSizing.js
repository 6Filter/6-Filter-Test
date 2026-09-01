import { brandRosterForPrompt } from "../ckBrands.js";
import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { parseStrictJson, researchThenJson } from "../llmJson.js";
import { callLlm } from "../callLlm.js";
import { loadSixFilterSkill } from "../skills/loadSkill.js";
import { assembleFromModelPayload } from "./assemble.js";
import { hasAnyCalibration, saveSizingRun } from "./store.js";
import { lookupKantarCategory, syndicatedPromptBlock } from "../syndicatedLookup.js";

const FILTER1_JSON_SCHEMA =
  "Return ONLY minified JSON:\n" +
  '{"generalCategory":"...","categoryArchetype":"...","capacityDisclosed":false,"gatingAsset":false,' +
  '"enginesRun":[{"engineId":"E1","inputs":{},"weakness":"...","sources":[{"title":"...","url":"..."}]}],' +
  '"enginesNotRun":[{"engineId":"E4","reason":"..."}],' +
  '"reconciliation":{"status":"TIGHT|MODERATE|DIAGNOSE|INSUFFICIENT","diagnosis":"..."},' +
  '"growthDecomposition":{"valueGrowthPct":0,"priceGrowthPct":0},' +
  '"growthStage":"low-penetration|mature-cluttered|unclear","benchmarkName":"...","attribute":"...","gapClaim":"...","gapMagnitude":"...",' +
  '"parityRisk":"none|minor|major","whatCouldNotBeEstablished":"...","differentiationExempt":false,' +
  '"estimatedNetMarginPct":0,"estimatedVolumeLossPct":0,"isPureCommodity":false,' +
  '"estimatedBenchmarkExists":false,"estimatedPointsBeat":0,' +
  '"competitorPricePerGram":0,"priceIndexVsBenchmark":0,' +
  '"householdsReachedY3Mn":0,"trialRatePct":0,"repeatConversionPct":0,"purchaseFrequencyYr":0,"avgPackValueInr":0,' +
  '"sources":[{"title":"...","url":"..."}],' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"..."}';

function filter1ResearchPrompt() {
  return (
    loadSixFilterSkill() +
    "\n\n---\n\n" +
    "You are Filter 1 of 6 Filter Test — \"Opportunity to Grow.\" Apply the 6 Filter Test skill\n" +
    "and the category-intelligence method above. Prefer Nielsen products and category size when a\n" +
    "local audit row is in the user message; otherwise web_search. Never write unsure, not\n" +
    "available, unknown, or n/a as a field value — always a working estimate with a source.\n" +
    "Use the web_search tool, and only cite sources you actually found — named datasets from the\n" +
    "atlas (HCES, ASI, IIP, WPI/CPI item indices, DGCIS Tradestat, Economic Census, MCA21,\n" +
    "DRHP/RHP industry chapters, credit rating rationales, IBEF/industry-body reports) or company\n" +
    "disclosures, not generic blog claims.\n" +
    "Write a structured research brief in prose and bullets (not JSON). Cover:\n" +
    "1. Category archetype and which 2–3 engines you are running and why.\n" +
    "2. For each engine: every input value, the source, and whether it is missing (do not invent).\n" +
    "3. Reconciliation notes (spread, diagnosis if wide).\n" +
    "4. Growth decomposition (value vs item-level price index) and PRICE-LED / MIXED / VOLUME-LED.\n" +
    "5. growthStage, benchmark, attribute, gap claim, parity risk.\n" +
    "6. Working estimates for any thin input (source tag nielsen|kantar|web|playbook) — never leave a blank.\n" +
    "7. estimatedNetMarginPct, estimatedVolumeLossPct, isPureCommodity, capacityDisclosed, gatingAsset.\n" +
    "8. generalCategory: identify the real-world commercial category this product\n" +
    "   belongs to, in plain market/industry terms — describe what it *is*, not what\n" +
    "   company might make it. Do NOT reference CavinKare's own brands, divisions, or\n" +
    "   product portfolio anywhere in this field, and do NOT state or imply whether\n" +
    "   this is a new or existing category for CavinKare — that comparison is out of\n" +
    "   scope for this analysis, not just unasked-for.\n" +
    "9. estimatedBenchmarkExists: true only if you found a real, currently-selling named\n" +
    "   competitor in this exact segment (the same benchmark named elsewhere in your\n" +
    "   research) — false if this would be a first-of-its-kind entrant.\n" +
    "10. estimatedPointsBeat: if estimatedBenchmarkExists is true, your best-evidenced\n" +
    "   guess at how many points (0-10 scale) this idea's claimed gap would beat that\n" +
    "   benchmark by, based on the gap claim and evidence you already gathered — not a\n" +
    "   fabricated number, your genuine read of the evidence. Omit or set to null if you\n" +
    "   can't support a number.\n" +
    "11. From Nielsen products (or web listings if no Nielsen row): name the benchmark as the\n" +
    "    strongest currently-selling SKU in this exact segment. List other products seen.\n" +
    "12. competitorPricePerGram and priceIndexVsBenchmark (idea vs that benchmark, equal grammage).\n" +
    "13. Filter 5 factors — householdsReachedY3Mn, trialRatePct, repeatConversionPct,\n" +
    "    purchaseFrequencyYr, avgPackValueInr — Kantar first, then Nielsen, then HCES/web analog.\n" +
    "    Fill every factor. Never omit.\n" +
    "Engine input keys to collect:\n" +
    "E1: populationMn, perCapitaAnnualSpend, oohUplift\n" +
    "E2: valueOfOutputBaseYear, yearsToTrend, annualGrowthForTrending, exports, imports, formalShareOfCategory, formalMarkup, informalMarkup\n" +
    "E3: playerRevenuesRetailEquivalent, coverageOfFormalMarket, formalShareOfTotalCategory\n" +
    "E4: players, coverageOfTotalVolume, realisedRetailPrice\n" +
    "E5: totalAssetsDisclosed, coverageOfTotalBase, avgThroughputPerAsset, shareOfVolumeThroughAsset, realisedRetailPrice\n" +
    "E6: analogPerCapitaConsumption, analogIncomePerCapita, yourIncomePerCapita, incomeElasticity, yourPopulationMn, realisedRetailPrice\n" +
    "E7: yourUnitsSoldKnown, yourReviewCountIncrease, solicitationAdjustment, totalCategoryReviewIncrease, platformShareOfEcom, ecomShareOfCategory, realisedRetailPrice, volumePerUnit\n" +
    "CavinKare brand lines:\n" +
    `${brandRosterForPrompt()}`
  );
}

function filter1JsonPrompt() {
  return (
    "You are the structuring step for Filter 1. Do not search. Do not invent missing engine inputs.\n" +
    "Always include generalCategory, benchmarkName, growthStage, competitorPricePerGram,\n" +
    "priceIndexVsBenchmark, and all five Filter 5 factors even when engines are incomplete.\n" +
    "Never output unsure, not available, unknown, or n/a.\n" +
    "Use only the research brief for engine numbers. " +
    FILTER1_JSON_SCHEMA
  );
}

export function buildSizingUserText({
  ideaText,
  categoryName = "",
  attribute = "",
  benchmarkName = "",
  isPureCommodity = false,
  brandFit = null,
  pricePerUnit = null,
  scope = "",
}) {
  const brandNote = brandFit?.mismatch
    ? `BRAND_FIT: MISMATCH — ${brandFit.reason}`
    : brandFit?.reason
      ? `BRAND_FIT: ${brandFit.reason}`
      : "BRAND_FIT: (no named CK brand/line conflict detected)";
  const priceNote =
    pricePerUnit != null && Number.isFinite(Number(pricePerUnit))
      ? `STATED_PRICE_INR: ${Number(pricePerUnit)}`
      : "STATED_PRICE_INR: (none)";
  return (
    `PRODUCT IDEA:\n${trimInput(String(ideaText || categoryName || ""), 1600)}\n\n` +
    `GENERAL_CATEGORY: required — name the real-world commercial category in plain market terms\n` +
    `(what the product *is*). Do not mention CavinKare, its brands/divisions/portfolio, and do not\n` +
    `say whether this is a new or existing category for CavinKare.\n` +
    `CATEGORY_NAME: ${categoryName?.trim() || "(infer from the idea)"}\n` +
    `SCOPE: ${scope?.trim() || "(All-India retail-equivalent unless the idea specifies otherwise)"}\n` +
    `STATED_ATTRIBUTE: ${attribute?.trim() || "(none — identify the top purchase-decision attribute)"}\n` +
    `STATED_BENCHMARK: ${benchmarkName?.trim() || "(none — identify the strongest named competitor in this exact segment)"}\n` +
    `IS_PURE_COMMODITY: ${isPureCommodity ? "true" : "infer from the idea"}\n` +
    `${priceNote}\n` +
    `${brandNote}`
  );
}

function kantarFallbackFields(row) {
  if (!row) return {};
  const asNum = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return {
    householdsReachedY3Mn: asNum(row.householdsMn),
    trialRatePct: asNum(row.trialRatePct),
    repeatConversionPct: asNum(row.repeatConversionPct),
    purchaseFrequencyYr: asNum(row.purchaseFrequencyYr),
    avgPackValueInr: asNum(row.avgPackValueInr),
  };
}

function fillMissingF5(parsed, kantar) {
  const fb = kantarFallbackFields(kantar);
  for (const [key, value] of Object.entries(fb)) {
    if (parsed[key] == null && value != null) parsed[key] = value;
  }
  return parsed;
}

async function inferGeneralCategory(ideaText) {
  const idea = trimInput(String(ideaText || ""), 800);
  if (!idea) return null;
  try {
    const result = await callLlm({
      userText:
        `PRODUCT IDEA:\n${idea}\n\n` +
        `Return ONLY minified JSON: {"generalCategory":"..."}`,
      system:
        "Identify the real-world commercial category this product belongs to, in plain market/industry terms — describe what it *is*, not what company might make it. Do NOT reference CavinKare's own brands, divisions, or product portfolio anywhere in this field, and do NOT state or imply whether this is a new or existing category for CavinKare — that comparison is out of scope for this analysis, not just unasked-for. One short label, e.g. \"ready-to-cook marinated meat\" or \"herbal hair oil\".",
      useWebSearch: false,
      maxTokens: 160,
    });
    const obj = parseStrictJson(result.text, { label: "filter1/generalCategory" });
    const label = String(obj?.generalCategory || "").trim();
    if (!label || label === "..." || /^n\/a$/i.test(label)) return null;
    return label;
  } catch {
    return null;
  }
}

export async function runCategorySizing({
  ideaText,
  categoryName = "",
  attribute = "",
  benchmarkName = "",
  isPureCommodity = false,
  brandFit = null,
  pricePerUnit = null,
  scope = "",
  persist = true,
  image = null,
}) {
  const syndicated = await syndicatedPromptBlock(ideaText || categoryName);
  const userText =
    buildSizingUserText({
      ideaText,
      categoryName,
      attribute,
      benchmarkName,
      isPureCommodity,
      brandFit,
      pricePerUnit,
      scope,
    }) +
    `\n\n${syndicated}`;

  const { parsed: structured, sources, error } = await researchThenJson({
    label: "filter1",
    researchSystem: filter1ResearchPrompt(),
    researchUser: userText,
    jsonSystem: filter1JsonPrompt(),
    jsonUserSuffix: FILTER1_JSON_SCHEMA,
    image,
    researchMaxTokens: 4096,
    jsonMaxTokens: 8192,
    maxUses: 4,
  });

  if (!structured) {
    const generalCategory = await inferGeneralCategory(ideaText || categoryName);
    const kantar = await lookupKantarCategory(ideaText || categoryName);
    const parsed = fillMissingF5(generalCategory ? { generalCategory } : {}, kantar);
    return {
      parsed: Object.keys(parsed).length ? parsed : null,
      sources: sources || [],
      error: error || "parse",
    };
  }

  const parsed = structured;

  if (attribute?.trim()) parsed.attribute = parsed.attribute || attribute.trim();
  if (benchmarkName?.trim()) parsed.benchmarkName = parsed.benchmarkName || benchmarkName.trim();
  if (isPureCommodity && parsed.differentiationExempt == null) {
    parsed.differentiationExempt = true;
  }

  const asNum = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const asTriBool = (v) => {
    if (v === true || String(v).toLowerCase() === "true") return true;
    if (v === false || String(v).toLowerCase() === "false") return false;
    return null;
  };
  parsed.estimatedNetMarginPct = asNum(parsed.estimatedNetMarginPct);
  parsed.estimatedVolumeLossPct = asNum(parsed.estimatedVolumeLossPct);
  parsed.estimatedPointsBeat = asNum(parsed.estimatedPointsBeat);
  parsed.competitorPricePerGram = asNum(parsed.competitorPricePerGram);
  parsed.priceIndexVsBenchmark = asNum(parsed.priceIndexVsBenchmark);
  parsed.householdsReachedY3Mn = asNum(parsed.householdsReachedY3Mn);
  parsed.trialRatePct = asNum(parsed.trialRatePct);
  parsed.repeatConversionPct = asNum(parsed.repeatConversionPct);
  parsed.purchaseFrequencyYr = asNum(parsed.purchaseFrequencyYr);
  parsed.avgPackValueInr = asNum(parsed.avgPackValueInr);
  parsed.estimatedBenchmarkExists = asTriBool(parsed.estimatedBenchmarkExists);
  fillMissingF5(parsed, await lookupKantarCategory(ideaText || categoryName));
  parsed.generalCategory = String(parsed.generalCategory || "").trim() || null;
  if (parsed.generalCategory === "..." || /^n\/a$/i.test(parsed.generalCategory || "")) {
    parsed.generalCategory = null;
  }
  if (!parsed.generalCategory) {
    parsed.generalCategory = await inferGeneralCategory(ideaText || categoryName);
  }
  parsed.sources = mergeSources(parsed.sources, sources);

  if (parsed.differentiationExempt) {
    parsed.categoryTamCr = null;
    parsed.enginesRun = parsed.enginesRun || [];
    parsed.enginesNotRun = parsed.enginesNotRun || [
      { engineId: "all", reason: "Commodity exemption — sizing rigor skipped; verdict on perception/positioning." },
    ];
    parsed.calibrationNudge = false;
    return { parsed, sources: parsed.sources };
  }

  const assembled = await assembleFromModelPayload(parsed, {
    capacityDisclosed: Boolean(parsed.capacityDisclosed),
    gatingAsset: Boolean(parsed.gatingAsset),
  });

  Object.assign(parsed, assembled);
  parsed.whatCouldNotBeEstablished = String(
    parsed.whatCouldNotBeEstablished || "Not stated."
  ).trim();
  parsed.calibrationNudge = !(await hasAnyCalibration(assembled.categoryArchetype));
  parsed.categoryTamCr = assembled.categoryTamCr;

  if (persist) {
    const saved = await saveSizingRun({
      categoryArchetype: assembled.categoryArchetype,
      enginesRun: assembled.enginesRun,
      enginesNotRun: assembled.enginesNotRun,
      reconciliation: assembled.reconciliation,
      growthDecomposition: assembled.growthDecomposition,
      whatCouldNotBeEstablished: parsed.whatCouldNotBeEstablished,
    });
    parsed.sizingRunId = saved.id;
  }

  return { parsed, sources: parsed.sources };
}
