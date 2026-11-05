import { stripCavinKareMentions } from "./sanitizeAiText.js";
import {
  aggregateTechShiftRisk,
  formatObsolescenceVerdict,
  normalizeTechShiftRisk,
} from "./techShiftRisk.js";
import { BENCHMARK_UNVERIFIED_COPY, RESEARCH_FAILED_COPY, isAttributePlaceholderCopy } from "./researchFailureCopy.js";
import { stampResearchSteps } from "./researchProgress.js";
import { buildStepEvidence } from "./evidenceProvenance.js";
import {
  applyEvidenceToFilter1Findings,
  benchmarkCounts,
  categorySizeCounts,
} from "./evidenceRead.js";

/**
 * Capture whether the once-only research pass actually substantiated
 * the research-shaped checklist items (not merely that it ran).
 * Filter 6 is never included.
 */

function looksMissing(value) {
  const s = String(value || "").trim().toLowerCase();
  return (
    !s ||
    s === "unknown" ||
    s === "n/a" ||
    s === "none" ||
    s === "unclear" ||
    s === "not found" ||
    s === "unsure" ||
    s === "not available"
  );
}

function snippet(value, max = 180) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function sourceLine(sources) {
  const first = (Array.isArray(sources) ? sources : []).find((s) => s && (s.title || s.url));
  if (!first) return "";
  return snippet(first.title || first.url, 160);
}

