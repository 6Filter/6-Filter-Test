import { authRequired } from "./auth.js";
import { firstForbiddenField, ownerLabel } from "./fieldOwnership.js";
import {
  createProposition,
  deleteProposition,
  getPropositionById,
  listPropositions,
  markResearchRun,
  setPropositionDivision,
  updateProposition,
} from "./db.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";
import { runPropositionResearch } from "./propositionAiFirstPass.js";
import { resolveDivisionSilently } from "./filters/resolveDivisionSilent.js";
import { normalizeProvider, providerLabel, runWithLlm } from "./llmContext.js";
import { failoverPayload } from "./llmFailover.js";

async function withAdvisory(proposition) {
  return {
    proposition,
    advisoryChecks: await computeAllAdvisoryChecks(proposition),
  };
}

function hasResearchMaterial(payload) {
  return Boolean(String(payload?.ideaDescription || "").trim() || payload?.attachment?.data);
}

export async function handlePropositionsCollection(req, res, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      let limit = 100;
      try {
        const url = typeof req.url === "string" ? new URL(req.url, "http://localhost") : null;
        const n = Number(req.query?.limit ?? url?.searchParams.get("limit"));
        if (Number.isFinite(n) && n > 0) limit = Math.min(200, Math.floor(n));
      } catch {
        /* keep default */
      }
      const propositions = await listPropositions(limit);
      sendJson(res, 200, { propositions });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const proposition = await createProposition();
      sendJson(res, 201, await withAdvisory(proposition));
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

export async function handlePropositionById(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  if (req.method === "GET") {
    try {
      const proposition = await getPropositionById(id);
      if (!proposition) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, await withAdvisory(proposition));
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
      const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
      const provider = normalizeProvider(body?.provider || payload?.provider || "claude");
      const current = await getPropositionById(id);
      if (!current) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      const role = req.user?.role || "";
      const forbidden = authRequired() ? firstForbiddenField(role, current, payload) : null;
      if (forbidden) {
        const ownedBy = ownerLabel(forbidden);
        sendJson(res, 403, {
          error: ownedBy
            ? `You cannot change ${forbidden} (owned by ${ownedBy}).`
            : `You cannot change ${forbidden}.`,
          field: forbidden,
        });
        return;
      }

      if (!current.researchRunAt && !hasResearchMaterial(payload)) {
        sendJson(res, 400, {
          error: "Describe the idea, or attach a file, before the first Submit.",
          field: "ideaDescription",
        });
        return;
      }

      const proposition = await updateProposition(id, payload);
      if (!proposition) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }

      let suggestions = null;
      let notCovered = null;
      let sources = null;
      let researchError = null;
      let researchProvider = null;
      let suggestFallback = false;
      let fallbackProviders = [];
      let failedProvider = null;
      let failedProviderLabel = null;

      const shouldRunResearch = hasResearchMaterial(payload) && !current.researchRunAt;
      if (shouldRunResearch) {
        researchProvider = provider;
        try {
          await runWithLlm(provider, async () => {
            let working = proposition;
            if (!String(working.division || "").trim()) {
              const resolved = await resolveDivisionSilently({
                ideaDescription: payload.ideaDescription || "",
                category: payload.category || working.category || "",
              });
              if (resolved.division) {
                working = (await setPropositionDivision(id, resolved.division)) || working;
              }
            } else {
              console.log(
                `[primus/division] skip resolve — already set division=${working.division}`
              );
            }

            const research = await runPropositionResearch({
              ideaText: payload.ideaDescription || "",
              attachment: payload.attachment || null,
              proposition: working,
              division: working.division || "",
            });
            suggestions = research.suggestions;
            notCovered = research.notCovered;
            sources = research.sources;
          });
          await markResearchRun(id);
          console.log(`[primus/propositions] research ok provider=${provider}`);
        } catch (e) {
          researchError = redactSecrets(e.message || "Research pass failed.");
          const fail = failoverPayload(provider, researchError);
          suggestFallback = fail.suggestFallback;
          fallbackProviders = fail.fallbackProviders;
          failedProvider = fail.failedProvider || provider;
          failedProviderLabel = fail.failedProviderLabel || providerLabel(provider);
          console.warn(
            `[primus/propositions] research failed id=${id} provider=${provider}: ${researchError}`
          );
        }
      }

      const savedProposition = await getPropositionById(id);
      sendJson(res, 200, {
        ...(await withAdvisory(savedProposition || proposition)),
        suggestions,
        notCovered,
        sources,
        researchError,
        researchProvider,
        suggestFallback,
        fallbackProviders,
        failedProvider,
        failedProviderLabel,
      });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const role = req.user?.role || "";
      if (authRequired() && role !== "ADMIN" && role !== "BM") {
        sendJson(res, 403, { error: "Only BM or ADMIN can delete a proposition.", field: "id" });
        return;
      }
      const ok = await deleteProposition(id);
      if (!ok) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, { ok: true, id });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}
