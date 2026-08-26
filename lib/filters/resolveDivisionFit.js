import { brandRosterForPrompt } from "../ckBrands.js";
import { DIVISION_OPTIONS } from "../npdMaster.js";
import { mergeSources } from "./parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { trimInput } from "../scoring.js";

const RESEARCH_SYSTEM =
  `You are researching what commercial category a proposed product belongs to, so it can be checked against CavinKare's actual brand portfolio below.\n\n` +
  `${brandRosterForPrompt()}\n\n` +
  `Divisions used for net-margin screening: ${DIVISION_OPTIONS.join(", ")}.\n\n` +
  `Use the web_search tool if the product's category isn't obvious from the text alone.\n` +
  `Identify the general commercial category (e.g. "ready-to-cook marinated meat", "colour cosmetics / lipstick"), and check it against the brand list above.\n` +
  `Write a short research brief in prose (not JSON). Do not pick the nearest-sounding division as a guess.`;

const STRUCTURE_SYSTEM = `Given the research above, decide:
1. generalCategory — the product's real commercial category, in a few words.
2. matchedDivision — the exact division name from the list above, ONLY if a CavinKare brand or category genuinely covers this. Do not pick the nearest-sounding division as a guess — if nothing on the list actually carries this kind of product, matchedDivision must be null.
3. isNewCategory — true if matchedDivision is null.
4. rationale — one or two sentences a person could act on.

Return ONLY minified JSON:
{"generalCategory":"...","matchedDivision":"<division or null>","isNewCategory":true|false,"rationale":"...","sources":[{"title":"...","url":"..."}]}`;

const JSON_SUFFIX =
  'Return ONLY minified JSON: {"generalCategory":"...","matchedDivision":"<division or null>","isNewCategory":true|false,"rationale":"...","sources":[{"title":"...","url":"..."}]}';

const ALLOWED_DIVISIONS = new Set(DIVISION_OPTIONS);

function emptyFit(rationale, sources = []) {
  return {
    generalCategory: null,
    matchedDivision: null,
    isNewCategory: false,
    rationale: rationale || "Could not determine whether this idea belongs to a CavinKare division.",
    sources,
  };
}

function normalizeFit(parsed, searchSources) {
  if (!parsed || typeof parsed !== "object") {
    return emptyFit("Could not determine whether this idea belongs to a CavinKare division.", searchSources);
  }
  const rawDivision = parsed.matchedDivision;
  const matchedDivision =
    typeof rawDivision === "string" && ALLOWED_DIVISIONS.has(rawDivision.trim())
      ? rawDivision.trim()
      : null;
  const generalCategory = String(parsed.generalCategory || "").trim() || null;
  const isNewCategory = matchedDivision == null;
  return {
    generalCategory,
    matchedDivision,
    isNewCategory,
    rationale: String(parsed.rationale || "").trim(),
    sources: mergeSources(parsed.sources, searchSources),
  };
}

/**
 * AI-assisted division fit, only used when detectDivision() returns null.
 * Two-call pattern: web-search research, then a tool-free JSON structure call.
 */
export async function resolveDivisionFit(ideaText) {
  const idea = trimInput(String(ideaText || ""), 1600);
  const { parsed, sources, error } = await researchThenJson({
    label: "division-fit",
    researchSystem: RESEARCH_SYSTEM,
    researchUser: `PRODUCT IDEA:\n${idea}`,
    jsonSystem: STRUCTURE_SYSTEM,
    jsonUserSuffix: JSON_SUFFIX,
    researchMaxTokens: 2048,
    jsonMaxTokens: 1024,
    maxUses: 3,
  });

  if (!parsed) {
    console.error(`[primus/division] resolveDivisionFit failed error=${error || "empty"}`);
    return emptyFit(
      error === "truncated"
        ? "Division research was cut off before it finished."
        : "Could not determine whether this idea belongs to a CavinKare division.",
      sources || []
    );
  }

  const fit = normalizeFit(parsed, sources);
  console.log(
    `[primus/division] resolveDivisionFit generalCategory=${fit.generalCategory || "null"} ` +
      `matchedDivision=${fit.matchedDivision || "null"} isNewCategory=${fit.isNewCategory}`
  );
  return fit;
}
