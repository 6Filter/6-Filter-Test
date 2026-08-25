import { callLlm } from "./callLlm.js";
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

async function runPhase1Scorecard(trimmedIdea, image) {
  const prompt =
    `PRODUCT IDEA:\n${trimmedIdea}` +
    (image?.kind === "pdf"
      ? "\n\nA PDF of the idea / insight is attached — transcribe and factor it into novelty and evidence."
      : image?.data
        ? "\n\nAn image (product sketch / insight / reference) is attached — transcribe if needed and factor it into novelty and evidence."
        : "");

  const { text: raw } = await callLlm({
    userText: trimInput(prompt, image?.data ? 4000 : 1200),
    system: SCORING_SYSTEM_PROMPT,
    image,
    maxTokens: 1200,
  });

  if (!raw?.trim()) {
    throw new Error("The model returned an empty response. Try again.");
  }

  const cleaned = String(raw).replace(/```json/gi, "```").replace(/```/g, "").trim();
  const parsed = parseValidationJson(cleaned);
  return buildValidationPayload(parsed, trimmedIdea);
}

export async function analyzeIdea(ideaText, image = null, ideaType = "product", npdInputs = {}) {
  const trimmedIdea = String(ideaText || "").trim();
  const type = ideaType === "process" ? "process" : "product";

  if (!trimmedIdea && !image?.data) {
    throw new Error(
      type === "process"
        ? "Describe the process idea or upload a PDF, Word file, or image."
        : "Describe the product idea or upload a PDF, Word file, or image."
    );
  }

  if (type === "process") {
    const prompt =
      `PROCESS IDEA:\n${trimmedIdea}` +
      (image?.kind === "pdf"
        ? "\n\nA PDF of the process idea / insight is attached — transcribe and factor it into efficiency, feasibility, and scalability."
        : image?.data
          ? "\n\nAn image (flow / insight / reference) is attached — transcribe if needed and factor it into feasibility and evidence of the as-is process."
          : "");

    const { text: raw } = await callLlm({
      userText: trimInput(prompt, image?.data ? 4000 : 1200),
      system: PROCESS_SCORING_SYSTEM_PROMPT,
      image,
    });

    if (!raw?.trim()) {
      throw new Error("The model returned an empty response. Try again.");
    }

    const cleaned = String(raw).replace(/```json/gi, "```").replace(/```/g, "").trim();
    const parsed = parseProcessValidationJson(cleaned, {
      extractJsonObject,
      repairJson,
      repairTruncatedJson,
    });
    return buildProcessValidationPayload(parsed, trimmedIdea);
  }

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

  const filter1Task = brandFit?.mismatch
    ? Promise.resolve({
        verdict: "FAIL",
        verdictReason: brandFit.reason,
        reason: brandFit.reason,
        sources: [],
      })
    : runFilter1({
        ideaText: trimmedIdea,
        attribute: npd.attribute,
        benchmarkName: npd.benchmarkName,
        isPureCommodity: npd.isPureCommodity,
        brandFit,
        pricePerUnit: npd.pricePerUnit,
      });

  const [phase1Result, filter1Result, filter4Result] = await Promise.allSettled([
    runPhase1Scorecard(trimmedIdea, image),
    filter1Task,
    runFilter4({ ideaText: trimmedIdea }),
  ]);

  if (phase1Result.status !== "fulfilled") {
    throw phase1Result.reason instanceof Error
      ? phase1Result.reason
      : new Error(phase1Result.reason?.message || "Scorecard failed. Try again.");
  }
  const payload = phase1Result.value;

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
  if (filter1.attribute && !npd.attribute) {
    npd.attribute = filter1.attribute;
  }
  if (filter1.isPureCommodity && !npd.isPureCommodity) {
    npd.isPureCommodity = true;
  }

  const filter2 = computeFilter2({
    division: npd.division,
    declaredNetMarginPct: npd.declaredNetMarginPct,
    estimatedNetMarginPct: filter1.estimatedNetMarginPct,
  });
  const filter3 = computeFilter3({
    benchmarkExists: npd.benchmarkExists,
    pointsBeat: npd.pointsBeat,
    pricePerUnit: npd.pricePerUnit,
    volumeLossPctAtFixedPoint: npd.volumeLossPctAtFixedPoint,
    estimatedVolumeLossPct: filter1.estimatedVolumeLossPct,
    benchmarkName: npd.benchmarkName,
  });

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
