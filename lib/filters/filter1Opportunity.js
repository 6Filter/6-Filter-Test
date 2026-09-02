import { mergeSources } from "./parseFilterJson.js";
import { runCategorySizing } from "../categoryIntelligence/runSizing.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";

export function resolveFilter1Verdict(data) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
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
  return !s || s === "unknown" || s === "n/a" || s === "none" || s === "unclear" || s === "not found";
}

function failCopy(error) {
  if (error === "truncated") {
    return "The AI's answer was cut off before it finished — retrying usually fixes this, it isn't about your idea being too long.";
  }
  if (error === "parse") {
    return "The AI hit a tool-use hiccup formatting its answer — retrying should resolve it.";
  }
  return "Filter 1 returned no research. Supply a benchmark and attribute, then re-run.";
}

export async function runFilter1({
  ideaText,
  attribute = "",
  benchmarkName = "",
  isPureCommodity = false,
  brandFit = null,
  pricePerUnit = null,
  image = null,
}) {
  const { parsed, sources, error } = await runCategorySizing({
    ideaText,
    attribute,
    benchmarkName,
    isPureCommodity,
    brandFit,
    pricePerUnit,
    image,
  });

  const resolved = resolveFilter1Verdict(
    parsed || {
      verdict: "NEEDS_INPUT",
      verdictReason: failCopy(error),
      sources: sources || [],
    }
  );
  resolved.sources = mergeSources(resolved.sources, sources);
  resolved.verdictReason = stripCavinKareMentions(resolved.verdictReason);
  return resolved;
}
