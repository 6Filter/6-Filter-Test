import { authRequired } from "./auth.js";
import {
  canDeleteLogProposition,
  canViewProposition,
  unlockedDepartmentOf,
  visiblePropositions,
} from "./propositionAccess.js";
import { canApproveManagerRole } from "./managerReview.js";
import { firstForbiddenField, ownerLabel } from "./fieldOwnership.js";
import { LIST_PROPOSITIONS_CAP } from "./lockedConstants.js";
import {
  createProposition,
  deleteAllPropositions,
  deleteProposition,
  deleteUntouchedDrafts,
  getPropositionById,
  getResearchCache,
  countPropositions,
  listPropositions,
  markResearchRun,
  saveResearchCache,
  setPropositionDivision,
  setPropositionFinalSummary,
  updateProposition,
} from "./db.js";
import { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } from "./propositionScoring.js";
import { runPropositionResearch } from "./propositionAiFirstPass.js";
import { resolveDivisionSilently } from "./filters/resolveDivisionSilent.js";
import { normalizeProvider, providerLabel, runWithLlm } from "./llmContext.js";
import { failoverPayload } from "./llmFailover.js";
import { logResearchCacheLookup, logScoringTrace, researchHashFor } from "./researchCache.js";
import { composeProductIdeaText, gstRateUnfilled, resolveGstRate } from "./gstRate.js";
import { isMarginElasticityUnfilled } from "./mrpFormula.js";
import { computeDerivedMrp } from "./f2Derived.js";
import { f2HasEnough } from "./filterUnlock.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { runMarginElasticityResearch } from "./filters/runMarginElasticityResearch.js";
import { isTechShiftRiskUnfilled, normalizeTechShiftRisk } from "./techShiftRisk.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { runCostEstimate } from "./filters/runCostEstimate.js";
import { extractConceptCardFields } from "./filters/extractConceptCard.js";
import { attachNoCompetitorCheck } from "./filters/runNoCompetitorCheck.js";
import { isClaimingNoCompetitor } from "./filterChecks.js";
import { hasSubmitterIdentity } from "./propositionFields.js";
import { generateFinalSummary, shouldGenerateFinalSummary } from "./finalSummary.js";
import { checkLabelsFromAdvisory, compactAdvisoryForLog } from "./logStatus.js";
import {
  cachedCostEstimateFrom,
  f2SuggestionsFromCostEstimate,
  hasCachedCostEstimate,
  logCostEstimateCache,
} from "./researchFindings.js";

