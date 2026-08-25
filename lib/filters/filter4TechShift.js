import { callLlm } from "../callLlm.js";
import { trimInput } from "../scoring.js";
import { mergeSources, parseFilterJson } from "./parseFilterJson.js";

export const FILTER4_SYSTEM_PROMPT =
  "You are Filter 4 of Primus.AI — \"Survives Technology & Habit Shift.\"\n" +
  "Use the web_search tool, prioritizing government/official statistics sites, industry\n" +
  "association reports, and reputable market-research citations over blogs.\n" +
  "Given the product idea and its format (e.g. bar soap, sachet, single-serve pouch, physical\n" +
  "retail-only), assess whether this format is on the rising or declining side of any\n" +
  "technology/habit shift over the next 5-10 years (examples of shifts: bar-to-liquid,\n" +
  "liquid-to-pods, physical retail to e-commerce/quick-commerce, conventional to\n" +
  "clean-label/natural). Cite what you found.\n" +
  "Classify formatTrendDirection as exactly one of \"rising\", \"stable\", or \"declining\".\n" +
  "\"declining\" means there is visible evidence of an emerging successor format already\n" +
  "taking share — this is a hard fail, we do not enter a format already losing.\n" +
  "\"stable\" means no successor is visibly displacing it yet, but note any early risk signals\n" +
  "you found (these justify a mark-down, not a fail).\n" +
  "\"rising\" means the format itself is gaining share or is the successor format.\n" +
  "Return ONLY minified JSON:\n" +
  '{"formatTrendDirection":"rising|stable|declining","horizonYears":"5-10",' +
  '"evidenceSummary":"...","earlyRiskSignal":"none|weak|moderate",' +
  '"sources":[{"title":"...","url":"..."}],' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"..."}';

export function markdownMultiplier({ formatTrendDirection, earlyRiskSignal }) {
  if (formatTrendDirection === "declining") return { multiplier: 0, pass: false };
  if (formatTrendDirection === "rising") return { multiplier: 1.0, pass: true };
  const map = { none: 0.9, weak: 0.75, moderate: 0.6 };
  return { multiplier: map[earlyRiskSignal] ?? 0.75, pass: true };
}

export function resolveFilter4(data) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
  const direction = ["rising", "stable", "declining"].includes(parsed.formatTrendDirection)
    ? parsed.formatTrendDirection
    : null;
  const earlyRiskSignal = ["none", "weak", "moderate"].includes(parsed.earlyRiskSignal)
    ? parsed.earlyRiskSignal
    : "weak";

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

export async function runFilter4({ ideaText }) {
  const userText =
    `PRODUCT IDEA:\n${trimInput(String(ideaText || ""), 1600)}\n\n` +
    "Infer the product format from the idea (bar, liquid, sachet, pouch, tub, aerosol, " +
    "physical-retail-only, etc.). Assess the 5–10 year technology and habit-shift risk.";

  const response = await callLlm({
    userText,
    system: FILTER4_SYSTEM_PROMPT,
    useWebSearch: true,
    maxTokens: 4096,
  });

  const raw = response?.text ?? "";
  if (!raw.trim()) {
    return resolveFilter4({
      verdict: "NEEDS_INPUT",
      verdictReason: "Filter 4 returned no research. Re-run, or describe the format more clearly in the idea.",
      sources: response?.sources || [],
    });
  }

  let parsed;
  try {
    parsed = parseFilterJson(raw);
  } catch {
    return resolveFilter4({
      verdict: "NEEDS_INPUT",
      verdictReason: "Filter 4 research could not be parsed. Re-run with a clearer format description in the idea.",
      sources: response?.sources || [],
    });
  }

  const resolved = resolveFilter4(parsed);
  resolved.sources = mergeSources(resolved.sources, response?.sources);
  return resolved;
}
