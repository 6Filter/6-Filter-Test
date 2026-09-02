import { authRequired } from "./auth.js";
import { firstForbiddenField, ownerLabel } from "./fieldOwnership.js";
import {
  createProposition,
  deleteProposition,
  getPropositionById,
  getResearchCache,
  listPropositions,
  markResearchRun,
  saveResearchCache,
  setPropositionDivision,
  updateProposition,
} from "./db.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";
import { runPropositionResearch } from "./propositionAiFirstPass.js";
import { resolveDivisionSilently } from "./filters/resolveDivisionSilent.js";
import { normalizeProvider, providerLabel, runWithLlm } from "./llmContext.js";
import { configuredFallbackProviders, failoverPayload } from "./llmFailover.js";
import {
  fingerprintResearchInput,
  hashAttachment,
  logScoringTrace,
} from "./researchCache.js";

async function withAdvisory(proposition) {
  return {
    proposition,
    advisoryChecks: await computeAllAdvisoryChecks(proposition),
  };
}

function hasResearchMaterial(payload) {
  return Boolean(String(payload?.ideaDescription || "").trim() || payload?.attachment?.data);
}

function researchHashFor(doc = {}) {
  return fingerprintResearchInput({
    ideaDescription: doc.ideaDescription,
    category: doc.category,
    attachmentHash: hashAttachment(doc.attachment),
  });
}

async function applyResearchFindings(id, findings, division) {
  const current = await getPropositionById(id);
  if (!current) return null;
  if (!String(current.division || "").trim() && division) {
    await setPropositionDivision(id, division);
  }
  return markResearchRun(id, findings || null);
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
      const forceResearch = Boolean(body?.forceResearch || payload?.forceResearch);
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
      let freshResearch = false;
      const inputHash = researchHashFor(payload);
      const priorHash = researchHashFor(current);

      // forceResearch: explicit re-run (fallback retry). Hash mismatch: idea text changed.
      const shouldRunResearch =
        hasResearchMaterial(payload) &&
        (!current.researchRunAt || forceResearch || inputHash !== priorHash);
      if (shouldRunResearch) {
        const cached = forceResearch ? null : await getResearchCache(inputHash);
        if (cached) {
          console.log(
            `[primus/research-cache] hit proposition=${id} hash=${inputHash} ` +
              `division=${cached.division || ""} providerUsed=${cached.providerUsed || ""}`
          );
          researchProvider = cached.providerUsed || provider;
          suggestions = cached.suggestions;
          notCovered = cached.notCovered;
          sources = cached.sources;
          await applyResearchFindings(id, cached.researchFindings, cached.division);
        } else {
        console.log(`[primus/research-cache] miss proposition=${id} hash=${inputHash}`);
        const tried = [];
        let active = provider;
        let lastError = null;
        while (active && !tried.includes(active)) {
          tried.push(active);
          researchProvider = active;
          console.log(
            `[primus/propositions] research start id=${id} provider=${active} force=${forceResearch} hash=${inputHash}`
          );
          try {
            await runWithLlm(active, async () => {
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
              await applyResearchFindings(
                id,
                research.researchFindings || null,
                working.division || research.division || ""
              );
              await saveResearchCache(inputHash, {
                researchFindings: research.researchFindings || {},
                suggestions: research.suggestions,
                sources: research.sources,
                notCovered: research.notCovered,
                division: working.division || research.division || "",
                providerUsed: active,
              });
              freshResearch = true;
            });
            lastError = null;
            console.log(`[primus/propositions] research ok provider=${active} hash=${inputHash}`);
            break;
          } catch (e) {
            lastError = e;
            const msg = String(e.message || "");
            const skipSize = /groq skipped|too large|TPM|413/i.test(msg);
            const next =
              skipSize && active === "groq"
                ? configuredFallbackProviders(active).find((p) => !tried.includes(p.id))
                : null;
            if (next) {
              console.warn(
                `[primus/propositions] skip groq (oversized) — trying ${next.id} next`
              );
              active = next.id;
              continue;
            }
            researchError = redactSecrets(msg || "Research pass failed.");
            const fail = failoverPayload(active, researchError);
            suggestFallback = fail.suggestFallback;
            fallbackProviders = fail.fallbackProviders;
            failedProvider = fail.failedProvider || active;
            failedProviderLabel = fail.failedProviderLabel || providerLabel(active);
            if (
              failedProviderLabel &&
              !new RegExp(`^${failedProviderLabel}\\s+API failed`, "i").test(researchError)
            ) {
              researchError = `${failedProviderLabel} request failed. ${researchError}`;
            }
            console.warn(
              `[primus/propositions] research failed id=${id} provider=${active}: ${researchError}`
            );
            break;
          }
        }
        if (lastError && !researchError) {
          researchError = redactSecrets(lastError.message || "Research pass failed.");
        }
        }
      }

      const savedProposition = await getPropositionById(id);
      const advisory = await withAdvisory(savedProposition || proposition);
      if (freshResearch) {
        logScoringTrace({
          propositionId: id,
          hash: inputHash,
          division: advisory.proposition?.division || savedProposition?.division,
          providerUsed: researchProvider,
          researchFindings: savedProposition?.researchFindings,
          cache: "miss",
        });
      }
      sendJson(res, 200, {
        ...advisory,
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