async function withAdvisory(proposition) {
  const advisoryChecks = await computeAllAdvisoryChecks(proposition);
  const prev = proposition?.goNoGo && typeof proposition.goNoGo === "object" ? proposition.goNoGo : null;
  if (!prev?.classification) {
    return { proposition, advisoryChecks };
  }
  const labels = checkLabelsFromAdvisory(compactAdvisoryForLog(proposition, advisoryChecks));
  return {
    proposition: {
      ...proposition,
      goNoGo: {
        ...prev,
        classification: computeGoNoGo(advisoryChecks),
        score: scoreAdvisoryChecks(advisoryChecks),
        ideaScale: ideaScaleFromDoc(proposition),
        ideaName: formIdeaLabel(proposition),
        category: formCategoryLabel(proposition),
        ...(Object.keys(labels).length ? { checkLabels: labels } : {}),
      },
    },
    advisoryChecks,
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

function isBlankF2Value(value) {
  return value == null || String(value).trim() === "";
}

function suggestionsWithCachedCost(cached, suggestions) {
  const cost = cachedCostEstimateFrom(cached);
  if (!cost) return suggestions;
  return mergeSuggestionTrees(suggestions || cached?.suggestions || {}, {
    f2: f2SuggestionsFromCostEstimate(cost),
  });
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
  const f2FromCache = suggestions?.f2 || {};
  const f2FillKeys = ["cogsAtScale", "netMarginAtScale", "grammage", "qcomTrajectory"];
  const f2Patch = {};
  for (const key of f2FillKeys) {
    if (isBlankF2Value(next.f2?.[key]) && !isBlankF2Value(f2FromCache[key])) {
      f2Patch[key] = f2FromCache[key];
    }
  }
  if (Object.keys(f2Patch).length) {
    next.f2 = { ...(next.f2 || {}), ...f2Patch };
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
        grammage: working.f2?.grammage || suggestions?.f2?.grammage || "",
        mrpInr:
          working.f2?.mrpInr ||
          suggestions?.f2?.mrpInr ||
          computeDerivedMrp(
            cogs,
            working.f2?.netMarginAtScale,
            working.f2?.gstRatePct ?? suggestions?.f2?.gstRatePct
          ),
        competitorPriceInr: suggestions?.f2?.competitorPriceInr || null,
        competitorPackSize: suggestions?.f2?.competitorPackSize || null,
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
        if (Number.isFinite(n) && n > 0) limit = Math.min(LIST_PROPOSITIONS_CAP, Math.floor(n));
      } catch {
        /* keep default */
      }
      const tableCount = await countPropositions();
      console.log(`[primus/propositions] total in table: ${tableCount}`);
      if (!unlockedDepartmentOf(req.user) && !canApproveManagerRole(req.user?.role)) {
        sendJson(res, 200, { propositions: [], departmentUnlockRequired: true, tableCount });
        return;
      }
      const propositions = visiblePropositions(req.user, await listPropositions(limit));
      sendJson(res, 200, { propositions, tableCount });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const proposition = await createProposition({ createdByUserId: req.user?.id || null });
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
    if (!canDeleteLogProposition(req.user)) {
      sendJson(res, 403, { error: "Only Master unlock can delete propositions." });
      return;
    }
    // Master (or ADMIN) wipe is unscoped — every submitter team.
    const count = await deleteAllPropositions(null);
    sendJson(res, 200, { deleted: count, department: null });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handlePropositionsCleanupUntouched(req, res, { sendJson, redactSecrets }) {
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
    if (authRequired() && role !== "ADMIN" && role !== "BM") {
      sendJson(res, 403, { error: "Only ADMIN or BM can clean up untouched drafts." });
      return;
    }
    if (!canDeleteLogProposition(req.user)) {
      sendJson(res, 403, { error: "Only Master unlock can delete propositions." });
      return;
    }
    const ids = await deleteUntouchedDrafts(null);
    sendJson(res, 200, { deleted: ids.length, ids, department: null });
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
      if (!proposition || !canViewProposition(req.user, proposition)) {
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
      if (!current || !canViewProposition(req.user, current)) {
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

      if (!hasSubmitterIdentity(payload)) {
        sendJson(res, 400, {
          error: "Enter your name and select your department before Submit.",
          field: "submitterName",
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

      const { goNoGo: _clientStoredResult, managerReview: _mr, managerApproval: _ma, finalSummary: _fs, ...fieldPayload } = payload;
      const proposition = await updateProposition(id, fieldPayload);
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
        logResearchCacheLookup(inputHash, cached);
        const cachedCost = cachedCostEstimateFrom(cached);
        logCostEstimateCache(inputHash, cachedCost);
        if (cached && hasCachedCostEstimate(cached)) {
          console.log(
            `[primus/research-cache] proposition=${id} division=${cached.division || ""} providerUsed=${cached.providerUsed || ""}`
          );
          researchProvider = cached.providerUsed || provider;
          suggestions = suggestionsWithCachedCost(cached, cached.suggestions);
          notCovered = cached.notCovered;
          sources = cached.sources;
          let findings = cached.researchFindings;
          if (isClaimingNoCompetitor(payload.f1 || {}, findings?.f1 || {})) {
            await runWithLlm(researchProvider, async () => {
              findings = await attachNoCompetitorCheck(payload, findings, { forceFresh: forceResearch });
            });
          }
          await applyResearchFindings(id, findings, cached.division);
        } else {
        console.log(`[primus/research-cache] miss detail proposition=${id} hash=${inputHash}`);
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
                inputHash,
                forceFresh: forceResearch,
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
      } else if (hasResearchMaterial(payload)) {
        const cached = await getResearchCache(inputHash);
        logResearchCacheLookup(inputHash, Boolean(cached || current.researchRunAt));
      }

      const savedProposition = await getPropositionById(id);
      if (!suggestions) {
        suggestions = await cachedSuggestionsFor(savedProposition || proposition);
      }
      const skipDerivedAutoFill =
        Boolean(current.researchRunAt) && !forceResearch && inputHash === priorHash;
      let derivedProposition = savedProposition || proposition;
      if (!skipDerivedAutoFill) {
        const derived = await applyDerivedAutoFill({
          id,
          working: mergeWorkingProposition(savedProposition || proposition, payload),
          suggestions,
          provider,
        });
        suggestions = derived.suggestions;
        derivedProposition = derived.proposition || derivedProposition;
      }
      const advisory = await withAdvisory(derivedProposition);
      if (advisory.proposition?.goNoGo) {
        await updateProposition(id, { goNoGo: advisory.proposition.goNoGo });
      }
      let outProposition = advisory.proposition;
      if (shouldGenerateFinalSummary(current, outProposition)) {
        try {
          const summary = await generateFinalSummary(outProposition);
          const closed = await setPropositionFinalSummary(id, summary);
          if (closed) outProposition = closed;
        } catch (e) {
          console.error(`[primus/final-summary] proposition=${id} ${e.message}`);
        }
      }
      if (freshResearch) {
        logScoringTrace({
          propositionId: id,
          hash: inputHash,
          division: advisory.proposition?.division || savedProposition?.division,
          providerUsed: researchProvider,
          researchFindings: derivedProposition?.researchFindings,
          cache: "miss",
        });
      }
      sendJson(res, 200, {
        ...advisory,
        proposition: outProposition,
        suggestions,
        notCovered,
        sources,
        researchError,
        researchProvider,
        researchRan: Boolean(shouldRunResearch),
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
      if (!canDeleteLogProposition(req.user)) {
        sendJson(res, 403, { error: "Only Master unlock can delete propositions." });
        return;
      }
      const existing = await getPropositionById(id);
      if (!existing || !canViewProposition(req.user, existing)) {
        sendJson(res, 404, { error: "Proposition not found." });
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
    if (!current || !canViewProposition(req.user, current)) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const working = mergeWorkingProposition(current, payload);
    let suggestions = await cachedSuggestionsFor(working);
    if (current.researchRunAt) {
      try {
        const cached = await getResearchCache(researchHashFor(working));
        suggestions = suggestionsWithCachedCost(cached, suggestions);
        logCostEstimateCache(researchHashFor(working), cachedCostEstimateFrom(cached));
      } catch {
        /* keep suggestions */
      }
      const persisted = await persistAutoFilledFields(id, working, suggestions);
      sendJson(res, 200, {
        ...(await withAdvisory(persisted || current)),
        suggestions,
      });
      return;
    }
    const derived = await applyDerivedAutoFill({ id, working, suggestions, provider });
    sendJson(res, 200, {
      ...(await withAdvisory(derived.proposition || current)),
      suggestions: derived.suggestions,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

function draftFieldPayload(payload = {}) {
  const {
    goNoGo: _g,
    managerReview: _mr,
    managerApproval: _ma,
    finalSummary: _fs,
    advisoryChecks: _ac,
    suggestions: _sg,
    researchFindings: _rf,
    researchRunAt: _rr,
    classification: _c,
    ...fields
  } = payload;
  return fields;
}

export async function handlePropositionDraft(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const current = await getPropositionById(id);
    if (!current || !canViewProposition(req.user, current)) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const proposition = await updateProposition(id, draftFieldPayload(payload), { bumpVersion: false });
    sendJson(res, 200, { proposition, draft: true });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handlePropositionConceptCard(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const attachment = body?.attachment && typeof body.attachment === "object" ? body.attachment : null;
    const provider = normalizeProvider(body?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current || !canViewProposition(req.user, current)) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const extracted = await runWithLlm(provider, () => extractConceptCardFields({ attachment, provider }));
    const suggestions = { top: {}, f1: {} };
    if (extracted.category) suggestions.top.category = extracted.category;
    if (extracted.ideaDescription) suggestions.top.ideaDescription = extracted.ideaDescription;
    if (extracted.declaredAttribute) suggestions.f1.declaredAttribute = extracted.declaredAttribute;
    if (extracted.benchmark) suggestions.f1.benchmark = extracted.benchmark;
    if (extracted.declaredGap != null) suggestions.f1.declaredGap = extracted.declaredGap;
    sendJson(res, 200, { suggestions, extractedKeys: Object.keys(extracted) });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

const REFRESH_FIELDS = new Set([
  "cogsAtScale",
  "netMarginAtScale",
  "gstRatePct",
  "grammage",
  "marginElasticity",
  "techShiftRisk",
]);

function applyRefreshedField(working, field, estimate, elasticity, risk) {
  if (field === "cogsAtScale" && estimate?.estimatedCogsPerUnitInr != null) {
    return { filterKey: "f2", fieldKey: "cogsAtScale", value: estimate.estimatedCogsPerUnitInr };
  }
  if (field === "netMarginAtScale" && estimate?.estimatedNetMarginPct != null) {
    return { filterKey: "f2", fieldKey: "netMarginAtScale", value: estimate.estimatedNetMarginPct };
  }
  if (field === "gstRatePct" && estimate?.estimatedGstRatePct != null) {
    return {
      filterKey: "f2",
      fieldKey: "gstRatePct",
      value: estimate.estimatedGstRatePct,
      extra: { gstBasis: estimate.gstBasis || working?.f2?.gstBasis || "" },
    };
  }
  if (field === "grammage" && estimate?.estimatedGrammage) {
    return { filterKey: "f2", fieldKey: "grammage", value: estimate.estimatedGrammage };
  }
  if (field === "marginElasticity" && elasticity) {
    return { filterKey: "f3", fieldKey: "marginElasticity", value: elasticity };
  }
  if (field === "techShiftRisk" && risk) {
    return { filterKey: "f4", fieldKey: "techShiftRisk", value: risk };
  }
  return null;
}

export async function handlePropositionRefreshField(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const field = String(body?.field || "").trim();
    const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : {};
    const provider = normalizeProvider(body?.provider || "claude");
    if (!REFRESH_FIELDS.has(field)) {
      sendJson(res, 400, { error: "Unknown field to refresh." });
      return;
    }
    const current = await getPropositionById(id);
    if (!current || !canViewProposition(req.user, current)) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const working = mergeWorkingProposition(current, payload);
    const ideaText = composeProductIdeaText({
      name: working.name || "",
      category: working.category || "",
      ideaDescription: working.ideaDescription || "",
    });

    let estimate = null;
    let elasticity = null;
    let risk = null;
    await runWithLlm(provider, async () => {
      if (["cogsAtScale", "netMarginAtScale", "gstRatePct", "grammage"].includes(field)) {
        estimate = await runCostEstimate({
          ideaText,
          name: working.name || "",
          category: working.category || "",
          division: working.division || "",
        });
      } else if (field === "marginElasticity") {
        elasticity = await runMarginElasticityResearch({
          cogsAtScale: working.f2?.cogsAtScale,
          netMarginAtScale: working.f2?.netMarginAtScale,
          division: working.division || "",
          category: working.category || "",
          ideaText,
          grammage: working.f2?.grammage || "",
          mrpInr: working.f2?.mrpInr ?? null,
          competitorPriceInr: working.f2?.competitorPriceInr ?? null,
          competitorPackSize: working.f2?.competitorPackSize || "",
        });
      } else if (field === "techShiftRisk") {
        const filter4 = await runFilter4({ ideaText, category: working.category || "" });
        risk = normalizeTechShiftRisk(filter4?.techShiftRisk);
      }
    });

    const applied = applyRefreshedField(working, field, estimate, elasticity, risk);
    if (!applied) {
      sendJson(res, 422, { error: "Re-run returned no value for that field. Try again." });
      return;
    }
    sendJson(res, 200, {
      field,
      filterKey: applied.filterKey,
      fieldKey: applied.fieldKey,
      value: applied.value,
      extra: applied.extra || null,
      forceFresh: true,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
