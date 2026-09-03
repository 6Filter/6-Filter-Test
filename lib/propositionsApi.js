import { authRequired } from "./auth.js";
import { firstForbiddenField, ownerLabel } from "./fieldOwnership.js";
import {
  createProposition,
  deleteAllPropositions,
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
import { logScoringTrace, researchHashFor } from "./researchCache.js";
import { composeProductIdeaText, gstRateUnfilled, resolveGstRate } from "./gstRate.js";
import { isMarginElasticityUnfilled } from "./mrpFormula.js";
import { f2HasEnough } from "./filterUnlock.js";
import { runMarginElasticityResearch } from "./filters/runMarginElasticityResearch.js";
import { isTechShiftRiskUnfilled, normalizeTechShiftRisk } from "./techShiftRisk.js";
import { runFilter4 } from "./filters/filter4TechShift.js";

async function withAdvisory(proposition) {
  return {
    proposition,
    advisoryChecks: await computeAllAdvisoryChecks(proposition),
  };
}

function hasResearchMaterial(payload) {
  return Boolean(String(payload?.ideaDescription || "").trim() || payload?.attachment?.data);
}

async function cachedSuggestionsFor(proposition) {
  if (!proposition?.researchRunAt) return null;
  try {
    const cached = await getResearchCache(researchHashFor(proposition));
    return cached?.suggestions || null;
  } catch {
    return null;
  }
}

function mergeSuggestionTrees(base, extra) {
  if (!extra) return base || null;
  if (!base) return extra;
  const out = { ...base, ...extra };
  for (const key of ["top", "f1", "f2", "f3", "f4", "f5", "f6"]) {
    if (base[key] || extra[key]) {
      out[key] = { ...(base[key] || {}), ...(extra[key] || {}) };
    }
  }
  return out;
}

function fillGstIfNeeded(working, suggestions) {
  if (!gstRateUnfilled(working?.f2?.gstRatePct)) return suggestions;
  const resolved = resolveGstRate({
    aiRate: suggestions?.f2?.gstRatePct,
    aiBasis: suggestions?.f2?.gstBasis || working?.f2?.gstBasis || "",
    name: working?.name || "",
    category: working?.category || "",
    ideaDescription: working?.ideaDescription || "",
  });
  return mergeSuggestionTrees(suggestions, {
    f2: { gstRatePct: resolved.gstRatePct, gstBasis: resolved.gstBasis },
  });
}

function payloadForOwnershipCheck(current, payload) {
  const next = { ...(payload || {}) };
  if (payload?.f2 && gstRateUnfilled(current?.f2?.gstRatePct) && !gstRateUnfilled(payload.f2?.gstRatePct)) {
    const f2 = { ...payload.f2 };
    delete f2.gstRatePct;
    delete f2.gstBasis;
    next.f2 = f2;
  }
  if (
    payload?.f3 &&
    isMarginElasticityUnfilled(current?.f3?.marginElasticity) &&
    !isMarginElasticityUnfilled(payload.f3?.marginElasticity)
  ) {
    const f3 = { ...payload.f3 };
    delete f3.marginElasticity;
    next.f3 = f3;
  }
  if (
    payload?.f4 &&
    isTechShiftRiskUnfilled(current?.f4?.techShiftRisk) &&
    !isTechShiftRiskUnfilled(payload.f4?.techShiftRisk)
  ) {
    const f4 = { ...payload.f4 };
    delete f4.techShiftRisk;
    next.f4 = f4;
  }
  return next;
}

function mergeWorkingProposition(current, payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  return {
    ...current,
    ...body,
    f1: { ...(current?.f1 || {}), ...(body.f1 || {}) },
    f2: { ...(current?.f2 || {}), ...(body.f2 || {}) },
    f3: { ...(current?.f3 || {}), ...(body.f3 || {}) },
    f4: { ...(current?.f4 || {}), ...(body.f4 || {}) },
    f5: { ...(current?.f5 || {}), ...(body.f5 || {}) },
    f6: { ...(current?.f6 || {}), ...(body.f6 || {}) },
  };
}

async function persistAutoFilledFields(id, working, suggestions) {
  const next = mergeWorkingProposition(working, {});
  let changed = false;
  if (gstRateUnfilled(next.f2?.gstRatePct) && !gstRateUnfilled(suggestions?.f2?.gstRatePct)) {
    next.f2 = {
      ...(next.f2 || {}),
      gstRatePct: suggestions.f2.gstRatePct,
      gstBasis: suggestions.f2.gstBasis || next.f2?.gstBasis,
    };
    changed = true;
  }
  if (isMarginElasticityUnfilled(next.f3?.marginElasticity)) {
    const suggestedRange = suggestions?.f3?.marginElasticity;
    const minR = Number(suggestedRange?.minMrpInr);
    const maxR = Number(suggestedRange?.maxMrpInr);
    if ((Number.isFinite(minR) && minR > 0) || (Number.isFinite(maxR) && maxR > 0)) {
      next.f3 = { ...(next.f3 || {}), marginElasticity: suggestedRange };
      changed = true;
    }
  }
  if (isTechShiftRiskUnfilled(next.f4?.techShiftRisk)) {
    const suggestedRisk = normalizeTechShiftRisk(suggestions?.f4?.techShiftRisk);
    if (suggestedRisk?.dimensions) {
      next.f4 = { ...(next.f4 || {}), techShiftRisk: suggestedRisk };
      changed = true;
    }
  }
  if (!changed) return working;
  return (await updateProposition(id, next)) || working;
}

async function syncResearchCacheSuggestions(proposition, suggestions) {
  if (!proposition?.researchRunAt || !suggestions) return;
  try {
    const hash = researchHashFor(proposition);
    const existing = await getResearchCache(hash);
    if (!existing) return;
    await saveResearchCache(hash, {
      ...existing,
      suggestions: mergeSuggestionTrees(existing.suggestions, suggestions),
    });
  } catch (e) {
    console.warn(`[primus/auto-fill] cache sync failed: ${e.message || e}`);
  }
}

async function fillF3MrpIfNeeded({ working, suggestions, provider }) {
  const range = working?.f3?.marginElasticity;
  const fromCache = suggestions?.f3?.marginElasticity;
  if (!isMarginElasticityUnfilled(range) || !isMarginElasticityUnfilled(fromCache)) {
    return suggestions;
  }
  const cogsRaw = working.f2?.cogsAtScale ?? suggestions?.f2?.cogsAtScale;
  const cogs =
    cogsRaw != null && String(cogsRaw).trim() !== "" ? Number(cogsRaw) : null;
  if (!f2HasEnough(working.f2) && !(cogs != null && cogs > 0)) return suggestions;
  try {
    const elasticity = await runWithLlm(provider || "claude", () =>
      runMarginElasticityResearch({
        cogsAtScale: cogs,
        netMarginAtScale: working.f2?.netMarginAtScale,
        division: working.division || "",
        category: working.category || "",
        ideaText: composeProductIdeaText({
          name: working.name || "",
          category: working.category || "",
          ideaDescription: working.ideaDescription || "",
        }),
      })
    );
    if (!elasticity) return suggestions;
    const minR = Number(elasticity.minMrpInr);
    const maxR = Number(elasticity.maxMrpInr);
    const hasRupee = (Number.isFinite(minR) && minR > 0) || (Number.isFinite(maxR) && maxR > 0);
    if (!hasRupee) {
      console.warn(
        `[primus/f3-mrp] research returned no rupee ends min=${elasticity.minMrpInr} max=${elasticity.maxMrpInr}`
      );
      return suggestions;
    }
    console.log(
      `[primus/f3-mrp] auto-fill min=₹${elasticity.minMrpInr} max=₹${elasticity.maxMrpInr}`
    );
    return mergeSuggestionTrees(suggestions, { f3: { marginElasticity: elasticity } });
  } catch (e) {
    console.warn(`[primus/f3-mrp] auto-fill research failed: ${e.message || e}`);
    return suggestions;
  }
}

async function fillF4TechShiftIfNeeded({ working, suggestions, provider }) {
  const current = working?.f4?.techShiftRisk;
  const fromCache = suggestions?.f4?.techShiftRisk;
  if (!isTechShiftRiskUnfilled(current) || !isTechShiftRiskUnfilled(fromCache)) {
    return suggestions;
  }
  try {
    const filter4 = await runWithLlm(provider || "claude", () =>
      runFilter4({
        ideaText: composeProductIdeaText({
          name: working.name || "",
          category: working.category || "",
          ideaDescription: working.ideaDescription || "",
        }),
      })
    );
    const risk = normalizeTechShiftRisk(filter4?.techShiftRisk);
    if (!risk?.dimensions) {
      console.warn("[primus/f4-tech] research returned no dimensions");
      return suggestions;
    }
    console.log(`[primus/f4-tech] auto-fill overall=${risk.overallRisk}`);
    return mergeSuggestionTrees(suggestions, { f4: { techShiftRisk: risk } });
  } catch (e) {
    console.warn(`[primus/f4-tech] auto-fill research failed: ${e.message || e}`);
    return suggestions;
  }
}

async function applyDerivedAutoFill({ id, working, suggestions, provider }) {
  let nextWorking = mergeWorkingProposition(working, {});
  if (!String(nextWorking.division || "").trim()) {
    try {
      const resolved = await resolveDivisionSilently({
        ideaDescription: nextWorking.ideaDescription || "",
        category: nextWorking.category || "",
      });
      if (resolved.division) {
        const saved = await setPropositionDivision(id, resolved.division);
        nextWorking = {
          ...(saved || nextWorking),
          ...nextWorking,
          division: resolved.division,
        };
      }
    } catch (e) {
      console.warn(`[primus/auto-fill] division resolve failed: ${e.message || e}`);
    }
  }
  let nextSuggestions = fillGstIfNeeded(nextWorking, suggestions);
  if (isMarginElasticityUnfilled(nextWorking?.f3?.marginElasticity)) {
    nextSuggestions = await fillF3MrpIfNeeded({
      working: nextWorking,
      suggestions: nextSuggestions,
      provider,
    });
  }
  if (isTechShiftRiskUnfilled(nextWorking?.f4?.techShiftRisk)) {
    nextSuggestions = await fillF4TechShiftIfNeeded({
      working: nextWorking,
      suggestions: nextSuggestions,
      provider,
    });
  }
  const persisted = await persistAutoFilledFields(id, nextWorking, nextSuggestions);
  await syncResearchCacheSuggestions(persisted || nextWorking, nextSuggestions);
  return { suggestions: nextSuggestions, proposition: persisted };
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

export async function handlePropositionsBulkDelete(req, res, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "DELETE") {
    sendJson(res, 405, { error: "DELETE only." });
    return;
  }

  try {
    const role = req.user?.role || "";
    if (authRequired() && role !== "ADMIN") {
      sendJson(res, 403, { error: "Only ADMIN can delete all propositions." });
      return;
    }
    const count = await deleteAllPropositions();
    sendJson(res, 200, { deleted: count });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
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
      const advisory = await withAdvisory(proposition);
      sendJson(res, 200, {
        ...advisory,
        suggestions: await cachedSuggestionsFor(proposition),
      });
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
      const forbidden = authRequired()
        ? firstForbiddenField(role, current, payloadForOwnershipCheck(current, payload))
        : null;
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
                ideaText: composeProductIdeaText({
                  name: payload.name || working.name || "",
                  category: payload.category || working.category || "",
                  ideaDescription: payload.ideaDescription || "",
                }),
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
      if (!suggestions) {
        suggestions = await cachedSuggestionsFor(savedProposition || proposition);
      }
      const derived = await applyDerivedAutoFill({
        id,
        working: mergeWorkingProposition(savedProposition || proposition, payload),
        suggestions,
        provider,
      });
      suggestions = derived.suggestions;
      const advisory = await withAdvisory(derived.proposition || savedProposition || proposition);
      if (freshResearch) {
        logScoringTrace({
          propositionId: id,
          hash: inputHash,
          division: advisory.proposition?.division || savedProposition?.division,
          providerUsed: researchProvider,
          researchFindings: (derived.proposition || savedProposition)?.researchFindings,
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

export async function handlePropositionAutoFill(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  try {
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const provider = normalizeProvider(body?.provider || payload?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const working = mergeWorkingProposition(current, payload);
    let suggestions = await cachedSuggestionsFor(working);
    const derived = await applyDerivedAutoFill({ id, working, suggestions, provider });
    sendJson(res, 200, {
      ...(await withAdvisory(derived.proposition || current)),
      suggestions: derived.suggestions,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
