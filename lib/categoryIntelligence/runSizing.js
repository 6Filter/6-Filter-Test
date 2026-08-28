import { brandRosterForPrompt } from "../ckBrands.js";
import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { loadSkillText } from "../skills/loadSkill.js";
import { assembleFromModelPayload } from "./assemble.js";
import { hasAnyCalibration, saveSizingRun } from "./store.js";

const FILTER1_JSON_SCHEMA =
  "Return ONLY minified JSON:\n" +
  '{"categoryArchetype":"...","capacityDisclosed":false,"gatingAsset":false,' +
  '"enginesRun":[{"engineId":"E1","inputs":{},"weakness":"...","sources":[{"title":"...","url":"..."}]}],' +
  '"enginesNotRun":[{"engineId":"E4","reason":"..."}],' +
  '"reconciliation":{"status":"TIGHT|MODERATE|DIAGNOSE|INSUFFICIENT","diagnosis":"..."},' +
  '"growthDecomposition":{"valueGrowthPct":0,"priceGrowthPct":0},' +
  '"growthStage":"low-penetration|mature-cluttered|unclear","benchmarkName":"...","attribute":"...","gapClaim":"...","gapMagnitude":"...",' +
  '"parityRisk":"none|minor|major","whatCouldNotBeEstablished":"...","differentiationExempt":false,' +
  '"estimatedNetMarginPct":0,"estimatedVolumeLossPct":0,"isPureCommodity":false,' +
  '"estimatedBenchmarkExists":false,"estimatedPointsBeat":0,' +
  '"sources":[{"title":"...","url":"..."}],' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"..."}';

function filter1ResearchPrompt() {
  return (
    loadSkillText("SKILL.md", "references/methods.md", "references/sources.md") +
    "\n\n---\n\n" +
    "You are Filter 1 of 6 Filter Test — \"Opportunity to Grow.\" Apply the category-intelligence\n" +
    "method above to this specific idea. Use the web_search tool, and only cite sources you\n" +
    "actually found — named datasets from the atlas above (HCES, ASI, IIP, WPI/CPI item\n" +
    "indices, DGCIS Tradestat, Economic Census, MCA21, DRHP/RHP industry chapters, credit\n" +
    "rating rationales, IBEF/industry-body reports) or company disclosures, not generic\n" +
    "blog claims.\n" +
    "Write a structured research brief in prose and bullets (not JSON). Cover:\n" +
    "1. Category archetype and which 2–3 engines you are running and why.\n" +
    "2. For each engine: every input value, the source, and whether it is missing (do not invent).\n" +
    "3. Reconciliation notes (spread, diagnosis if wide).\n" +
    "4. Growth decomposition (value vs item-level price index) and PRICE-LED / MIXED / VOLUME-LED.\n" +
    "5. growthStage, benchmark, attribute, gap claim, parity risk.\n" +
    "6. What you could NOT establish from free data.\n" +
    "7. estimatedNetMarginPct, estimatedVolumeLossPct, isPureCommodity, capacityDisclosed, gatingAsset.\n" +
    "8. estimatedBenchmarkExists: true only if you found a real, currently-selling named\n" +
    "   competitor in this exact segment (the same benchmark named elsewhere in your\n" +
    "   research) — false if this would be a first-of-its-kind entrant.\n" +
    "9. estimatedPointsBeat: if estimatedBenchmarkExists is true, your best-evidenced\n" +
    "   guess at how many points (0-10 scale) this idea's claimed gap would beat that\n" +
    "   benchmark by, based on the gap claim and evidence you already gathered — not a\n" +
    "   fabricated number, your genuine read of the evidence. Omit or set to null if you\n" +
    "   can't support a number.\n" +
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
    "Use only the research brief. " +
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
    `CATEGORY_NAME: ${categoryName?.trim() || "(infer from the idea)"}\n` +
    `SCOPE: ${scope?.trim() || "(All-India retail-equivalent unless the idea specifies otherwise)"}\n` +
    `STATED_ATTRIBUTE: ${attribute?.trim() || "(none — identify the top purchase-decision attribute)"}\n` +
    `STATED_BENCHMARK: ${benchmarkName?.trim() || "(none — identify the strongest named competitor in this exact segment)"}\n` +
    `IS_PURE_COMMODITY: ${isPureCommodity ? "true" : "infer from the idea"}\n` +
    `${priceNote}\n` +
    `${brandNote}`
  );
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
    return { parsed: null, sources: sources || [], error: error || "parse" };
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
