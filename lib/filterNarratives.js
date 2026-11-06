/**
 * Server-only. Turns already-computed Filter 1–4 checks into cached prose.
 * Does not write scoring, unlocks, or GO/NO-GO classification.
 */
import { callLlm } from "./callLlm.js";
import { parseStrictJson } from "./llmJson.js";
import { stripCavinKareMentions } from "./sanitizeAiText.js";
import { applyVerdictLeads, reconcileNarratives } from "./filterNarrativeText.js";
import { analysisCheckItems, overallLabel } from "./filterChecks.js";
import { deterministicFilterParagraph, validateNarrativeParagraph } from "./narrativeCheck.js";
import { narrativeGuardMode } from "./narrativeGuard.js";

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
    tier: "light",
    label: "narrative",
  });
  return parseStrictJson(text, { label: "filter-narratives" });
}

function compactCheck(check) {
  if (!check || typeof check !== "object") return { checkLabel: "Not yet run", items: [] };
  if (check.checkLabel === "Not yet run") return { checkLabel: "Not yet run", items: [] };
  const items = analysisCheckItems(check.items).map((it) => ({ status: it.status, text: it.text }));
  const stated = String(check.checkLabel || "");
  const belowFloor = stated === "Below floor";
  const label =
    stated === "Exempt" || stated === "Marked down" || stated === "Not yet run" || stated === "Evidence missing"
      ? stated
      : overallLabel(check.items, belowFloor);
  return { checkLabel: label, items, markedDown: check.markedDown === true };
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
  const benchmarkEvidence = String(
    extras.benchmarkEvidence || researchFindings?.f1?.benchmarkEvidence || ""
  ).trim();
  const categorySizeEvidence = String(
    extras.categorySizeEvidence || researchFindings?.f1?.categorySizeEvidence || ""
  ).trim();

  const f1Instruction = benchmarkEvidence
    ? `F1 must cite this already-computed benchmark finding in your own words (do not invent a different brand, do not write "name the purchase-decision attribute", do not reuse a stock sentence): ${benchmarkEvidence}.` +
      (categorySizeEvidence ? ` Category-size finding: ${categorySizeEvidence}.` : "")
    : `F1: if a benchmark is already named in the status items, say what still needs verifying — never write "name the purchase-decision attribute" when attributes are already declared.`;
  const f3Instruction = competitiveNote
    ? `F3 must state the competitive price position plainly using this already-computed note (do not invent a different ₹ figure): ${competitiveNote}.`
    : `F3 competitive price versus category average is not available yet. Cover only the Filter 3 status evidence (safe MRP range / elasticity). Never invent a ₹ competitive figure, a premium/discount percentage, or a placeholder such as "not yet computed".`;
  const f4Instruction = obsolescenceVerdict
    ? `F4 must lead with this already-computed structural obsolescence verdict in plain language, then only the dimensions that drove it — not a raw dump of seven technical labels: ${obsolescenceVerdict}.`
    : `No structural obsolescence verdict has been computed yet. Cover only the Filter 4 status evidence (technology and habit shift risk). Never invent an obsolescence guarantee or a placeholder such as "not yet computed".`;

  const userText =
    `You are writing a plain-language analysis for someone reviewing an idea screening result. ` +
    `You are given the ALREADY-DETERMINED status of each filter — do not question, re-derive, or contradict these statuses, only explain them. ` +
    `For each of F1-F4, write one short paragraph covering: what was actually analyzed (name the real evidence — a verified benchmark, a computed price ceiling, researched category size, whichever apply), where the idea currently lacks something (be specific, not "evidence missing" — say what's actually missing and why it matters), and what could be done to improve it. ` +
    `If a filter has nothing outstanding, say so plainly and don't invent a gap to fill space. ` +
    `Never mention Finance confirmation, CMI or Finance signatures, unsigned checkboxes, tick marks, or fields left blank — those are form-admin gaps, not analysis. Only write about analytical evidence (floors, verified benchmarks, computed ranges, researched risks).\n\n` +
    `${f1Instruction}\n${f3Instruction}\n${f4Instruction}\n\n` +
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
  const reconciled = reconcileNarratives(cleaned, { ...advisoryChecks, f1, f2, f3, f4 });
  const competitors = Array.isArray(researchFindings?.f1?.noCompetitorCheck?.majorCompetitorsFound)
    ? researchFindings.f1.noCompetitorCheck.majorCompetitorsFound
    : [];
  const checked = { ...(reconciled || {}) };
  const mode = narrativeGuardMode();
  // Part 138 H — dates, regulations and scaled figures must appear in the inputs, findings or returned sources.
  const groundText = [
    JSON.stringify(researchFindings || {}),
    ...Object.values(extras || {}).map((v) => (typeof v === "string" ? v : JSON.stringify(v ?? ""))),
  ].join("\n");
  let fallbacks = 0;
  let shadow = 0;
  for (const key of FILTER_KEYS) {
    const check = advisoryChecks[key] || {};
    if (mode === "off") continue;
    const verdict = validateNarrativeParagraph(checked[key], {
      checks: advisoryChecks,
      check,
      competitors,
      groundText,
    });
    if (verdict.ok) continue;
    const reason = verdict.reasons.join(",");
    if (mode === "shadow") {
      shadow += 1;
      console.log(`[primus/narrative-guard-shadow] filter=${key} reason=${reason}`);
      continue;
    }
    fallbacks += 1;
    console.log(`[primus/narrative-fallback] filter=${key} reason=${reason}`);
    checked[key] = deterministicFilterParagraph(check);
  }
  const saved = applyVerdictLeads(
    checked,
    { competitiveNote, obsolescenceVerdict },
    advisoryChecks
  );
  const generated = FILTER_KEYS.length;
  const flagged = fallbacks + shadow;
  console.log(
    `[primus/narrative-ledger] generated=${generated} fallbacks=${fallbacks} shadow=${shadow} mode=${mode} rate=${generated ? flagged / generated : 0}`
  );
  return saved;
}
