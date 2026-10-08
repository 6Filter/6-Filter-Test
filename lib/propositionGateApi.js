import { callLlm } from "./callLlm.js";
import {
  computeAllAdvisoryChecks,
  computeGoNoGo,
  scoreAdvisoryChecks,
} from "./propositionScoring.js";
import { applyVerdictLeads, reconcileNarratives } from "./filterNarrativeText.js";
import { stripCavinKareMentions } from "./sanitizeAiText.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { isFilterUnlocked } from "./filterUnlock.js";
import { normalizeProvider, runWithLlm } from "./llmContext.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";
import { getPropositionById, getResearchCache, saveResearchCache, setResearchDurationMs, updateProposition } from "./db.js";
import { asResearchDurationMs } from "./processTimer.js";
import { fingerprintNarrativeInputs, researchHashFor } from "./researchCache.js";
import { competitivePositionNote } from "./filters/runMarginElasticityResearch.js";
import { formatObsolescenceVerdict } from "./filters/filter4TechShift.js";
import { effectiveOverallRisk } from "./techShiftRisk.js";
import { buildGateRationale } from "./goNoGo.js";
import { checkLabelsFromAdvisory, compactAdvisoryForLog } from "./logStatus.js";

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
  const risk = scored.f4?.techShiftRisk;
  const overallRisk = effectiveOverallRisk(risk || {}) || researchFindings.f4?.overallRisk || "";
  const formVerdict = formatObsolescenceVerdict({
    overallRisk,
    dimensions: risk?.dimensions,
  });
  const obsolescenceVerdict = formVerdict || researchFindings.f4?.obsolescenceVerdict || "";
  return {
    competitiveNote: stripCavinKareMentions(String(competitiveNote || "").trim()),
    obsolescenceVerdict: stripCavinKareMentions(String(obsolescenceVerdict || "").trim()),
    benchmarkEvidence: stripCavinKareMentions(String(researchFindings.f1?.benchmarkEvidence || "").trim()),
    categorySizeEvidence: stripCavinKareMentions(String(researchFindings.f1?.categorySizeEvidence || "").trim()),
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    if (body?.durationOnly) {
      const duration = asResearchDurationMs(body.researchDurationMs);
      if (!id || duration == null) {
        sendJson(res, 400, { error: "researchDurationMs is required." });
        return;
      }
      const savedDuration = await setResearchDurationMs(id, duration);
      if (!savedDuration) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, { researchDurationMs: savedDuration.researchDurationMs });
      return;
    }
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
    const score = scoreAdvisoryChecks(advisoryChecks);
    const category = formCategoryLabel(scored);
    const ideaName = formIdeaLabel(scored);
    const ideaScale = ideaScaleFromDoc(scored);
    const researchFindings =
      scored.researchFindings && typeof scored.researchFindings === "object"
        ? scored.researchFindings
        : {};
    const extras = narrativeExtrasFor(scored, researchFindings);
    const inputHash = researchHashFor(scored);
    const checksHash = fingerprintNarrativeInputs({ advisoryChecks, researchFindings, extras });

    const filterNarratives = applyVerdictLeads(
      reconcileNarratives({}, advisoryChecks),
      extras,
      advisoryChecks
    );
    if (inputHash) {
      const cached = await getResearchCache(inputHash);
      if (!cached?.filterNarratives || cached.narrativeChecksHash !== checksHash) {
        await saveResearchCache(inputHash, {
          filterNarratives,
          narrativeChecksHash: checksHash,
          division: scored.division || "",
          providerUsed: provider,
        });
      }
    }

    const rationale = stripCavinKareMentions(
      buildGateRationale({ classification, score, checks: advisoryChecks, ideaName, category })
    );

    const goNoGo = {
      classification,
      rationale,
      score,
      filterNarratives,
      ideaScale,
      ideaName,
      category,
      checkLabels: checkLabelsFromAdvisory(compactAdvisoryForLog(scored, advisoryChecks)),
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
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
    const classification = computeGoNoGo(advisoryChecks);
    const score = scoreAdvisoryChecks(advisoryChecks);
    const go = {
      ...(draft.goNoGo && typeof draft.goNoGo === "object" ? draft.goNoGo : {}),
      classification,
      score,
    };
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

    const { text } = await runWithLlm(
      provider,
      () =>
        callLlm({
          system,
          userText,
          useWebSearch: false,
          maxTokens: 500,
          tier: "light",
          label: "manager-draft",
        }),
      { department: requireUnlockedDepartment(req.user) }
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
