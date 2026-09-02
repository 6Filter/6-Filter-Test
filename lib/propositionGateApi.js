import { callLlm } from "./callLlm.js";
import {
  computeAllAdvisoryChecks,
  computeGoNoGo,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
} from "./propositionScoring.js";
import { generateFilterNarratives } from "./filterNarratives.js";
import { applyVerdictLeads, reconcileNarratives } from "./filterNarrativeText.js";
import { rewriteUnmatchedDivisionCopy, stripCavinKareMentions } from "./sanitizeAiText.js";
import { formCategoryLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { isFilterUnlocked } from "./filterUnlock.js";
import { normalizeProvider, runWithLlm } from "./llmContext.js";
import { getPropositionById, getResearchCache, saveResearchCache, updateProposition } from "./db.js";
import { fingerprintNarrativeInputs, researchHashFor } from "./researchCache.js";
import { competitivePositionNote } from "./filters/runMarginElasticityResearch.js";
import { formatObsolescenceVerdict } from "./filters/filter4TechShift.js";

function narrativeExtrasFor(scored = {}, researchFindings = {}) {
  const range =
    scored.f3?.marginElasticity && typeof scored.f3.marginElasticity === "object"
      ? scored.f3.marginElasticity
      : {};
  const position = competitivePositionNote({
    cogsAtScale: scored.f2?.cogsAtScale,
    netMarginAtScale: scored.f2?.netMarginAtScale,
    categoryAvgPriceInr: range.categoryAvgPriceInr,
  });
  const competitiveNote =
    position?.competitiveNote || range.competitiveNote || researchFindings.f3?.competitiveNote || "";
  const formVerdict = formatObsolescenceVerdict({
    formatTrajectory: scored.f4?.formatTrajectory || "",
    earlyRiskSignal: researchFindings.f4?.earlyRiskSignal || "none",
  });
  const obsolescenceVerdict = formVerdict || researchFindings.f4?.obsolescenceVerdict || "";
  return {
    competitiveNote: stripCavinKareMentions(String(competitiveNote || "").trim()),
    obsolescenceVerdict: stripCavinKareMentions(String(obsolescenceVerdict || "").trim()),
  };
}

export async function handlePropositionGoNogo(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }

  try {
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const draft =
      body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const provider = normalizeProvider(body?.provider || "claude");
    const saved = id ? await getPropositionById(id) : null;
    const scored = {
      ...(saved || {}),
      ...(draft || {}),
      researchFindings: saved?.researchFindings || draft?.researchFindings || {},
      researchRunAt: saved?.researchRunAt || draft?.researchRunAt || null,
    };

    const advisoryChecks = await computeAllAdvisoryChecks(scored);
    const classification = computeGoNoGo(advisoryChecks);
    const category = formCategoryLabel(scored);
    const ideaScale = ideaScaleFromDoc(scored);
    const checksBlock = summarizeChecksForPrompt(advisoryChecks);
    const researchFindings =
      scored.researchFindings && typeof scored.researchFindings === "object"
        ? scored.researchFindings
        : {};
    const extras = narrativeExtrasFor(scored, researchFindings);
    const inputHash = researchHashFor(scored);
    const checksHash = fingerprintNarrativeInputs({ advisoryChecks, researchFindings, extras });

    let filterNarratives = null;
    const cached = inputHash ? await getResearchCache(inputHash) : null;
    if (cached?.filterNarratives && cached.narrativeChecksHash === checksHash) {
      console.log(`[primus/narratives] cache hit hash=${inputHash}`);
      filterNarratives = applyVerdictLeads(
        reconcileNarratives(cached.filterNarratives, advisoryChecks),
        extras,
        advisoryChecks
      );
    } else {
      console.log(`[primus/narratives] cache miss hash=${inputHash || "none"}`);
      filterNarratives = await runWithLlm(provider, () =>
        generateFilterNarratives({ advisoryChecks, researchFindings, extras })
      );
      if (inputHash) {
        await saveResearchCache(inputHash, {
          filterNarratives,
          narrativeChecksHash: checksHash,
          division: scored.division || "",
          providerUsed: provider,
        });
      }
    }

    const system =
      "You write plain-language NPD gate reads. The classification is already decided and must not be changed. " +
      "Do not soften a NO-GO or a WATCH. Do not invent reassurance that the checks do not support. Sentence case, no emoji.";
    const categoryLine = category ? `Category: ${category}` : "Category is not filled on the input form yet";
    const userText =
      `Given these four filter results, write a 2-3 sentence plain-language read of why this idea is currently ${classification}. ` +
      `If every "not Cleared" filter is "Evidence missing" rather than "Below floor," say plainly that this is incomplete, not failed — name what's missing. ` +
      `If any filter is genuinely "Below floor," lead with that specific failure, since it's the harder blocker. ` +
      `Do not soften a real floor failure by burying it under an incompleteness note, and don't present unfinished work as if it were a rejected one. ` +
      `Do not cite item counts as a fraction like 9/12. ` +
      `Never say the idea does not match a division, and never say a division could not be determined. ` +
      `If you need to name where this idea sits, use exactly: ${categoryLine}. ` +
      `The word "CavinKare" must never appear. Sentence case, no emoji.\n\n` +
      `CLASSIFICATION: ${classification}\nCATEGORY: ${categoryLine}\n\nFILTER CHECKS:\n${checksBlock}`;

    let rationale = "";
    try {
      const { text } = await runWithLlm(provider, () =>
        callLlm({
          system,
          userText,
          useWebSearch: false,
          maxTokens: 400,
          temperature: 0,
        })
      );
      rationale = stripCavinKareMentions(
        rewriteUnmatchedDivisionCopy(String(text || "").trim(), category)
      );
    } catch (e) {
      rationale = stripCavinKareMentions(
        rewriteUnmatchedDivisionCopy(
          `${classification}: could not draft the narrative (${redactSecrets(e.message)}). The classification above still stands from the filter checks.`,
          category
        )
      );
    }

    const goNoGo = {
      classification,
      rationale,
      score: scoreAdvisoryChecks(advisoryChecks),
      filterNarratives,
      ideaScale,
      category,
      at: new Date().toISOString(),
    };

    if (id) {
      const current = saved || (await getPropositionById(id));
      if (current) {
        await updateProposition(id, { ...draft, id, goNoGo });
      }
    }

    sendJson(res, 200, { classification, rationale, advisoryChecks, goNoGo });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handlePropositionManagerDraft(
  req,
  res,
  id,
  { readBody, sendJson, redactSecrets }
) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }

  try {
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const draft =
      body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const provider = normalizeProvider(body?.provider || "claude");

    if (!isFilterUnlocked("send-manager", draft)) {
      sendJson(res, 400, {
        error: "Fill Filters 5 and 6 (and upload market-research proof) before drafting for your manager.",
      });
      return;
    }

    const advisoryChecks = await computeAllAdvisoryChecks(draft || {});
    const go = draft.goNoGo || {};
    const proofName = draft.marketResearchProof?.name || "market-research proof";
    const statusLines = ["f1", "f2", "f3", "f4", "f5", "f6"]
      .map((k) => `${k.toUpperCase()}: ${advisoryChecks[k]?.checkLabel || "Evidence missing"}`)
      .join("\n");

    const system =
      "You draft concise, confident internal messages for a brand manager submitting an NPD proposition to their manager. " +
      "Sentence case, no fluff, no emoji. Under 140 words. End with a clear ask to review.";
    const userText =
      `Draft a short message to my manager submitting this 6 Filter Test proposition for review.\n\n` +
      `PROPOSITION: ${draft.name || "(unnamed)"}\n` +
      `DIVISION: ${draft.division || "not yet matched"}\n` +
      `GATE READ: ${go.classification || "n/a"}\n` +
      `GATE RATIONALE: ${go.rationale || "n/a"}\n` +
      `FILTER CHECK STATUS:\n${statusLines}\n` +
      `PROOF ATTACHED: ${proofName} — mention in one line that the market-research proof is attached.\n` +
      `Do not invent scores or change the gate classification.`;

    const { text } = await runWithLlm(provider, () =>
      callLlm({
        system,
        userText,
        useWebSearch: false,
        maxTokens: 500,
      })
    );

    const subject = `6 Filter Test — ${draft.name || "proposition"} (${go.classification || "review"})`;
    sendJson(res, 200, {
      subject,
      message: stripCavinKareMentions(String(text || "").trim()),
      advisoryChecks,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
