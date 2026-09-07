import { mergeSources } from "./parseFilterJson.js";
import { runCategorySizing } from "../categoryIntelligence/runSizing.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";
import { BENCHMARK_UNVERIFIED_COPY, RESEARCH_FAILED_COPY, deniesBenchmarkExistence, isAttributePlaceholderCopy } from "../researchFailureCopy.js";

export { BENCHMARK_UNVERIFIED_COPY, RESEARCH_FAILED_COPY, deniesBenchmarkExistence, isAttributePlaceholderCopy };

export function statedBenchmarkVerified(stated, found) {
  const a = String(stated || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const b = String(found || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  const tokens = (s) => s.split(/\s+/).filter((t) => t.length >= 4);
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.some((u) => u.includes(t) || t.includes(u)));
}

export function resolveFilter1Verdict(data, extras = {}) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
  if (extras.attribute?.trim()) {
    if (looksMissing(parsed.attribute)) parsed.attribute = extras.attribute.trim();
  }
  const statedBenchmark = extras.benchmarkName?.trim() || "";
  if (statedBenchmark) {
    if (looksMissing(parsed.benchmarkName)) {
      parsed.benchmarkName = statedBenchmark;
    } else if (!statedBenchmarkVerified(statedBenchmark, parsed.benchmarkName)) {
      parsed.estimatedBenchmarkExists = false;
      parsed.benchmarkFinding =
        stripCavinKareMentions(String(parsed.benchmarkFinding || "").trim()) ||
        `Research did not verify ${statedBenchmark} as a currently-selling competitor in this segment.`;
      parsed.benchmarkName = statedBenchmark;
    } else if (
      parsed.estimatedBenchmarkExists === false &&
      !deniesBenchmarkExistence(parsed.benchmarkFinding) &&
      !deniesBenchmarkExistence(parsed.verdictReason)
    ) {
      // Schema example defaults to false; a matching brand name without a denial is a verification.
      parsed.estimatedBenchmarkExists = true;
    } else if (parsed.estimatedBenchmarkExists !== false) {
      parsed.estimatedBenchmarkExists = true;
    }
  }
  parsed.benchmarkFinding = stripCavinKareMentions(String(parsed.benchmarkFinding || "").trim()) || null;
  if (isAttributePlaceholderCopy(parsed.benchmarkFinding)) parsed.benchmarkFinding = null;
  if (isAttributePlaceholderCopy(parsed.verdictReason) && extras.attribute?.trim() && statedBenchmark) {
    parsed.verdictReason = parsed.benchmarkFinding || "";
  }
  if (extras.researchFailed) {
    parsed.researchFailed = true;
    parsed.verdict = "NEEDS_INPUT";
    parsed.verdictReason = failCopy(extras.researchError);
    return parsed;
  }
  const differentiationExempt = Boolean(parsed.differentiationExempt);
  const growthStage = ["low-penetration", "mature-cluttered", "unclear"].includes(parsed.growthStage)
    ? parsed.growthStage
    : "unclear";
  const parityRisk = ["none", "minor", "major"].includes(parsed.parityRisk)
    ? parsed.parityRisk
    : "minor";
  const hasBenchmark = !looksMissing(parsed.benchmarkName);
  const hasAttribute = !looksMissing(parsed.attribute);
  const reconStatus = String(parsed.reconciliation?.status || "").toUpperCase();

  parsed.growthStage = growthStage;
  parsed.parityRisk = parityRisk;
  parsed.differentiationExempt = differentiationExempt;
  parsed.verdictReason = stripCavinKareMentions(parsed.verdictReason);
  if (parsed.reconciliation?.p50Cr != null && Number.isFinite(Number(parsed.reconciliation.p50Cr))) {
    parsed.categoryTamCr = Number(parsed.reconciliation.p50Cr);
  }

  if (!hasBenchmark || !hasAttribute) {
    parsed.verdict = "NEEDS_INPUT";
    parsed.verdictReason = !hasAttribute
      ? "Missing evidence: name the purchase-decision attribute."
      : "Missing evidence: name a credible benchmark competitor.";
    return parsed;
  }

  if (!differentiationExempt && (reconStatus === "DIAGNOSE" || reconStatus === "INSUFFICIENT")) {
    parsed.verdict = "NEEDS_INPUT";
    parsed.verdictReason =
      reconStatus === "DIAGNOSE"
        ? parsed.reconciliation?.diagnosis ||
          "Engine spread is over 30% — diagnose the broken assumption; do not average."
        : parsed.reconciliation?.reason ||
          "Fewer than 2 grounded engines — cannot triangulate category size.";
    return parsed;
  }

  if (growthStage === "unclear" && parityRisk === "major" && !differentiationExempt) {
    parsed.verdict = "FAIL";
    parsed.verdictReason =
      parsed.verdictReason ||
      "Category growth is unclear and there is a major parity risk — no differentiation exemption.";
    return parsed;
  }

  parsed.verdict = "PASS";
  parsed.verdictReason =
    parsed.verdictReason ||
    (differentiationExempt
      ? "Commodity exemption: assessed on perception/positioning."
      : `Clears opportunity gate vs ${parsed.benchmarkName} on ${parsed.attribute}.`);
  return parsed;
}

function looksMissing(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s || s === "..." || s === "unknown" || s === "n/a" || s === "none" || s === "unclear" || s === "not found") {
    return true;
  }
  if (s === "stated_attribute" || s === "stated_benchmark") return true;
  if (/identify the top purchase-decision|identify the strongest named competitor/.test(s)) return true;
  return false;
}

function failCopy(_error) {
  return RESEARCH_FAILED_COPY;
}

export async function runFilter1({
  ideaText,
  category = "",
  attribute = "",
  attributes = [],
  benchmarkName = "",
  isPureCommodity = false,
  brandFit = null,
  pricePerUnit = null,
  image = null,
}) {
  const { parsed, sources, error } = await runCategorySizing({
    ideaText,
    categoryName: category,
    attribute,
    attributes,
    benchmarkName,
    isPureCommodity,
    brandFit,
    pricePerUnit,
    image,
  });

  const researchFailed = Boolean(error) && !parsed?.reconciliation && !parsed?.enginesRun;
  const resolved = resolveFilter1Verdict(parsed || { sources: sources || [] }, {
    attribute,
    benchmarkName,
    researchFailed,
    researchError: error,
  });
  resolved.sources = mergeSources(resolved.sources, sources);
  resolved.verdictReason = stripCavinKareMentions(resolved.verdictReason);
  console.log(
    `[primus/f1-benchmark] stated=${benchmarkName || ""} found=${resolved.benchmarkName || ""} ` +
      `exists=${resolved.estimatedBenchmarkExists} finding=${resolved.benchmarkFinding || resolved.verdictReason || ""}`
  );
  return resolved;
}
