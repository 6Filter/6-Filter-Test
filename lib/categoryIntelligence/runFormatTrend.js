import { trimInput } from "../scoring.js";
import { mergeSources } from "../filters/parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { loadSkillText } from "../skills/loadSkill.js";
import { saveFormatTrend } from "./store.js";

const FILTER4_JSON_SCHEMA =
  "Return ONLY minified JSON:\n" +
  '{"formatTrendDirection":"rising|stable|declining","digitalProxySignal":"...",' +
  '"analogTransferSignal":"...","earlyWarningSignal":"none|weak|moderate|strong",' +
  '"trademarkFilingsFound":[{"applicant":"...","filedDate":"...","note":"..."}],' +
  '"horizonYears":"5-10","sources":[{"title":"...","url":"..."}],' +
  '"whatCouldNotBeEstablished":"...",' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"..."}';

function filter4ResearchPrompt() {
  return (
    loadSkillText("SKILL.md", "references/sources.md", "references/competition.md") +
    "\n\n---\n\n" +
    "You are Filter 4 of 6 Filter Test — \"Survives Technology & Habit Shift.\" Use the web_search\n" +
    "tool, grounded in the sources above.\n" +
    "Write a structured research brief in prose and bullets (not JSON) covering:\n" +
    "1. Digital proxy signal: search interest, e-commerce review-velocity, quick-commerce assortment vs successor formats.\n" +
    "2. Analog transfer: has this shift already happened in a comparable market or leading Indian state?\n" +
    "3. Early-warning: trademark filings and job-posting patterns (filings lead launches 6–18 months).\n" +
    "4. formatTrendDirection (rising / stable / declining) and why.\n" +
    "5. What you could not establish rather than guessing."
  );
}

function filter4JsonPrompt() {
  return (
    "You are the structuring step for Filter 4. Do not search. Do not invent filings or URLs.\n" +
    "Use only the research brief. " +
    FILTER4_JSON_SCHEMA
  );
}

export async function runFormatTrend({ ideaText, persist = true, image = null }) {
  const userText =
    `PRODUCT IDEA:\n${trimInput(String(ideaText || ""), 1600)}\n\n` +
    "Infer the product format from the idea (bar, liquid, sachet, pouch, tub, aerosol, " +
    "physical-retail-only, etc.). Assess the 5–10 year technology and habit-shift risk.";

  const { parsed, sources, error } = await researchThenJson({
    label: "filter4",
    researchSystem: filter4ResearchPrompt(),
    researchUser: userText,
    jsonSystem: filter4JsonPrompt(),
    jsonUserSuffix: FILTER4_JSON_SCHEMA,
    image,
    researchMaxTokens: 3072,
    jsonMaxTokens: 4096,
    maxUses: 4,
  });

  if (!parsed) {
    return { parsed: null, sources: sources || [], error: error || "parse" };
  }

  parsed.sources = mergeSources(parsed.sources, sources);
  parsed.whatCouldNotBeEstablished = String(parsed.whatCouldNotBeEstablished || "").trim();
  parsed.digitalProxySignal = String(parsed.digitalProxySignal || "").trim();
  parsed.analogTransferSignal = String(parsed.analogTransferSignal || "").trim();
  parsed.trademarkFilingsFound = Array.isArray(parsed.trademarkFilingsFound)
    ? parsed.trademarkFilingsFound
    : [];
  parsed.evidenceSummary = [parsed.digitalProxySignal, parsed.analogTransferSignal]
    .filter(Boolean)
    .join(" ");

  if (persist) {
    const saved = await saveFormatTrend({
      formatTrendDirection: parsed.formatTrendDirection,
      digitalProxySignal: parsed.digitalProxySignal,
      analogTransferSignal: parsed.analogTransferSignal,
      earlyWarningSignal: parsed.earlyWarningSignal,
      trademarkFilingsFound: parsed.trademarkFilingsFound,
      sources: parsed.sources,
    });
    parsed.formatTrendId = saved.id;
  }

  return { parsed, sources: parsed.sources };
}
