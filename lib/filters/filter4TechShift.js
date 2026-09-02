import { mergeSources } from "./parseFilterJson.js";
import { runFormatTrend } from "../categoryIntelligence/runFormatTrend.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";

export function markdownMultiplier({ formatTrendDirection, earlyRiskSignal }) {
  if (formatTrendDirection === "declining") return { multiplier: 0, pass: false };
  if (formatTrendDirection === "rising") return { multiplier: 1.0, pass: true };
  const map = { none: 0.9, weak: 0.75, moderate: 0.6 };
  return { multiplier: map[earlyRiskSignal] ?? 0.75, pass: true };
}

export function earlyRiskFromWarning(earlyWarningSignal, fallback) {
  if (["none", "weak", "moderate"].includes(fallback)) return fallback;
  if (earlyWarningSignal === "none") return "none";
  if (earlyWarningSignal === "weak") return "weak";
  if (earlyWarningSignal === "moderate" || earlyWarningSignal === "strong") return "moderate";
  return "weak";
}

export function resolveFilter4(data) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
  const direction = ["rising", "stable", "declining"].includes(parsed.formatTrendDirection)
    ? parsed.formatTrendDirection
    : null;
  const earlyWarningSignal = ["none", "weak", "moderate", "strong"].includes(parsed.earlyWarningSignal)
    ? parsed.earlyWarningSignal
    : "weak";
  const earlyRiskSignal = earlyRiskFromWarning(earlyWarningSignal, parsed.earlyRiskSignal);

  parsed.earlyWarningSignal = earlyWarningSignal;
  parsed.verdictReason = stripCavinKareMentions(parsed.verdictReason);

  if (!direction) {
    return {
      ...parsed,
      formatTrendDirection: null,
      earlyRiskSignal,
      multiplier: 1,
      pass: false,
      verdict: "NEEDS_INPUT",
      verdictReason:
        parsed.verdictReason ||
        "Missing evidence: could not classify whether this format is rising, stable, or declining.",
    };
  }

  const md = markdownMultiplier({ formatTrendDirection: direction, earlyRiskSignal });
  parsed.formatTrendDirection = direction;
  parsed.earlyRiskSignal = earlyRiskSignal;
  parsed.multiplier = md.multiplier;
  parsed.pass = md.pass;
  parsed.horizonYears = parsed.horizonYears || "5-10";

  if (direction === "declining") {
    parsed.verdict = "FAIL";
    parsed.verdictReason =
      parsed.verdictReason ||
      "Format is on the declining side of a technology/habit shift — hard fail.";
    return parsed;
  }

  parsed.verdict = "PASS";
  parsed.verdictReason =
    parsed.verdictReason ||
    (direction === "rising"
      ? "Format is on the rising side of the shift."
      : `Format is stable; mark-down applied for ${earlyRiskSignal} early-risk signal.`);
  return parsed;
}

function failCopy(error) {
  if (error === "truncated") {
    return "The AI's answer was cut off before it finished — retrying usually fixes this, it isn't about your idea being too long.";
  }
  if (error === "parse") {
    return "The AI hit a tool-use hiccup formatting its answer — retrying should resolve it.";
  }
  return "Filter 4 returned no research. Re-run, or describe the format more clearly in the idea.";
}

export async function runFilter4({ ideaText, image = null }) {
  const { parsed, sources, error } = await runFormatTrend({ ideaText, image });

  const resolved = resolveFilter4(
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
