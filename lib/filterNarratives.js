/**
 * Server-only. Turns already-computed Filter 1–4 checks into cached prose.
 * Does not write scoring, unlocks, or GO/NO-GO classification.
 */
import { callLlm } from "./callLlm.js";
import { parseStrictJson } from "./llmJson.js";
import { stripCavinKareMentions } from "./sanitizeAiText.js";
import { applyVerdictLeads, reconcileNarratives } from "./filterNarrativeText.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4"];

async function callLlmForNarrative(userText) {
  const { text } = await callLlm({
    system:
      "You write plain-language NPD filter analysis. Statuses are already determined — do not question, re-derive, or contradict them. " +
      "Return ONLY minified JSON with keys f1, f2, f3, f4. Sentence case, no emoji. The word CavinKare must never appear.",
    userText,
    useWebSearch: false,
    maxTokens: 1200,
    temperature: 0,
  });
  return parseStrictJson(text, { label: "filter-narratives" });
}

function compactCheck(check) {
  if (!check || typeof check !== "object") return { checkLabel: "Evidence missing", items: [] };
  return {
    checkLabel: check.checkLabel || "Evidence missing",
    items: Array.isArray(check.items)
      ? check.items.map((it) => ({ status: it.status, text: it.text }))
      : [],
  };
}

export async function generateFilterNarratives({
  advisoryChecks = {},
  researchFindings = {},
  extras = {},
  callNarrative = callLlmForNarrative,
} = {}) {
  const f1 = compactCheck(advisoryChecks.f1);
  const f2 = compactCheck(advisoryChecks.f2);
  const f3 = compactCheck(advisoryChecks.f3);
  const f4 = compactCheck(advisoryChecks.f4);
  const competitiveNote = String(extras.competitiveNote || researchFindings?.f3?.competitiveNote || "").trim();
  const obsolescenceVerdict = String(
    extras.obsolescenceVerdict || researchFindings?.f4?.obsolescenceVerdict || ""
  ).trim();

  const f3Instruction = competitiveNote
    ? `F3 must state the competitive price position plainly using this already-computed note (do not invent a different ₹ figure): ${competitiveNote}.`
    : `F3 competitive price versus category average is not available yet. Cover only the Filter 3 status evidence (safe MRP range / elasticity). Never invent a ₹ competitive figure, a premium/discount percentage, or a placeholder such as "not yet computed".`;
  const f4Instruction = obsolescenceVerdict
    ? `F4 must lead with this already-computed five-year relevance verdict, then the supporting evidence: ${obsolescenceVerdict}.`
    : `No five-year relevance verdict has been computed yet. Cover only the Filter 4 status evidence (format trajectory and threat register). Never invent a five-year guarantee or a placeholder such as "not yet computed".`;

  const userText =
    `You are writing a plain-language analysis for someone reviewing an idea screening result. ` +
    `You are given the ALREADY-DETERMINED status of each filter — do not question, re-derive, or contradict these statuses, only explain them. ` +
    `For each of F1-F4, write one short paragraph covering: what was actually analyzed (name the real evidence — a verified benchmark, a computed price ceiling, researched category size, whichever apply), where the idea currently lacks something (be specific, not "evidence missing" — say what's actually missing and why it matters), and what could be done to improve it. ` +
    `If a filter has nothing outstanding, say so plainly and don't invent a gap to fill space. ` +
    `Clearly distinguish a genuine analytical failure (a real number past a real floor) from a procedural gap (a signature or checkbox still pending) — lead with the analytical ones, they're the harder blocker.\n\n` +
    `${f3Instruction}\n${f4Instruction}\n\n` +
    `F1 STATUS (do not contradict): ${f1.checkLabel}\nF1: ${JSON.stringify(f1)}\n\n` +
    `F2 STATUS (do not contradict): ${f2.checkLabel}\nF2: ${JSON.stringify(f2)}\n\n` +
    `F3 STATUS (do not contradict): ${f3.checkLabel}\nF3: ${JSON.stringify(f3)}\n\n` +
    `F4 STATUS (do not contradict): ${f4.checkLabel}\nF4: ${JSON.stringify(f4)}\n\n` +
    `Research findings: ${JSON.stringify(researchFindings || {})}\n\n` +
    `Return ONLY minified JSON: {"f1":"...","f2":"...","f3":"...","f4":"..."}`;

  let parsed = null;
  try {
    parsed = await callNarrative(userText);
  } catch (e) {
    console.warn(`[primus/narratives] llm failed: ${e.message || e}`);
    parsed = {};
  }

  const cleaned = {};
  for (const key of FILTER_KEYS) {
    cleaned[key] = stripCavinKareMentions(String(parsed?.[key] || "").trim());
  }
  const reconciled = reconcileNarratives(cleaned, { f1, f2, f3, f4, ...advisoryChecks });
  return applyVerdictLeads(
    reconciled,
    { competitiveNote, obsolescenceVerdict },
    advisoryChecks
  );
}
