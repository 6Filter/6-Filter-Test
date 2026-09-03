import { stripCavinKareMentions } from "./sanitizeAiText.js";
import {
  aggregateTechShiftRisk,
  formatObsolescenceVerdict,
  normalizeTechShiftRisk,
} from "./techShiftRisk.js";
import { BENCHMARK_UNVERIFIED_COPY, RESEARCH_FAILED_COPY } from "./researchFailureCopy.js";

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

/**
 * @param {{ filter1?: object, filter4?: object, marginElasticityResearch?: object|null, sizingResearch?: object|null }} parts
 */
export function buildResearchFindings({
  filter1 = {},
  filter4 = {},
  marginElasticityResearch = null,
  sizingResearch = null,
} = {}) {
  const f1Sources = filter1.sources || [];
  const researchFailed = Boolean(filter1.researchFailed);
  const benchmarkName = String(filter1.benchmarkName || "").trim();
  const benchmarkVerified =
    !researchFailed &&
    filter1.estimatedBenchmarkExists !== false &&
    !looksMissing(benchmarkName);
  const tam = num(filter1.categoryTamCr ?? filter1.reconciliation?.p50Cr);
  const reconStatus = String(filter1.reconciliation?.status || "").toUpperCase();
  const categorySizeFound = researchFailed
    ? false
    : tam != null
      ? true
      : reconStatus === "INSUFFICIENT" || reconStatus === "DIAGNOSE"
        ? false
        : Boolean(filter1.verdict === "PASS" && !looksMissing(filter1.verdictReason));

  let categorySizeEvidence = "";
  if (researchFailed) {
    categorySizeEvidence = RESEARCH_FAILED_COPY;
  } else if (tam != null) {
    categorySizeEvidence = stripCavinKareMentions(
      `Working category size ₹${tam} Cr${sourceLine(f1Sources) ? ` — ${sourceLine(f1Sources)}` : ""}`
    );
  } else if (!categorySizeFound) {
    categorySizeEvidence = stripCavinKareMentions(
      snippet(filter1.reconciliation?.diagnosis || filter1.reconciliation?.reason || filter1.verdictReason) ||
        "no triangulated category size"
    );
  }

  const elasticityOk = marginElasticityResearch?.maxMarginPct != null;
  let priceEvidence = "";
  if (elasticityOk) {
    priceEvidence = stripCavinKareMentions(
      snippet(marginElasticityResearch.basis || "Margin elasticity range computed")
    );
  } else if (marginElasticityResearch == null) {
    priceEvidence = "margin elasticity research did not run";
  } else {
    priceEvidence = stripCavinKareMentions(
      snippet(marginElasticityResearch.basis) || "no usable 10% volume-loss ceiling"
    );
  }

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

  const factors = [
    num(sizingResearch?.householdsReachedY3Mn),
    num(sizingResearch?.trialRatePct),
    num(sizingResearch?.repeatConversionPct),
    num(sizingResearch?.purchaseFrequencyYr),
    num(sizingResearch?.avgPackValueInr),
  ];
  const filledFactors = factors.filter((n) => n != null).length;
  const sizingDeadEnd = Boolean(sizingResearch?.error) && filledFactors === 0;
  const sizingFactorsFound = !sizingDeadEnd && filledFactors > 0;
  const sizingEvidence = stripCavinKareMentions(
    sizingFactorsFound
      ? `${filledFactors} of 5 sizing factors returned${sourceLine(sizingResearch?.sources) ? ` — ${sourceLine(sizingResearch.sources)}` : ""}`
      : snippet(sizingResearch?.error ? `sizing research failed (${sizingResearch.error})` : "no household-model factors returned")
  );

  return {
    f1: {
      researchFailed,
      benchmarkVerified,
      benchmarkEvidence: stripCavinKareMentions(
        researchFailed
          ? RESEARCH_FAILED_COPY
          : benchmarkVerified
            ? snippet([benchmarkName, sourceLine(f1Sources)].filter(Boolean).join(" — "))
            : filter1.estimatedBenchmarkExists === false
              ? BENCHMARK_UNVERIFIED_COPY
              : snippet(filter1.verdictReason) || BENCHMARK_UNVERIFIED_COPY
      ),
      categorySizeFound,
      categorySizeEvidence,
    },
    f3: {
      marginElasticityFound: Boolean(elasticityOk),
      priceEvidence: stripCavinKareMentions(priceEvidence),
      competitiveNote: stripCavinKareMentions(marginElasticityResearch?.competitiveNote || "") || null,
    },
    f4: {
      researchFailed: f4ResearchFailed,
      techShiftFound,
      overallRisk,
      threatEvidence,
      obsolescenceVerdict:
        stripCavinKareMentions(filter4.obsolescenceVerdict || "") ||
        formatObsolescenceVerdict({ overallRisk, dimensions }),
    },
    f5: {
      sizingFactorsFound,
      sizingEvidence,
    },
    sources: mergeSources(f1Sources, filter4.sources, marginElasticityResearch?.sources, sizingResearch?.sources),
  };
}
