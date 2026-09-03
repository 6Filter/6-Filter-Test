import { mergeSources } from "./parseFilterJson.js";
import { runFormatTrend } from "../categoryIntelligence/runFormatTrend.js";
import { stripCavinKareMentions } from "../sanitizeAiText.js";
import { RESEARCH_FAILED_COPY } from "../researchFailureCopy.js";
import {
  aggregateTechShiftRisk,
  formatObsolescenceVerdict,
  normalizeTechShiftRisk,
} from "../techShiftRisk.js";

export { aggregateTechShiftRisk, formatObsolescenceVerdict };

export function markdownMultiplier({ overallRisk } = {}) {
  if (overallRisk === "High") return { multiplier: 0, pass: false };
  if (overallRisk === "Medium") return { multiplier: 0.75, pass: true };
  return { multiplier: 1.0, pass: true };
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

export function resolveFilter4(data) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
  const risk = normalizeTechShiftRisk({
    dimensions: parsed.dimensions || parsed.techShiftRisk?.dimensions,
    sources: parsed.sources || parsed.techShiftRisk?.sources,
    aiSourced: true,
  });

  parsed.verdictReason = stripCavinKareMentions(parsed.verdictReason);

  if (!risk?.dimensions) {
    return {
      ...parsed,
      techShiftRisk: null,
      overallRisk: null,
      multiplier: 1,
      pass: false,
      verdict: "NEEDS_INPUT",
      verdictReason: parsed.verdictReason || "Missing evidence: structural obsolescence dimensions were not assessed.",
      obsolescenceVerdict: null,
    };
  }

  const overallRisk = aggregateTechShiftRisk(risk.dimensions);
  const md = markdownMultiplier({ overallRisk });
  parsed.techShiftRisk = {
    ...risk,
    overallRisk,
    sources: mergeSources(risk.sources, parsed.sources),
  };
  parsed.overallRisk = overallRisk;
  parsed.dimensions = risk.dimensions;
  parsed.multiplier = md.multiplier;
  parsed.pass = md.pass;
  parsed.obsolescenceVerdict = formatObsolescenceVerdict({
    overallRisk,
    dimensions: risk.dimensions,
  });

  if (overallRisk === "High") {
    parsed.verdict = "FAIL";
    parsed.verdictReason =
      parsed.verdictReason ||
      "Multiple structural vulnerabilities — format is exposed to a shift that has not fully arrived yet.";
    return parsed;
  }

  parsed.verdict = "PASS";
  parsed.verdictReason =
    parsed.verdictReason ||
    (overallRisk === "Medium"
      ? "One real structural vulnerability, or several soft signals — watch, not a hard fail."
      : "No material structural exposure found across the seven dimensions.");
  return parsed;
}

export async function runFilter4({ ideaText, image = null }) {
  const { parsed, sources, error } = await runFormatTrend({ ideaText, image });
  const researchFailed = Boolean(error) && !parsed?.dimensions;

  const resolved = resolveFilter4(
    parsed || {
      verdict: "NEEDS_INPUT",
      verdictReason: researchFailed ? RESEARCH_FAILED_COPY : failCopy(error),
      sources: sources || [],
    }
  );
  if (researchFailed) {
    resolved.researchFailed = true;
    resolved.verdictReason = RESEARCH_FAILED_COPY;
  }
  resolved.sources = mergeSources(resolved.sources, sources);
  if (resolved.techShiftRisk) {
    resolved.techShiftRisk.sources = mergeSources(resolved.techShiftRisk.sources, sources);
  }
  resolved.verdictReason = stripCavinKareMentions(resolved.verdictReason);
  resolved.obsolescenceVerdict = stripCavinKareMentions(resolved.obsolescenceVerdict);
  return resolved;
}
