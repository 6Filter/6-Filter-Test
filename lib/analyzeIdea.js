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
import { detectDivision } from "./npdMaster.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { computeFilter2 } from "./filters/filter2NetMargin.js";
import { resolveDivisionFit } from "./filters/resolveDivisionFit.js";
import { evaluatePriceResilience } from "./priceResilience.js";
import { FIXED_PRICE_POINTS, VOLUME_LOSS_CEILING_PCT } from "./lockedConstants.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { computeWeightage } from "./npdWeightage.js";
import { latestCalibration } from "./categoryIntelligence/store.js";

function emptyFilter(name, reason) {
  return {
    verdict: "NEEDS_INPUT",
    verdictReason: reason || `${name} could not run.`,
    reason: reason || `${name} could not run.`,
    sources: [],
  };
}

async function readAttachment(trimmedIdea, image) {
  if (!image?.data) return "";
  const notes = await callLlm({
    userText:
      (trimmedIdea ? `Typed idea:\n${trimmedIdea}\n\n` : "") +
      "Read the attached file thoroughly. Transcribe every visible word (brand, product name, claims, ingredients, price, pack format, net weight). Then describe the product or process concept in 5–8 sentences. Prose only — no JSON.",
    system:
      "You read product screenshots, pack shots, sketches, and PDFs. Extract facts so later research can run from text. Do not invent pack copy that is not visible.",
    image,
    maxTokens: 2048,
    useWebSearch: false,
  });
  if (notes.stopReason === "max_tokens") {
    const err = new Error("truncated");
    err.failureKind = "truncated";
    throw err;
  }
  return String(notes.text || "").trim();
}

async function runPhase1Scorecard(trimmedIdea, visionNotes = "") {
  const prompt = visionNotes
    ? `Scoring brief from the idea and attached file (do not invent beyond this):\n\n${visionNotes}\n\nOriginal idea:\n${trimmedIdea}\n\nReturn the minified JSON object specified in the system prompt.`
    : `PRODUCT IDEA:\n${trimmedIdea}`;

  const callScore = () =>
    callLlm({
      userText: trimInput(prompt, visionNotes ? 6000 : 1200),
      system: SCORING_SYSTEM_PROMPT,
      maxTokens: 4096,
    });

  let response = await callScore();
  if (response.stopReason === "max_tokens") {
    const err = new Error("truncated");
    err.failureKind = "truncated";
    throw err;
  }
  let raw = response.text ?? "";
  if (!raw?.trim()) {
    throw new Error("The model returned an empty response. Try again.");
  }

  try {
    const parsed = parseValidationJson(raw, {
      stopReason: response.stopReason,
      contentTypes: response.contentTypes || [],
    });
    return buildValidationPayload(parsed, trimmedIdea);
  } catch {
    response = await callScore();
    raw = response.text ?? "";
    const parsed = parseValidationJson(raw, {
      stopReason: response.stopReason,
      contentTypes: response.contentTypes || [],
    });
    return buildValidationPayload(parsed, trimmedIdea);
  }
}