function mergeSources(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const s of Array.isArray(list) ? list : []) {
      if (!s || typeof s !== "object") continue;
      const key = `${s.url || ""}|${s.title || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

function num(value) {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) ? n : null;
}

/** Persist F2 cost-estimate numbers in the same research-cache blob as F1/F3/F4/F5. */
export function costEstimateFromResearch(costResearch = null) {
  if (!costResearch || typeof costResearch !== "object") return null;
  const grammage = String(costResearch.estimatedGrammage || costResearch.grammage || "").trim() || null;
  const cogs = num(costResearch.estimatedCogsPerUnitInr ?? costResearch.cogsAtScale);
  const cogsLow = num(costResearch.estimatedCogsLowInr ?? costResearch.cogsLowInr);
  const cogsHigh = num(costResearch.estimatedCogsHighInr ?? costResearch.cogsHighInr);
  // Part 134 / Part 126 — cost step never fills net margin.
  const gst = num(costResearch.estimatedGstRatePct ?? costResearch.gstRatePct);
  const qcomPlan = Array.isArray(costResearch.qcomPlan) ? costResearch.qcomPlan : null;
  if (!grammage && cogs == null && gst == null && !qcomPlan) return null;
  return {
    cogsAtScale: cogs,
    cogsLowInr: cogsLow,
    cogsHighInr: cogsHigh,
    cogsBasis: String(costResearch.cogsBasis || "").trim() || null,
    confidenceNote: String(costResearch.confidenceNote || "").trim() || null,
    netMarginAtScale: null,
    gstRatePct: gst,
    gstBasis: String(costResearch.gstBasis || "").trim() || null,
    gstKind: String(costResearch.gstKind || "").trim() || null,
    grammage,
    qcomTrajectory: String(costResearch.qcomTrajectory || "").trim() || null,
    qcomPlan,
    competitorPriceInr: num(costResearch.competitorPriceInr),
    competitorPackSize: String(costResearch.competitorPackSize || "").trim() || null,
    competitorName: String(costResearch.competitorName || "").trim() || null,
    estimatedMrpInr: null,
    sources: Array.isArray(costResearch.sources) ? costResearch.sources : [],
  };
}

export function f2SuggestionsFromCostEstimate(cost = null) {
  const estimate = costEstimateFromResearch(cost) || (cost && typeof cost === "object" ? cost : null);
  if (!estimate) return {};
  const out = {};
  if (estimate.cogsAtScale != null) out.cogsAtScale = estimate.cogsAtScale;
  if (estimate.cogsLowInr != null) out.cogsLowInr = estimate.cogsLowInr;
  if (estimate.cogsHighInr != null) out.cogsHighInr = estimate.cogsHighInr;
  if (estimate.cogsBasis) out.cogsBasis = estimate.cogsBasis;
  if (estimate.confidenceNote) out.cogsConfidenceNote = estimate.confidenceNote;
  if (Array.isArray(estimate.sources) && estimate.sources.length) out.cogsSources = estimate.sources;
  // Never suggest net margin (Part 126 / Part 134).
  if (estimate.gstRatePct != null) out.gstRatePct = estimate.gstRatePct;
  if (estimate.gstBasis) out.gstBasis = estimate.gstBasis;
  if (estimate.grammage) out.grammage = estimate.grammage;
  if (estimate.qcomTrajectory) out.qcomTrajectory = estimate.qcomTrajectory;
  if (Array.isArray(estimate.qcomPlan) && estimate.qcomPlan.length) out.qcomPlan = estimate.qcomPlan;
  if (estimate.competitorPriceInr != null) out.competitorPriceInr = estimate.competitorPriceInr;
  if (estimate.competitorPackSize) out.competitorPackSize = estimate.competitorPackSize;
  return out;
}

export function cachedCostEstimateFrom(cached = null) {
  if (!cached || typeof cached !== "object") return null;
  const fromFindings = costEstimateFromResearch(cached.researchFindings?.f2?.costEstimate);
  if (fromFindings) return fromFindings;
  return costEstimateFromResearch(cached.suggestions?.f2);
}

export function hasCachedCostEstimate(cached = null) {
  return Boolean(cachedCostEstimateFrom(cached));
}

export function logCostEstimateCache(hash, cachedCostEstimate) {
  console.log(
    `[primus/cost-estimate] hash=${hash} cached=${!!cachedCostEstimate} grammage=${cachedCostEstimate?.grammage ?? "REGENERATING"}`
  );
}

/**
 * @param {{ filter1?: object, filter4?: object, marginElasticityResearch?: object|null, priceEventsResearch?: object|null, sizingResearch?: object|null, costResearch?: object|null }} parts
 */
export function buildResearchFindings({
  filter1 = {},
  filter4 = {},
  marginElasticityResearch = null,
  priceEventsResearch = null,
  sizingResearch = null,
  costResearch = null,
  evidenceRead = null,
  statedBenchmark = "",
  doc = null,
} = {}) {
  const f1Sources = filter1.sources || [];
  const researchFailed = Boolean(filter1.researchFailed);
  const benchmarkName = String(filter1.benchmarkName || "").trim();
  const foundCompetitorName = String(
    filter1.foundBenchmarkName || filter1.researchedBenchmarkName || ""
  ).trim();
  // D8: a stated name alone never verifies. Research must report a found competitor
  // (or a non-placeholder finding with estimatedBenchmarkExists), not merely echo the form.
  let benchmarkVerified = benchmarkCounts({
    researchFailed,
    estimatedBenchmarkExists: filter1.estimatedBenchmarkExists,
    benchmarkName,
    statedBenchmark: statedBenchmark || benchmarkName,
    evidenceFound: false,
    foundCompetitorName:
      foundCompetitorName ||
      (filter1.estimatedBenchmarkExists === true &&
      !looksMissing(filter1.benchmarkFinding) &&
      !isAttributePlaceholderCopy(filter1.benchmarkFinding)
        ? benchmarkName
        : ""),
  });
  const rawEvidence = researchFailed
    ? RESEARCH_FAILED_COPY
    : !looksMissing(filter1.benchmarkFinding) && !isAttributePlaceholderCopy(filter1.benchmarkFinding)
      ? filter1.benchmarkFinding
      : benchmarkVerified
        ? snippet([benchmarkName, sourceLine(f1Sources)].filter(Boolean).join(" — "))
        : filter1.estimatedBenchmarkExists === false
          ? BENCHMARK_UNVERIFIED_COPY
          : !isAttributePlaceholderCopy(filter1.verdictReason)
            ? snippet(filter1.verdictReason)
            : BENCHMARK_UNVERIFIED_COPY;
  let benchmarkEvidence = stripCavinKareMentions(
    isAttributePlaceholderCopy(rawEvidence) ? BENCHMARK_UNVERIFIED_COPY : rawEvidence
  );
  const tam = num(filter1.categoryTamCr ?? filter1.reconciliation?.p50Cr);
  const reconStatus = String(filter1.reconciliation?.status || "").toUpperCase();
  let categorySizeFound = categorySizeCounts({
    tam,
    reconStatus,
    verdict: filter1.verdict,
    researchFailed,
    evidenceFound: false,
  });

  let categorySizeEvidence = "";
  if (researchFailed) {
    categorySizeEvidence = RESEARCH_FAILED_COPY;
  } else if (categorySizeFound && tam != null && Number(tam) > 0) {
    categorySizeEvidence = stripCavinKareMentions(
      `Working category size ₹${tam} Cr${sourceLine(f1Sources) ? ` — ${sourceLine(f1Sources)}` : ""}`
    );
  } else if (!categorySizeFound) {
    categorySizeEvidence = stripCavinKareMentions(
      snippet(filter1.reconciliation?.diagnosis || filter1.reconciliation?.reason || filter1.verdictReason) ||
        "no triangulated category size"
    );
  }

  // Part 135 — F3 success is price-events research (cliff rule), not the old MRP band.
  const priceEventsOk = Boolean(
    priceEventsResearch &&
      (priceEventsResearch.annualIncreasePct != null ||
        (Array.isArray(priceEventsResearch.events) && priceEventsResearch.events.length) ||
        (Array.isArray(priceEventsResearch.returnedSources) && priceEventsResearch.returnedSources.length))
  );
  const priceEventsAttempted = Boolean(priceEventsResearch);
  const elasticityOk = marginElasticityResearch?.maxMarginPct != null;
  const marginAttempted = Boolean(
    marginElasticityResearch &&
      (marginElasticityResearch.maxMarginPct != null ||
        marginElasticityResearch.minMrpInr != null ||
        marginElasticityResearch.maxMrpInr != null ||
        marginElasticityResearch.basis ||
        marginElasticityResearch.error ||
        marginElasticityResearch.researchFailed ||
        (Array.isArray(marginElasticityResearch.sources) && marginElasticityResearch.sources.length))
  );
  const marginSilent = marginAttempted && !elasticityOk && !marginElasticityResearch?.researchFailed && !marginElasticityResearch?.error;
  const f3ResearchFailed = priceEventsAttempted
    ? Boolean(priceEventsResearch?.error || priceEventsResearch?.researchFailed)
    : Boolean(
        marginElasticityResearch?.researchFailed ||
          (marginElasticityResearch?.error && !elasticityOk) ||
          marginSilent
      );
  let priceEvidence = "";
  if (priceEventsOk) {
    const n = Array.isArray(priceEventsResearch.events) ? priceEventsResearch.events.length : 0;
    const verified = Array.isArray(priceEventsResearch.events)
      ? priceEventsResearch.events.filter((e) => e?.verified).length
      : 0;
    priceEvidence = stripCavinKareMentions(
      `Price-events register: ${verified} verified of ${n}` +
        (priceEventsResearch.annualIncreasePct != null
          ? `; inflation cover ${priceEventsResearch.annualIncreasePct}%/yr`
          : "")
    );
  } else if (elasticityOk) {
    priceEvidence = stripCavinKareMentions(
      snippet(marginElasticityResearch.basis || "Margin elasticity range computed")
    );
  } else if (priceEventsAttempted) {
    priceEvidence = stripCavinKareMentions(
      snippet(priceEventsResearch?.error) || "price-events research returned no usable register"
    );
  } else if (marginElasticityResearch == null) {
    priceEvidence = "price resilience research did not run";
  } else {
    priceEvidence = stripCavinKareMentions(
      snippet(marginElasticityResearch.basis) || "no usable 10% volume-loss evidence"
    );
  }

  const priceEvents =
    priceEventsResearch && typeof priceEventsResearch === "object"
      ? {
          annualIncreasePct: priceEventsResearch.annualIncreasePct ?? null,
          inflation_source_url: priceEventsResearch.inflation_source_url || "",
          inflation_quote: priceEventsResearch.inflation_quote || "",
          events: Array.isArray(priceEventsResearch.events) ? priceEventsResearch.events : [],
          returnedSources: Array.isArray(priceEventsResearch.returnedSources)
            ? priceEventsResearch.returnedSources
            : [],
        }
      : null;

  const f4ResearchFailed = Boolean(filter4.researchFailed);
  const risk = normalizeTechShiftRisk(
    filter4.techShiftRisk || { dimensions: filter4.dimensions, sources: filter4.sources }
  );
  const dimensions = risk?.dimensions || null;
  const overallRisk = dimensions ? aggregateTechShiftRisk(dimensions) : null;
  const techShiftFound = !f4ResearchFailed && Boolean(dimensions);
  const threatEvidence = stripCavinKareMentions(
    f4ResearchFailed
      ? RESEARCH_FAILED_COPY
      : techShiftFound
        ? snippet(
            Object.values(dimensions)
              .map((d) => `${d.risk}: ${d.reason}`)
              .join(" ")
          )
        : snippet(filter4.verdictReason) || "structural obsolescence dimensions were not assessed"
  );

  const householdsReachedY3Mn = num(sizingResearch?.householdsReachedY3Mn);
  const trialRatePct = num(sizingResearch?.trialRatePct);
  const repeatConversionPct = num(sizingResearch?.repeatConversionPct);
  const purchaseFrequencyYr = num(sizingResearch?.purchaseFrequencyYr);
  const avgPackValueInr = num(sizingResearch?.avgPackValueInr);
  const factors = [
    householdsReachedY3Mn,
    trialRatePct,
    repeatConversionPct,
    purchaseFrequencyYr,
    avgPackValueInr,
  ];
  const filledFactors = factors.filter((n) => n != null).length;
  const sizingDeadEnd = Boolean(sizingResearch?.error) && filledFactors === 0;
  const sizingFactorsFound = !sizingDeadEnd && filledFactors > 0;
  const sizingEvidence = stripCavinKareMentions(
    sizingFactorsFound
      ? `${filledFactors} of 5 sizing factors returned${sourceLine(sizingResearch?.sources) ? ` — ${sourceLine(sizingResearch.sources)}` : ""}`
      : snippet(sizingResearch?.error ? `sizing research failed (${sizingResearch.error})` : "no household-model factors returned")
  );

  const costEstimate = costEstimateFromResearch(costResearch);

  let f1Out = {
    researchFailed,
    categoryKeyAttributes: Array.isArray(filter1.categoryKeyAttributes)
      ? filter1.categoryKeyAttributes
      : [],
    attributeValidation: Array.isArray(filter1.attributeValidation) ? filter1.attributeValidation : [],
    noCompetitorCheck: filter1.noCompetitorCheck && typeof filter1.noCompetitorCheck === "object"
      ? filter1.noCompetitorCheck
      : null,
    benchmarkVerified,
    benchmarkEvidence,
    categorySizeFound,
    categorySizeEvidence,
    evidence: filter1.evidence || buildStepEvidence(),
  };

  if (evidenceRead) {
    f1Out = applyEvidenceToFilter1Findings(f1Out, evidenceRead, doc || { f1: { benchmark: statedBenchmark } }, tam);
  }

  return stampResearchSteps({
    evidenceRead: evidenceRead || f1Out.evidenceRead || { status: "none", facts: [], used: [] },
    f1: f1Out,
    f2: {
      costEstimate,
      evidence: costResearch?.evidence || buildStepEvidence(),
    },
    f3: {
      researchFailed: f3ResearchFailed,
      failureReason: f3ResearchFailed
        ? priceEventsAttempted
          ? "price-events research failed"
          : marginSilent
            ? "no usable range"
            : null
        : null,
      marginElasticityFound: Boolean(elasticityOk),
      priceEventsFound: Boolean(priceEventsOk),
      priceEvents,
      priceEvidence: stripCavinKareMentions(priceEvidence),
      competitiveNote: stripCavinKareMentions(marginElasticityResearch?.competitiveNote || "") || null,
      evidence:
        priceEventsResearch?.evidence ||
        marginElasticityResearch?.evidence ||
        buildStepEvidence(),
    },
    f4: {
      researchFailed: f4ResearchFailed,
      techShiftFound,
      overallRisk,
      threatEvidence,
      obsolescenceVerdict:
        stripCavinKareMentions(filter4.obsolescenceVerdict || "") ||
        formatObsolescenceVerdict({ overallRisk, dimensions }),
      evidence: filter4.evidence || buildStepEvidence(),
    },
    // Keep numeric factors here so idea-scale (10g/100g/1000g) can mint from research
    // without waiting for humans to unlock and accept Filter 5 form fields.
    f5: {
      researchFailed: Boolean(sizingResearch?.researchFailed) || sizingDeadEnd,
      sizingFactorsFound,
      sizingEvidence,
      householdsReachedY3Mn,
      trialRatePct,
      repeatConversionPct,
      purchaseFrequencyYr,
      avgPackValueInr,
      evidence: sizingResearch?.evidence || buildStepEvidence(),
    },
    sources: mergeSources(
      f1Sources,
      filter4.sources,
      marginElasticityResearch?.sources,
      priceEventsResearch?.sources || priceEventsResearch?.returnedSources,
      sizingResearch?.sources,
      costResearch?.sources
    ),
  });
}

const F5_SIZING_FACTOR_KEYS = [
  "householdsReachedY3Mn",
  "trialRatePct",
  "repeatConversionPct",
  "purchaseFrequencyYr",
  "avgPackValueInr",
];

/**
 * Backfill researchFindings.f5 factor numbers from suggestions (older caches only
 * stored sizingFactorsFound/sizingEvidence on findings, while numbers lived on suggestions.f5).
 */
export function enrichResearchFindingsSizingFactors(findings = null, suggestions = null) {
  const base =
    findings && typeof findings === "object" ? { ...findings } : {};
  const f5 = base.f5 && typeof base.f5 === "object" ? { ...base.f5 } : {};
  const sug = suggestions?.f5 && typeof suggestions.f5 === "object" ? suggestions.f5 : {};
  let filled = false;
  for (const key of F5_SIZING_FACTOR_KEYS) {
    if (num(f5[key]) != null) continue;
    const fromSug = num(sug[key]);
    if (fromSug == null) continue;
    f5[key] = fromSug;
    filled = true;
  }
  if (!filled) return findings;
  const filledCount = F5_SIZING_FACTOR_KEYS.filter((k) => num(f5[k]) != null).length;
  if (filledCount > 0 && f5.sizingFactorsFound == null) f5.sizingFactorsFound = true;
  return { ...base, f5 };
}
