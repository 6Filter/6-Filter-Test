import { brandRosterForPrompt } from "../ckBrands.js";
import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { parseStrictJson, researchThenJson } from "../llmJson.js";
import { callLlm } from "../callLlm.js";
import { sixFilterSkillForProvider, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { assembleFromModelPayload } from "./assemble.js";
import { hasAnyCalibration, saveSizingRun } from "./store.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";

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
  '"estimatedBenchmarkExists":false,"estimatedPointsBeat":0,"sourceTier":1,' +
  '"sources":[{"title":"...","url":"..."}],' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"..."}';

function filter1ResearchPrompt() {
  return (
    sixFilterSkillForProvider() +
    "\n\n---\n\n" +
    "You are Filter 1 of 6 Filter Test — \"Opportunity to Grow.\" Apply the 6 Filter Test skill\n" +
    "and the category-intelligence method above.\n" +
    SOURCE_HIERARCHY_INSTRUCTION +
    "\nUse the web_search tool. Prefer publicly-cited Nielsen/Kantar figures in DRHPs, investor decks,\n" +
    "credit-rating rationales and trade press; else run the engines; else digital-proxy/analog.\n" +
    "Never write unsure, not available, unknown, or n/a as a field value — always a working estimate\n" +
    "and always state sourceTier (1|2|3).\n" +
    "Write a structured research brief in prose and bullets (not JSON). Cover:\n" +
    "1. Category archetype and which 2–3 engines you are running and why.\n" +
    "2. For each engine: every input value, the source, and whether it is missing (do not invent).\n" +
    "3. Reconciliation notes (spread, diagnosis if wide).\n" +
    "4. Growth decomposition (value vs item-level price index) and PRICE-LED / MIXED / VOLUME-LED.\n" +
    "5. growthStage, benchmark, attribute, gap claim, parity risk.\n" +
    "6. Working estimates for any thin input — never leave a blank; tag the tier.\n" +
    "7. estimatedNetMarginPct, estimatedVolumeLossPct, isPureCommodity, capacityDisclosed, gatingAsset.\n" +
    "8. generalCategory must describe the product's real-world commercial category in\n" +
    "   plain market terms ONLY. The word \"CavinKare\" must never appear in this field,\n" +
    "   under any circumstance, for any reason — not to confirm a fit, not to deny one,\n" +
    "   not to hedge. If you find yourself about to write \"CavinKare,\" stop and rephrase\n" +
    "   without it.\n" +
    "9. estimatedBenchmarkExists: true only if you found a real, currently-selling named\n" +
    "   competitor in this exact segment (the same benchmark named elsewhere in your\n" +
    "   research) — false if this would be a first-of-its-kind entrant.\n" +
    "10. estimatedPointsBeat: if estimatedBenchmarkExists is true, your best-evidenced\n" +
    "   guess at how many points (0-10 scale) this idea's claimed gap would beat that\n" +
    "   benchmark by. Omit or set to null if you can't support a number.\n" +
    "11. Name the strongest currently-selling benchmark SKU (brand · variant · pack) from\n" +
    "    public citations or listings — do not invent a Nielsen figure without a public citation.\n" +
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
    "Always include generalCategory, benchmarkName, growthStage, and sourceTier.\n" +
    "generalCategory must describe the product's real-world commercial category in plain market terms ONLY. " +
    "The word \"CavinKare\" must never appear in this field, under any circumstance, for any reason — not to confirm a fit, not to deny one, not to hedge. " +
    "If you find yourself about to write \"CavinKare,\" stop and rephrase without it.\n" +
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
    `GENERAL_CATEGORY: required — name the real-world commercial category in plain market terms ONLY.\n` +
    `The word "CavinKare" must never appear in this field, under any circumstance, for any reason —\n` +
    `not to confirm a fit, not to deny one, not to hedge. If you find yourself about to write "CavinKare,"\n` +
    `stop and rephrase without it.\n` +
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
        "Identify the real-world commercial category this product belongs to, in plain market/industry terms — describe what it *is*, not what company might make it. generalCategory must describe the product's real-world commercial category in plain market terms ONLY. The word \"CavinKare\" must never appear in this field, under any circumstance, for any reason — not to confirm a fit, not to deny one, not to hedge. If you find yourself about to write \"CavinKare,\" stop and rephrase without it. One short label, e.g. \"ready-to-cook marinated meat\" or \"herbal hair oil\".",
      useWebSearch: false,
      maxTokens: 160,
      temperature: 0,
    });
    const obj = parseStrictJson(result.text, { label: "filter1/generalCategory" });
    const label = stripCavinKareMentions(String(obj?.generalCategory || "").trim());
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
  const userText = buildSizingUserText({
    ideaText,
    categoryName,
    attribute,
    benchmarkName,
    isPureCommodity,
    brandFit,
    pricePerUnit,
    scope,
  });

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
    return {
      parsed: generalCategory ? { generalCategory: stripCavinKareMentions(generalCategory) } : null,
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
  parsed.estimatedBenchmarkExists = asTriBool(parsed.estimatedBenchmarkExists);
  const tier = Number(parsed.sourceTier);
  parsed.sourceTier = tier === 1 || tier === 2 || tier === 3 ? tier : null;
  parsed.generalCategory = stripCavinKareMentions(String(parsed.generalCategory || "").trim()) || null;
  if (parsed.generalCategory === "..." || /^n\/a$/i.test(parsed.generalCategory || "")) {
    parsed.generalCategory = null;
  }
  if (!parsed.generalCategory) {
    parsed.generalCategory = stripCavinKareMentions(await inferGeneralCategory(ideaText || categoryName));
  }
  parsed.verdictReason = stripCavinKareMentions(parsed.verdictReason);
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
