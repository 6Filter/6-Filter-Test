import { callLlm } from "./callLlm.js";
import {
  computeAllAdvisoryChecks,
  computeGoNoGoWatch,
  summarizeChecksForPrompt,
} from "./propositionScoring.js";
import { isFilterUnlocked } from "./filterUnlock.js";
import { normalizeProvider, runWithLlm } from "./llmContext.js";
import { getPropositionById, updateProposition } from "./db.js";

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

    if (!isFilterUnlocked("proof-gate", draft)) {
      sendJson(res, 400, {
        error: "Complete Filters 1–4 before submitting for an AI read.",
      });
      return;
    }

    const advisoryChecks = await computeAllAdvisoryChecks(draft || {});
    const classification = computeGoNoGoWatch(advisoryChecks);
    const checksBlock = summarizeChecksForPrompt(advisoryChecks);

    const system =
      "You write plain-language NPD gate reads. The classification is already decided and must not be changed. " +
      "Do not soften a NO-GO. Do not invent reassurance that the checks do not support. Sentence case, no emoji.";
    const userText =
      `Given these four filter results, write a 2-3 sentence plain-language read of why this idea is ${classification} right now. ` +
      `Reference the specific filter(s) driving the result. Do not soften a NO-GO or invent reassurance not supported by the checks.\n\n` +
      `CLASSIFICATION: ${classification}\n\nFILTER CHECKS:\n${checksBlock}`;

    let rationale = "";
    try {
      const { text } = await runWithLlm(provider, () =>
        callLlm({
          system,
          userText,
          useWebSearch: false,
          maxTokens: 400,
        })
      );
      rationale = String(text || "").trim();
    } catch (e) {
      rationale = `${classification}: could not draft the narrative (${redactSecrets(e.message)}). The classification above still stands from the filter checks.`;
    }

    const goNoGo = {
      classification,
      rationale,
      at: new Date().toISOString(),
    };

    if (id) {
      const current = await getPropositionById(id);
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
      message: String(text || "").trim(),
      advisoryChecks,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
