import { callAnthropic } from "./callAnthropic.js";
import {
  SCORING_SYSTEM_PROMPT,
  buildValidationPayload,
  parseValidationJson,
  trimInput,
  extractJsonObject,
  repairJson,
  repairTruncatedJson,
} from "./scoring.js";
import {
  PROCESS_SCORING_SYSTEM_PROMPT,
  buildProcessValidationPayload,
  parseProcessValidationJson,
} from "./processScoring.js";
import { applyBrandFitToFilter, resolveBrandFit } from "./ckBrands.js";
import { detectDivision } from "./npdMaster.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { computeFilter2 } from "./filters/filter2NetMargin.js";
import { computeFilter3 } from "./filters/filter3PriceResilience.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { computeWeightage } from "./npdWeightage.js";

function emptyFilter(name, reason) {
  return {
    verdict: "NEEDS_INPUT",
    verdictReason: reason || `${name} could not run.`,
    reason: reason || `${name} could not run.`,
    sources: [],
  };
}

export async function analyzeIdea(ideaText, image = null, ideaType = "product", npdInputs = {}) {
  const trimmedIdea = String(ideaText || "").trim();
  const type = ideaType === "process" ? "process" : "product";

  if (!trimmedIdea) {
    throw new Error(
      type === "process" ? "Describe the process idea first." : "Describe the product idea first."
    );
  }

  if (type === "process") {
    const prompt =
      `PROCESS IDEA:\n${trimmedIdea}` +
      (image?.data
        ? "\n\nAn image (flow / reference) is attached — factor it into feasibility and evidence of the as-is process."
        : "");

    const { text: raw } = await callAnthropic({
      userText: trimInput(prompt, 1200),
      system: PROCESS_SCORING_SYSTEM_PROMPT,
      image,
    });

    if (!raw?.trim()) {
      throw new Error("Claude returned an empty response. Try again.");
    }

    const cleaned = String(raw).replace(/```json/gi, "```").replace(/```/g, "").trim();
    const parsed = parseProcessValidationJson(cleaned, {
      extractJsonObject,
      repairJson,
      repairTruncatedJson,
    });
    return buildProcessValidationPayload(parsed, trimmedIdea);
  }

  const prompt =
    `PRODUCT IDEA:\n${trimmedIdea}` +
    (image?.data
      ? "\n\nAn image (product sketch / reference) is attached — factor it into novelty and evidence."
      : "");

  const { text: raw } = await callAnthropic({
    userText: trimInput(prompt, 1200),
    system: SCORING_SYSTEM_PROMPT,
    image,
  });

  if (!raw?.trim()) {
    throw new Error("Claude returned an empty response. Try again.");
  }

  const cleaned = String(raw).replace(/```json/gi, "```").replace(/```/g, "").trim();
  const parsed = parseValidationJson(cleaned);
  const payload = buildValidationPayload(parsed, trimmedIdea);

  const brandFit = resolveBrandFit(trimmedIdea);
  const division = String(npdInputs.division || "").trim() || detectDivision(trimmedIdea);
  const npd = {
    attribute: String(npdInputs.attribute || "").trim(),
    benchmarkName: String(npdInputs.benchmarkName || "").trim(),
    isPureCommodity: Boolean(npdInputs.isPureCommodity),
    division,
    declaredNetMarginPct: npdInputs.declaredNetMarginPct,
    benchmarkExists: Boolean(npdInputs.benchmarkExists),
    pointsBeat: npdInputs.pointsBeat,
    pricePerUnit: npdInputs.pricePerUnit,
    volumeLossPctAtFixedPoint: npdInputs.volumeLossPctAtFixedPoint,
  };

  const filter2 = computeFilter2({
    division: npd.division,
    declaredNetMarginPct: npd.declaredNetMarginPct,
  });
  const filter3 = computeFilter3({
    benchmarkExists: npd.benchmarkExists,
    pointsBeat: npd.pointsBeat,
    pricePerUnit: npd.pricePerUnit,
    volumeLossPctAtFixedPoint: npd.volumeLossPctAtFixedPoint,
    benchmarkName: npd.benchmarkName,
  });

  const [filter1Result, filter4Result] = await Promise.allSettled([
    runFilter1({
      ideaText: trimmedIdea,
      attribute: npd.attribute,
      benchmarkName: npd.benchmarkName,
      isPureCommodity: npd.isPureCommodity,
      brandFit,
    }),
    runFilter4({ ideaText: trimmedIdea }),
  ]);

  const filter1 =
    applyBrandFitToFilter(
      filter1Result.status === "fulfilled"
        ? filter1Result.value
        : emptyFilter(
            "Filter 1",
            `Filter 1 research failed: ${filter1Result.reason?.message || "unknown error"}`
          ),
      brandFit
    );
  const filter4 =
    filter4Result.status === "fulfilled"
      ? filter4Result.value
      : emptyFilter(
          "Filter 4",
          `Filter 4 research failed: ${filter4Result.reason?.message || "unknown error"}`
        );

  if (filter1.benchmarkName && !npd.benchmarkName) {
    npd.benchmarkName = filter1.benchmarkName;
  }

  const weightage = computeWeightage({
    filter1,
    filter2,
    filter3,
    filter4,
    baseRevenueEstimateCr: payload.revenuePotentialCrores,
  });

  const gramClass = weightage.gramClass;
  const ideaWeight = gramClass || payload.ideaWeight;

  return {
    ...payload,
    ideaType: "product",
    phase1Max: 60,
    npdInputs: npd,
    brandFit,
    filter1,
    filter2,
    filter3,
    filter4,
    overallVerdict: weightage.overallVerdict,
    gramClass,
    ideaWeight,
    adjustedRevenueCr: weightage.adjustedRevenueCr,
    canEscalateToCKR: Boolean(weightage.canEscalateToCKR),
    failedFilters: weightage.failedFilters || [],
    escalationStatus: "none",
    escalationNotes: null,
  };
}
