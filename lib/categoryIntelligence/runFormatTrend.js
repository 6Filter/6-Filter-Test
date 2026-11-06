import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { sixFilterFullSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { saveFormatTrend } from "./store.js";
import { aggregateTechShiftRisk, normalizeDimensions } from "../techShiftRisk.js";
import { f4AssessmentsFromResearch, failedF4Assessments } from "../f4Assessment.js";
import { withCategoryScope, maxUsesForMatch } from "../categoryScopedResearch.js";
import { buildStepEvidence } from "../evidenceProvenance.js";

const FILTER4_JSON_SCHEMA =
  "Return ONLY minified JSON:\n" +
  '{"dimensions":{"functionalCoreStability":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"consumptionContextStability":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"manufacturingDisruptionRisk":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"userHabitShiftPotential":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"adjacentSubstitutionThreat":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"purchaseFrequencyShift":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."},' +
  '"regulatoryDisruptionRisk":{"risk":"Low|Medium|High","reason":"...","source_url?":"...","quote?":"..."}},' +
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
  "Before scoring, apply the category-intelligence skill and search quick-commerce,\n" +
  "e-commerce, social media and internet behaviour for this format (share of new\n" +
  "launches on q-com, urban habit shift, adjacent digital-native substitutes,\n" +
  "subscription or planned-purchase moves). Fold those signals into the seven\n" +
  "dimension reasons — do not replace the dimensions with a trend score.\n\n" +
  "Do not compute or return an overall risk — the app aggregates the seven dimensions.";

function filter4ResearchPrompt() {
  return sixFilterFullSystem(
    "You are Filter 4 of 6 Filter Test — \"Survives Technology & Habit Shift.\" Use the web_search\n" +
    "tool, grounded in the 6 Filter Test skill and the category-intelligence skill above.\n" +
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

export async function runFormatTrend({ ideaText, category = "", persist = true, image = null }) {
  const { text: userText, nielsenMatchedOn, kantarMatchedOn, nielsenAsOf, kantarAsOf } = await withCategoryScope(
    `PRODUCT IDEA:\n${trimInput(String(ideaText || ""), 1600)}\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n\n` +
      "Infer the product's underlying format from the idea. Apply the category-intelligence\n" +
      "skill, then search q-com, e-com, social and internet signals for this format.\n" +
      "Assess structural obsolescence risk across the seven dimensions — not whether\n" +
      "today's trend line is up or down.",
    {
      category,
      baseQuery: "format shift q-commerce e-commerce structural obsolescence",
      label: "filter4",
    }
  );

  const { parsed, sources, error, searchesUsed, webSearchEnabled } = await researchThenJson({
    label: "filter4",
    researchSystem: filter4ResearchPrompt(),
    researchUser: userText,
    jsonSystem: filter4JsonPrompt(),
    jsonUserSuffix: FILTER4_JSON_SCHEMA,
    image,
    researchMaxTokens: 8192,
    jsonMaxTokens: 4096,
    maxUses: maxUsesForMatch(nielsenMatchedOn, kantarMatchedOn, 4),
  });

  if (!parsed) {
    return {
      parsed: null,
      sources: sources || [],
      error: error || "parse",
      // Part 138 F — every dimension gets a failed (never "none") assessment; searchUsed is from the request.
      assessments: failedF4Assessments(
        error === "truncated"
          ? "The AI's answer was cut off"
          : error === "empty"
            ? "The AI did not answer"
            : "The AI's answer could not be read",
        { sources: sources || [], webSearchEnabled, searchesUsed }
      ),
      webSearchEnabled: Boolean(webSearchEnabled),
      evidence: buildStepEvidence({
        nielsenMatchedOn,
        kantarMatchedOn,
        nielsenAsOf,
        kantarAsOf,
        searchesUsed,
        sources,
        asOf: new Date().toISOString(),
      }),
    };
  }

  // Never trust a model-supplied overallRisk — drop it before aggregation.
  delete parsed.overallRisk;
  // Part 138 F — capture per-dimension citations before normalization drops them.
  const cited = {};
  const rawDims = parsed.dimensions && typeof parsed.dimensions === "object" ? parsed.dimensions : {};
  for (const [key, d] of Object.entries(rawDims)) {
    if (d && typeof d === "object") cited[key] = { source_url: d.source_url, quote: d.quote };
  }
  parsed.dimensions = normalizeDimensions(parsed.dimensions);
  parsed.sources = mergeSources(parsed.sources, sources);
  parsed.overallRisk = aggregateTechShiftRisk(parsed.dimensions);
  // Only URLs the web search itself returned count; searchUsed comes from the request, never the model.
  const f4Assessments = f4AssessmentsFromResearch({
    dimensions: parsed.dimensions,
    sources: sources || [],
    webSearchEnabled,
    searchesUsed,
    cited,
  });

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

  return {
    parsed,
    sources: parsed.sources,
    assessments: f4Assessments,
    webSearchEnabled: Boolean(webSearchEnabled),
    evidence: buildStepEvidence({
      nielsenMatchedOn,
      kantarMatchedOn,
      nielsenAsOf,
      kantarAsOf,
      searchesUsed,
      sources: parsed.sources,
      asOf: new Date().toISOString(),
    }),
  };
}