export async function analyzeIdea(ideaText, image = null, _ideaType = "product", npdInputs = {}) {
  const trimmedIdea = String(ideaText || "").trim();

  if (!trimmedIdea && !image?.data) {
    throw new Error("Describe the product idea or upload a PDF, Word file, or image.");
  }

  const visionNotes = await readAttachment(trimmedIdea, image);
  const ideaForResearch = visionNotes
    ? `${trimmedIdea}\n\n--- Attached file (read by vision) ---\n${visionNotes}`
    : trimmedIdea;

  let division = String(npdInputs.division || "").trim() || detectDivision(ideaForResearch);
  let divisionFit = null;
  if (!division) {
    console.log("[primus/division] detectDivision=null — running resolveDivisionFit");
    divisionFit = await resolveDivisionFit(ideaForResearch);
    division = divisionFit.matchedDivision || null;
  } else {
    console.log(`[primus/division] detectDivision=${division} — skipped resolveDivisionFit`);
  }
  const npd = {
    attribute: String(npdInputs.attribute || "").trim(),
    benchmarkName: String(npdInputs.benchmarkName || "").trim(),
    isPureCommodity: Boolean(npdInputs.isPureCommodity),
    division,
    divisionFit,
    declaredNetMarginPct: npdInputs.declaredNetMarginPct,
    benchmarkExists: npdInputs.benchmarkExists != null ? Boolean(npdInputs.benchmarkExists) : null,
    pointsBeat: npdInputs.pointsBeat,
    pricePerUnit: npdInputs.pricePerUnit,
    volumeLossPctAtFixedPoint: npdInputs.volumeLossPctAtFixedPoint,
  };

  const filter1Task = runFilter1({
    ideaText: ideaForResearch,
    attribute: npd.attribute,
    benchmarkName: npd.benchmarkName,
    isPureCommodity: npd.isPureCommodity,
    pricePerUnit: npd.pricePerUnit,
  });

  const [phase1Result, filter1Result, filter4Result] = await Promise.allSettled([
    runPhase1Scorecard(trimmedIdea, visionNotes),
    filter1Task,
    runFilter4({ ideaText: ideaForResearch }),
  ]);

  if (phase1Result.status !== "fulfilled") {
    throw phase1Result.reason instanceof Error
      ? phase1Result.reason
      : new Error(phase1Result.reason?.message || "Scorecard failed. Try again.");
  }
  const payload = phase1Result.value;

  const filter1 =
    filter1Result.status === "fulfilled"
      ? filter1Result.value
      : emptyFilter(
          "Filter 1",
          `Filter 1 research failed: ${filter1Result.reason?.message || "unknown error"}`
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

  const revenueArchetype = String(filter1.categoryArchetype || npd.division || "").trim();
  const [marginCalibration, revenueCalibration] = await Promise.all([
    npd.division ? latestCalibration("FILTER2_MARGIN", npd.division) : Promise.resolve(null),
    revenueArchetype ? latestCalibration("WEIGHTAGE_REVENUE", revenueArchetype) : Promise.resolve(null),
  ]);

  const filter2 = await computeFilter2({
    division: npd.division,
    divisionFit: npd.divisionFit,
    declaredNetMarginPct: npd.declaredNetMarginPct,
    estimatedNetMarginPct: filter1.estimatedNetMarginPct,
    pricePerUnit: npd.pricePerUnit,
    marginCalibration,
  });
  const aiBenchmarkExists = Boolean(filter1.estimatedBenchmarkExists ?? filter1.benchmarkName);
  const benchmarkExists = npd.benchmarkExists != null ? npd.benchmarkExists : aiBenchmarkExists;

  // Part 135 — one Filter 3 rule: the 10% volume-loss cliff test.
  const legacyEvents =
    npd.volumeLossPctAtFixedPoint != null || filter1.estimatedVolumeLossPct != null
      ? [
          {
            verified: true,
            crossed_point: null,
            volume_change_pct: -(Number(npd.volumeLossPctAtFixedPoint ?? filter1.estimatedVolumeLossPct) || 0),
            from_price_inr: Number(npd.pricePerUnit) || 0,
            to_price_inr: (Number(npd.pricePerUnit) || 0) * 1.01,
            quote: `volume loss ${npd.volumeLossPctAtFixedPoint ?? filter1.estimatedVolumeLossPct}%`,
            source_url: "legacy://analyzeIdea",
          },
        ]
      : [];
  const resilience = evaluatePriceResilience({
    launchPrice: npd.pricePerUnit,
    annualIncreasePct: npd.annualIncreasePct ?? filter1.estimatedInflationPct ?? 5,
    events: legacyEvents.map((e) => ({
      ...e,
      crossed_point:
        e.crossed_point ??
        FIXED_PRICE_POINTS.find(
          (p) => Number(e.from_price_inr) <= p && Number(e.to_price_inr) > p
        ) ??
        null,
    })),
  });
  const filter3 = {
    pass: resilience.status === "pass",
    verdict: resilience.status === "pass" ? "PASS" : resilience.status === "fail" ? "FAIL" : "NEEDS_INPUT",
    volumeOk: resilience.status !== "fail",
    volumeLossPctAtFixedPoint: resilience.modelledLossPct ?? null,
    nearestFixedPricePoint: resilience.worstPoint ?? null,
    reason:
      resilience.status === "pass"
        ? `Clears the ${VOLUME_LOSS_CEILING_PCT}% volume-loss cliff test.`
        : resilience.status === "fail"
          ? `Projected volume loss exceeds the ${VOLUME_LOSS_CEILING_PCT}% ceiling at ₹${resilience.worstPoint}.`
          : "Price resilience cannot be assessed yet.",
    resilience,
  };
  npd.benchmarkExists = benchmarkExists;

  const weightage = computeWeightage({
    filter1,
    filter2,
    filter3,
    filter4,
    baseRevenueEstimateCr: payload.revenuePotentialCrores,
    revenueCalibration,
    categoryArchetype: revenueArchetype,
  });

  const gramClass = weightage.gramClass;
  const ideaWeight = gramClass || payload.ideaWeight;

  return {
    ...payload,
    ideaType: "product",
    phase1Max: 60,
    npdInputs: npd,
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
    revenueCalibrationNote: weightage.revenueCalibrationNote || "",
    escalationStatus: "none",
    escalationNotes: null,
  };
}
