import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { sixFilterSkillForProvider, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { saveFormatTrend } from "./store.js";
import { aggregateTechShiftRisk, normalizeDimensions } from "../techShiftRisk.js";

const FILTER4_JSON_SCHEMA =
  "Return ONLY minified JSON:\n" +
  '{"dimensions":{"functionalCoreStability":{"risk":"Low|Medium|High","reason":"..."},' +
  '"consumptionContextStability":{"risk":"Low|Medium|High","reason":"..."},' +
  '"manufacturingDisruptionRisk":{"risk":"Low|Medium|High","reason":"..."},' +
  '"userHabitShiftPotential":{"risk":"Low|Medium|High","reason":"..."},' +
  '"adjacentSubstitutionThreat":{"risk":"Low|Medium|High","reason":"..."},' +
  '"purchaseFrequencyShift":{"risk":"Low|Medium|High","reason":"..."},' +
  '"regulatoryDisruptionRisk":{"risk":"Low|Medium|High","reason":"..."}},' +
  '"sources":[{"title":"...","url":"..."}]}';

const RESEARCH_BRIEF =
  "Analyze the structural risk that this product's underlying format could become\n" +
  "obsolete due to a technology, habit, or design shift that hasn't happened yet —\n" +
  "not whether current trend data shows growth or decline today. The distinction\n" +
  "matters: someone assessing detergent bars ten years ago would have seen a stable\n" +
  "trend line right up until powder detergent displaced it — the vulnerability was\n" +
  "structural, not visible in the trend.\n\n" +
  "Assess each dimension on a Low/Medium/High risk scale with a one-sentence,\n" +
  "evidence-grounded reason. Cite real signals (emerging technology news, patent\n" +
  "filings, regulatory movement, adjacent-category innovation) where they exist.\n" +
  "If a dimension genuinely has no discoverable destabilizing signal, say\n" +
  "\"Low risk — no destabilizing signal found,\" not an invented concern.\n\n" +
  "1. Functional Core Stability — is this product's value tied to its specific\n" +
  "   physical form (higher risk — vulnerable to a form-factor shift) or to its\n" +
  "   underlying function (lower risk — the function persists even if form changes)?\n" +
  "2. Consumption Context Stability — could where, when, or how this gets consumed\n" +
  "   change significantly?\n" +
  "3. Manufacturing Disruption Risk — could a cheaper, more scalable, or more\n" +
  "   sustainable manufacturing alternative emerge for delivering the same function?\n" +
  "4. User Habit Shift Potential — is target consumer behavior or attitude in this\n" +
  "   category likely to evolve?\n" +
  "5. Adjacent Substitution Threat — could an entirely different product category\n" +
  "   solve the same underlying need better?\n" +
  "6. Purchase Frequency Shift — could buying behavior shift from impulse to\n" +
  "   planned or subscription-based?\n" +
  "7. Regulatory Disruption Risk — could future regulation make the current\n" +
  "   formulation, claims, or packaging obsolete?\n\n" +
  "Do not compute or return an overall risk — the app aggregates the seven dimensions.";

function filter4ResearchPrompt() {
  return (
    sixFilterSkillForProvider() +
    "\n\n---\n\n" +
    "You are Filter 4 of 6 Filter Test — \"Survives Technology & Habit Shift.\" Use the web_search\n" +
    "tool, grounded in the 6 Filter Test skill and the sources above.\n" +
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n" +
    RESEARCH_BRIEF +
    "\nNever write unsure, not available, unknown, or n/a. Never invent a concern when no\n" +
    "destabilizing signal exists. Do not return overallRisk — only the seven dimensions and sources."
  );
}

function filter4JsonPrompt() {
  return (
    "Return the seven dimensions only. Do not include overallRisk. " +
    "Each reason must be one evidence-grounded sentence. " +
    "Never output unsure, not available, unknown, or n/a. " +
    FILTER4_JSON_SCHEMA
  );
}

export async function runFormatTrend({ ideaText, persist = true, image = null }) {
  const userText =
    `PRODUCT IDEA:\n${trimInput(String(ideaText || ""), 1600)}\n\n` +
    "Infer the product's underlying format from the idea. Assess structural obsolescence\n" +
    "risk across the seven dimensions — not whether today's trend line is up or down.";

  const { parsed, sources, error } = await researchThenJson({
    label: "filter4",
    researchSystem: filter4ResearchPrompt(),
    researchUser: userText,
    jsonSystem: filter4JsonPrompt(),
    jsonUserSuffix: FILTER4_JSON_SCHEMA,
    image,
    researchMaxTokens: 8192,
    jsonMaxTokens: 4096,
    maxUses: 4,
  });

  if (!parsed) {
    return { parsed: null, sources: sources || [], error: error || "parse" };
  }

  // Never trust a model-supplied overallRisk — drop it before aggregation.
  delete parsed.overallRisk;
  parsed.dimensions = normalizeDimensions(parsed.dimensions);
  parsed.sources = mergeSources(parsed.sources, sources);
  parsed.overallRisk = aggregateTechShiftRisk(parsed.dimensions);

  if (persist) {
    const saved = await saveFormatTrend({
      formatTrendDirection: parsed.overallRisk,
      digitalProxySignal: Object.values(parsed.dimensions)
        .map((d) => `${d.risk}: ${d.reason}`)
        .join(" | "),
      analogTransferSignal: "",
      earlyWarningSignal: parsed.overallRisk === "High" ? "strong" : parsed.overallRisk === "Medium" ? "moderate" : "none",
      trademarkFilingsFound: [],
      sources: parsed.sources,
    });
    parsed.formatTrendId = saved.id;
  }

  return { parsed, sources: parsed.sources };
}
