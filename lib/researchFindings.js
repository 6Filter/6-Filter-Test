import { stripCavinKareMentions } from "./sanitizeAiText.js";

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
  const benchmarkName = String(filter1.benchmarkName || "").trim();
  const benchmarkVerified = !looksMissing(benchmarkName);
  const tam = num(filter1.categoryTamCr ?? filter1.reconciliation?.p50Cr);
  const reconStatus = String(filter1.reconciliation?.status || "").toUpperCase();
  const categorySizeFound =
    tam != null
      ? true
      : reconStatus === "INSUFFICIENT" || reconStatus === "DIAGNOSE"
        ? false
        : Boolean(filter1.verdict === "PASS" && !looksMissing(filter1.verdictReason));

  let categorySizeEvidence = "";
  if (tam != null) {
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

  const direction = ["rising", "stable", "declining"].includes(filter4.formatTrendDirection)
    ? filter4.formatTrendDirection
    : null;
  const threatText = [filter4.threatRegister, filter4.evidenceSummary]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ");
  const threatRegisterFound = !looksMissing(threatText);

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
      benchmarkVerified,
      benchmarkEvidence: stripCavinKareMentions(
        benchmarkVerified
          ? snippet([benchmarkName, sourceLine(f1Sources)].filter(Boolean).join(" — "))
          : snippet(filter1.verdictReason) || "no competitive evidence found"
      ),
      categorySizeFound,
      categorySizeEvidence,
    },
    f3: {
      marginElasticityFound: Boolean(elasticityOk),
      priceEvidence: stripCavinKareMentions(priceEvidence),
    },
    f4: {
      formatTrajectoryFound: Boolean(direction),
      threatRegisterFound,
      threatEvidence: stripCavinKareMentions(
        threatRegisterFound
          ? snippet(threatText)
          : snippet(filter4.verdictReason) || "no threat register in the research result"
      ),
    },
    f5: {
      sizingFactorsFound,
      sizingEvidence,
    },
    sources: mergeSources(f1Sources, filter4.sources, marginElasticityResearch?.sources, sizingResearch?.sources),
  };
}
