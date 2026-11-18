import { timingSafeEqual } from "node:crypto";
import { authRequired } from "./auth.js";
import { deleteAllConfirmPhrase, deleteAllPhraseMatches } from "./deleteAllConfirm.js";
import { readJsonBody } from "./http.js";
import {
  canAccessIdea,
  canDeleteLogProposition,
  filterAccessibleIdeas,
  requireUnlockedDepartment,
  unlockedDepartmentOf,
} from "./propositionAccess.js";
import {
  isCanonicalTeam,
  preserveSubmitterDepartment,
  teamIsLegacy,
} from "./propositionFields.js";
import { canApproveManagerRole } from "./managerReview.js";
import { isServerOwnedField, stripServerOwnedFields, usuallyProvidedByHint } from "./fieldOwnership.js";
import { firstForbiddenField } from "./fieldOwnershipGate.js";
import { ideaTeamRaw } from "./propositionAccess.js";
import { INVALID_INPUTS_BLOCK_SUBMIT, LIST_PROPOSITIONS_CAP } from "./lockedConstants.js";
import { reviewInputs, researchDisplayValue } from "./inputReview.js";
import {
  inputReviewCacheKey,
  mergeInputReview,
  runInputReviewAi,
  shouldRunInputReviewAi,
} from "./inputReviewAi.js";
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
  markFirstSubmitted,
  saveResearchCache,
  adminCorrectPropositionDivision,
  setPropositionDivision,
  setPropositionFinalSummary,
  updateProposition,
  updatePropositionResearchFindingsOnly,
  listDivisionConfirmationQueue,
  query,
  usingPostgres,
} from "./db.js";
import { isLockedDivisionName } from "./divisionMargin.js";
import { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } from "./propositionScoring.js";
import { buildGateRationale } from "./goNoGo.js";
import { resolveHardLockedGoNoGo, sealStoredGoNoGo } from "./analysisStability.js";
import { annotateSealedGoNoGo, stampScreenedGoNoGo } from "./scoringRuleset.js";
import { canSealOutput, sealGoNoGoOutput } from "./sealOutput.js";
import {
  annotateEvaluationOnListRow,
  annotateEvaluationOnProposition,
  buildPropositionReadResponse,
} from "./evaluationResponse.js";
import { propositionEvaluationState } from "./evaluationStatus.js";
import { runPropositionResearch } from "./propositionAiFirstPass.js";
import { planResearch, shouldRunStep } from "./researchProgress.js";
import { blankClearsInPayload, omitEmptyFilterColumns } from "./filterWriteGuard.js";
import { resolveDivisionSilently } from "./filters/resolveDivisionSilent.js";
import { normalizeProvider, providerLabel, runWithLlm } from "./llmContext.js";
import { failoverPayload } from "./llmFailover.js";
import { logResearchCacheLookup, logScoringTrace, researchHashFor } from "./researchCache.js";
import { composeProductIdeaText, gstRateUnfilled } from "./gstRate.js";
import {
  NET_MARGIN_STATUS_PATH,
  applyDivisionMinimumMargin,
  divisionMinimumStatusEntry,
} from "./netMarginDefault.js";
import { applyDerivedMrpToF2, isMarginElasticityUnfilled } from "./mrpFormula.js";
import { computeDerivedMrp } from "./f2Derived.js";
import { f2HasEnough } from "./filterUnlock.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { runMarginElasticityResearch } from "./filters/runMarginElasticityResearch.js";
import { isTechShiftRiskUnfilled, normalizeTechShiftRisk } from "./techShiftRisk.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { mergeF4Assessments } from "./f4Assessment.js";
import { runCostEstimate } from "./filters/runCostEstimate.js";
import { extractConceptCardFields } from "./filters/extractConceptCard.js";
import { attachNoCompetitorCheck } from "./filters/runNoCompetitorCheck.js";
import { isClaimingNoCompetitor } from "./filterChecks.js";
import { hasSubmitterIdentity } from "./propositionFields.js";
import { requiredEmpty } from "./fieldRoleDisplay.js";
import { generateFinalSummary, shouldGenerateFinalSummary } from "./finalSummary.js";
import { shouldForkLogResubmit } from "./analysisStability.js";
import { closeSubmissionCost, openSubmissionCost } from "./submissionCost.js";
import { checkLabelsFromAdvisory, compactAdvisoryForLog } from "./logStatus.js";
import {
  cachedCostEstimateFrom,
  f2SuggestionsFromCostEstimate,
  hasCachedCostEstimate,
  logCostEstimateCache,
  enrichResearchFindingsSizingFactors,
} from "./researchFindings.js";
import { hasReplayableResearchCache } from "./researchCacheable.js";

function statedAttributes(doc = {}) {
  const f1 = doc.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  return [f1.declaredAttribute, f1.declaredAttribute2, f1.declaredAttribute3]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
}

/** True when a saved research pass does not cover the attributes now on the form. */
function attributeFindingsAreStale(doc = {}, findingsSource = null) {
  const stated = statedAttributes(doc);
  const source = findingsSource || doc;
  if (!stated.length || !(source.researchRunAt || doc.researchRunAt)) return false;
  const validation = source.researchFindings?.f1?.attributeValidation;
  if (!Array.isArray(validation) || !validation.length) return false;
  const covered = new Set(
    validation.map((v) => String(v?.stated || "").trim().toLowerCase()).filter(Boolean)
  );
  return stated.some((attr) => !covered.has(attr));
}

async function auditPreviousOutput(propositionId, previousOutput, actor = "") {
  if (!previousOutput || !propositionId) return;
  try {
    await query(
      `INSERT INTO proposition_audit (at, action, actor, row_count, ids_json)
       VALUES (NOW(), $1, $2, $3, $4)`,
      [
        "output-replaced",
        String(actor || "evaluate"),
        1,
        JSON.stringify([{ id: propositionId, previousOutput }]),
      ]
    );
  } catch (e) {
    console.warn(`[primus/output-audit] ${e?.message || e}`);
  }
}

/**
 * Part 136 — compute checks only when sealing (attachGate). GET never returns live checks.
 */
async function withAdvisory(proposition, { attachGate = false, actor = "" } = {}) {
  const suggestions = await cachedSuggestionsFor(proposition);
  const researchFindings = enrichResearchFindingsSizingFactors(
    proposition?.researchFindings,
    suggestions
  );
  const enriched =
    researchFindings !== proposition?.researchFindings
      ? { ...proposition, researchFindings }
      : proposition;
  const prev = enriched?.goNoGo && typeof enriched.goNoGo === "object" ? enriched.goNoGo : null;

  // Read path: annotate evaluation state; never recompute live advisoryChecks for display.
  if (!attachGate) {
    return {
      ...buildPropositionReadResponse(enriched, { suggestions }),
      // Internal alias kept for callers that still read .proposition
      suggestions,
    };
  }

  // Write path (Submit / Evaluate): compute once, seal only when every required step is done.
  const advisoryChecks = await computeAllAdvisoryChecks(enriched);
  const labels = checkLabelsFromAdvisory(compactAdvisoryForLog(enriched, advisoryChecks));
  const ideaName = formIdeaLabel(enriched);
  const category = formCategoryLabel(enriched);
  let goNoGo = stampScreenedGoNoGo(
    resolveHardLockedGoNoGo({
      doc: enriched,
      prev,
      advisoryChecks,
      computeClassification: computeGoNoGo,
      computeScore: scoreAdvisoryChecks,
      buildRationale: buildGateRationale,
      ideaName,
      category,
      extras: {
        ideaScale: ideaScaleFromDoc(enriched),
        ideaName,
        category,
        checkLabels: labels,
      },
    }),
    enriched
  );
  if (goNoGo?.classification === "INCOMPLETE" && goNoGo.ideaScale != null) {
    const { ideaScale: _omit, ...rest } = goNoGo;
    goNoGo = rest;
  }

  if (canSealOutput(enriched)) {
    if (prev?.output?.sealedAt) {
      await auditPreviousOutput(enriched.id, prev.output, actor);
    }
    goNoGo = sealGoNoGoOutput(goNoGo, { advisoryChecks, doc: enriched });
  } else if (prev?.output?.sealedAt) {
    // Edited since evaluation — keep sealed output; scoreStatus marks it stale.
    goNoGo = annotateSealedGoNoGo(enriched, sealStoredGoNoGo(enriched, prev));
  } else if (prev?.classification && Number(prev?.score?.total) > 0) {
    // Legacy screened idea: keep stored verdict until a full Evaluate seals.
    goNoGo = prev;
  } else {
    // Incomplete / not-evaluated: no verdict, no percent, no cards.
    goNoGo = null;
  }

  const propositionOut = { ...enriched, goNoGo };
  const read = buildPropositionReadResponse(propositionOut, { suggestions });
  return {
    ...read,
    // Sealing used these; do not send them as display advisoryChecks.
    _sealedWithChecks: advisoryChecks,
    suggestions,
  };
}

const DB_READ_UNAVAILABLE = "Database unavailable. Try again shortly.";

function readDbError(e, redactSecrets) {
  if (e?.status === 503 && /database unavailable/i.test(String(e?.message || ""))) return DB_READ_UNAVAILABLE;
  return redactSecrets(e.message);
}

function headerValue(req, name) {
  const raw = req?.headers?.[name];
  return String(Array.isArray(raw) ? raw[0] : raw ?? "");
}

/** A presented token is compared in constant time. Absent means this is a normal save. */
export function probeTokenDecision(req) {
  const presented = headerValue(req, "x-primus-probe-token");
  if (!presented) return "absent";
  const expected = String(process.env.PRIMUS_PROBE_TOKEN || "");
  const left = Buffer.from(expected);
  const right = Buffer.from(presented);
  if (!expected || left.length !== right.length) {
    const filler = left.length ? Buffer.alloc(left.length) : Buffer.from("probe-token");
    const known = left.length ? left : Buffer.from("probe-token");
    timingSafeEqual(known, filler);
    return "reject";
  }
  return timingSafeEqual(left, right) ? "ok" : "reject";
}

function rejectProbeToken() {
  const error = new Error("Probe token rejected.");
  error.status = 403;
  return error;
}

/** Returns whether this save may write the probe column. A body field alone never does. */
function applyProbeFlag(req, payload, target) {
  const decision = probeTokenDecision(req);
  if (decision === "reject") throw rejectProbeToken();
  if (target && Object.prototype.hasOwnProperty.call(target, "probe")) delete target.probe;
  if (decision !== "ok") return false;
  target.probe = payload?.probe === false ? false : true;
  return true;
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

/**
 * Part 138 E (D52) — GST is a human / Finance input. Never write an AI or default 18 into the form.
 * Kept as a pass-through so call sites stay stable.
 */
function fillGstIfNeeded(_working, suggestions) {
  return suggestions;
}

/**
 * Part 145 D105 — fill a blank submitterName from the account and a blank submitterDepartment
 * from the profile team (then the stored idea). Never overwrites something already typed.
 */
export function fillIdentityFromAccount(payload, stored, user) {
  const base = payload && typeof payload === "object" ? payload : {};
  const name = String(base.submitterName || "").trim();
  const team = String(base.submitterDepartment || "").trim();
  const next = { ...base };
  if (!name) {
    next.submitterName =
      String(user?.name || "").trim() ||
      String(stored?.submitterName || "").trim() ||
      String(user?.email || "").split("@")[0].trim();
  }
  if (!team) {
    next.submitterDepartment =
      String(user?.team || "").trim() ||
      String(stored?.submitterDepartment || "").trim() ||
      String(unlockedDepartmentOf(user) || "").trim();
  }
  return next;
}

/** First blank Required box on Submit (display Required list). Merge stored values for absent keys. */
export function firstMissingRequiredField(payload, stored = null) {
  const merged = {
    ...(stored && typeof stored === "object" ? stored : {}),
    ...(payload && typeof payload === "object" ? payload : {}),
    f1: {
      ...(stored?.f1 && typeof stored.f1 === "object" ? stored.f1 : {}),
      ...(payload?.f1 && typeof payload.f1 === "object" ? payload.f1 : {}),
    },
    f2: {
      ...(stored?.f2 && typeof stored.f2 === "object" ? stored.f2 : {}),
      ...(payload?.f2 && typeof payload.f2 === "object" ? payload.f2 : {}),
    },
  };
  const left = requiredEmpty(merged);
  if (!left.length) return null;
  const first = left[0];
  return { field: first.path, label: first.label };
}

/**
 * Part 140 A (D62) — ownership is checked on the payload AFTER server-owned keys are stripped,
 * so a client-sent techShiftRisk / goNoGo / etc. can never come back through this path.
 */
function payloadForOwnershipCheck(current, payload) {
  const { cleaned } = stripServerOwnedFields(
    payload && typeof payload === "object" ? payload : {},
    current
  );
  return cleaned;
}

const TYPED_F2_VALUE_KEYS = ["netMarginAtScale", "gstRatePct", "cogsAtScale", "grammage", "mrpInr"];

function f2ValueChanged(incoming, stored) {
  const a = String(incoming ?? "").trim();
  const b = String(stored ?? "").trim();
  if (a === b) return false;
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na !== nb;
  return true;
}

/**
 * Part 141 C (D75) — typed values own their markers. Compares each relevant incoming f2 value with the stored one:
 *  - netMarginAtScale changed → netMarginSource "user";
 *  - gstRatePct changed → gstBasis cleared ("");
 *  - unchanged values leave existing markers (netMarginSource / gstBasis) exactly as sent.
 * Returns a new f2 object (never mutates inputs); non-object input is returned as-is.
 */
export function markChangedF2AsUserOwned(incomingF2, storedF2) {
  if (!incomingF2 || typeof incomingF2 !== "object" || Array.isArray(incomingF2)) return incomingF2;
  const stored = storedF2 && typeof storedF2 === "object" ? storedF2 : {};
  const next = { ...incomingF2 };
  const changed = new Set(
    TYPED_F2_VALUE_KEYS.filter(
      (key) => Object.prototype.hasOwnProperty.call(incomingF2, key) && f2ValueChanged(incomingF2[key], stored[key])
    )
  );
  if (changed.has("netMarginAtScale")) next.netMarginSource = "user";
  if (changed.has("gstRatePct")) next.gstBasis = "";
  return next;
}

function withTypedF2Markers(payload, stored) {
  if (!payload || typeof payload !== "object" || !payload.f2 || typeof payload.f2 !== "object") return payload;
  return { ...payload, f2: markChangedF2AsUserOwned(payload.f2, stored?.f2) };
}

/** Part 140 A — audit (never refuse) when a client sent a server-owned value that differs from stored. */
async function auditServerOwnedWriteAttempt(id, user, attemptedDiffs, { handler = "" } = {}) {
  if (!Array.isArray(attemptedDiffs) || !attemptedDiffs.length) return;
  const actor = String(user?.email || user?.id || "unknown").trim();
  const paths = attemptedDiffs.map((d) => d.path);
  try {
    const idsJson = JSON.stringify({ id, handler, paths });
    if (usingPostgres()) {
      await query(
        `INSERT INTO proposition_audit (at, action, actor, row_count, ids_json)
         VALUES (NOW(), 'server-owned-write-ignored', $1, $2, $3)`,
        [actor, paths.length, idsJson]
      );
      return;
    }
    const { fileAppendAudit } = await import("./propositionRetention.js");
    await fileAppendAudit({
      action: "server-owned-write-ignored",
      actor,
      ids: [id],
      detail: { handler, paths },
    });
  } catch (e) {
    console.warn(`[primus/server-owned] audit failed: ${e?.message || e}`);
  }
}

function mergeIgnoredKeys(...lists) {
  return [...new Set(lists.flatMap((l) => (Array.isArray(l) ? l : [])))];
}

function validateIdeaTeamChange(incomingTeam, storedTeam) {
  const prev = preserveSubmitterDepartment(storedTeam);
  const nextRaw = preserveSubmitterDepartment(incomingTeam);
  if (!nextRaw || nextRaw === prev) return { ok: true, team: prev };
  if (isCanonicalTeam(nextRaw)) return { ok: true, team: nextRaw };
  if (teamIsLegacy(prev) && nextRaw === prev) return { ok: true, team: prev };
  return { ok: false, error: "Choose one of the listed teams." };
}

async function auditIdeaTeamChanged(id, user, { from, to }) {
  const actor = String(user?.email || user?.id || "unknown").trim();
  const idsJson = JSON.stringify({ id, from, to });
  if (usingPostgres()) {
    await query(
      `INSERT INTO proposition_audit (at, action, actor, row_count, ids_json)
       VALUES (NOW(), 'idea-team-changed', $1, 1, $2)`,
      [actor, idsJson]
    );
    return;
  }
  const { fileAppendAudit } = await import("./propositionRetention.js");
  await fileAppendAudit({ action: "idea-team-changed", actor, ids: [id], detail: { from, to } });
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

function autofillSkipReason(fieldKey, working, suggestions) {
  const findings = working?.researchFindings && typeof working.researchFindings === "object" ? working.researchFindings : {};
  const costErr =
    findings?.f2?.costEstimate?.error ||
    findings?.f2?.costEstimate?.researchFailed ||
    findings?.errors?.costEstimate ||
    "";
  if (fieldKey === "netMarginAtScale") {
    if (costErr) return `Cost estimate failed: ${String(costErr).slice(0, 160)}`;
    if (isBlankF2Value(suggestions?.f2?.netMarginAtScale) && isBlankF2Value(working?.f2?.netMarginAtScale)) {
      return "The AI had no figure, enter it manually";
    }
  }
  if (["cogsAtScale", "grammage", "qcomTrajectory", "gstRatePct"].includes(fieldKey)) {
    if (costErr) return `Cost estimate failed: ${String(costErr).slice(0, 160)}`;
    if (isBlankF2Value(suggestions?.f2?.[fieldKey === "gstRatePct" ? "gstRatePct" : fieldKey])) {
      return "The AI had no figure, enter it manually";
    }
  }
  if (fieldKey === "mrpInr") {
    const missing = [];
    if (isBlankF2Value(working?.f2?.cogsAtScale) && isBlankF2Value(suggestions?.f2?.cogsAtScale)) missing.push("COGS");
    if (isBlankF2Value(working?.f2?.netMarginAtScale) && isBlankF2Value(suggestions?.f2?.netMarginAtScale)) {
      missing.push("margin");
    }
    if (gstRateUnfilled(working?.f2?.gstRatePct) && gstRateUnfilled(suggestions?.f2?.gstRatePct)) missing.push("GST");
    if (missing.length) return `Needs ${missing.join(", ")} to compute MRP`;
  }
  if (fieldKey === "marginElasticity") {
    if (isMarginElasticityUnfilled(suggestions?.f3?.marginElasticity)) {
      return "The AI had no figure, enter it manually";
    }
  }
  if (fieldKey === "techShiftRisk") {
    if (isTechShiftRiskUnfilled(suggestions?.f4?.techShiftRisk)) {
      return "The AI had no figure, enter it manually";
    }
  }
  return "The AI had no figure, enter it manually";
}

function compactAutofillValue(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  // Objects (ranges, risk maps) stay out of findings — status/reason is enough to diagnose.
  return undefined;
}

function recordAutofillOutcome(statusMap, path, { status, reason = "", value = null, aiSuggested = null }) {
  const compactValue = compactAutofillValue(value);
  const compactSuggested = compactAutofillValue(aiSuggested);
  statusMap[path] = {
    status,
    reason: reason || undefined,
    at: new Date().toISOString(),
    ...(compactValue !== undefined ? { value: compactValue } : {}),
    ...(compactSuggested !== undefined ? { aiSuggested: compactSuggested } : {}),
  };
}

async function persistAutoFilledFields(id, working, suggestions, team = "") {
  const next = mergeWorkingProposition(working, {});
  const autofillStatus = {
    ...(next.autofillStatus && typeof next.autofillStatus === "object" ? next.autofillStatus : {}),
  };
  let changed = false;

  const tryFill = (path, isEmpty, suggested, apply) => {
    if (!isEmpty) {
      recordAutofillOutcome(autofillStatus, path, { status: "kept", reason: "Already filled" });
      return;
    }
    if (suggested == null || suggested === "" || (typeof suggested === "object" && !Object.keys(suggested).length)) {
      const fieldKey = path.includes(".") ? path.split(".").pop() : path;
      recordAutofillOutcome(autofillStatus, path, {
        status: "skipped",
        reason: autofillSkipReason(fieldKey, next, suggestions),
      });
      return;
    }
    apply(suggested);
    recordAutofillOutcome(autofillStatus, path, {
      status: "filled",
      value: suggested,
      aiSuggested: suggested,
    });
    changed = true;
  };

  // Part 138 E — GST and grammage are never AI-filled. Net margin gets the division minimum (below).
  const f2FromCache = suggestions?.f2 || {};
  // COGS / q-com notes from AI when empty.
  for (const key of ["cogsAtScale", "qcomTrajectory"]) {
    tryFill(`f2.${key}`, isBlankF2Value(next.f2?.[key]), f2FromCache[key], (v) => {
      next.f2 = {
        ...(next.f2 || {}),
        [key]: v,
        ...(key === "cogsAtScale"
          ? {
              cogsLowInr: f2FromCache.cogsLowInr ?? next.f2?.cogsLowInr,
              cogsHighInr: f2FromCache.cogsHighInr ?? next.f2?.cogsHighInr,
              cogsBasis: f2FromCache.cogsBasis || next.f2?.cogsBasis,
              cogsConfidenceNote: f2FromCache.cogsConfidenceNote || next.f2?.cogsConfidenceNote,
              cogsSources: f2FromCache.cogsSources || next.f2?.cogsSources,
            }
          : {}),
      };
    });
  }

  // Part 138 E5 — net margin starts at the division minimum; follows a division change until a person edits it.
  {
    const marginPath = NET_MARGIN_STATUS_PATH;
    const margin = applyDivisionMinimumMargin(next);
    if (margin.changed) {
      next.f2 = margin.f2;
      autofillStatus[marginPath] = divisionMinimumStatusEntry(margin.floor);
      changed = true;
    } else if (String(next.f2?.netMarginSource || "").toLowerCase() === "user") {
      if (autofillStatus[marginPath]?.source === "division-minimum") {
        autofillStatus[marginPath] = { status: "kept", source: "user", at: new Date().toISOString() };
      }
    } else if (
      String(next.f2?.netMarginSource || "").toLowerCase() === "division-minimum" &&
      autofillStatus[marginPath]?.source !== "division-minimum"
    ) {
      autofillStatus[marginPath] = divisionMinimumStatusEntry(margin.floor ?? next.f2?.netMarginAtScale);
    }
  }

  tryFill(
    "f3.marginElasticity",
    isMarginElasticityUnfilled(next.f3?.marginElasticity),
    (() => {
      const suggestedRange = suggestions?.f3?.marginElasticity;
      const minR = Number(suggestedRange?.minMrpInr);
      const maxR = Number(suggestedRange?.maxMrpInr);
      if ((Number.isFinite(minR) && minR > 0) || (Number.isFinite(maxR) && maxR > 0)) return suggestedRange;
      return null;
    })(),
    (v) => {
      next.f3 = { ...(next.f3 || {}), marginElasticity: v };
    }
  );

  tryFill(
    "f4.techShiftRisk",
    isTechShiftRiskUnfilled(next.f4?.techShiftRisk),
    (() => {
      const suggestedRisk = normalizeTechShiftRisk(suggestions?.f4?.techShiftRisk);
      return suggestedRisk?.dimensions ? suggestedRisk : null;
    })(),
    (v) => {
      next.f4 = { ...(next.f4 || {}), techShiftRisk: v };
    }
  );

  const f5FromSug = suggestions?.f5 && typeof suggestions.f5 === "object" ? suggestions.f5 : {};
  const f5FromFindings =
    next.researchFindings?.f5 && typeof next.researchFindings.f5 === "object"
      ? next.researchFindings.f5
      : {};
  for (const key of [
    "householdsReachedY3Mn",
    "trialRatePct",
    "repeatConversionPct",
    "purchaseFrequencyYr",
    "avgPackValueInr",
  ]) {
    const fromSug = f5FromSug[key];
    const fromFindings = f5FromFindings[key];
    const suggested = !isBlankF2Value(fromSug) ? fromSug : !isBlankF2Value(fromFindings) ? fromFindings : null;
    tryFill(`f5.${key}`, isBlankF2Value(next.f5?.[key]), suggested, (v) => {
      next.f5 = { ...(next.f5 || {}), [key]: v };
    });
  }

  // MRP is derived on every pass — store tax split for Filter 3 and downstream.
  if (next.f2 && typeof next.f2 === "object") {
    next.f2 = applyDerivedMrpToF2(next.f2);
  }
  const derivedMrp = next.f2?.mrpInr ?? computeDerivedMrp(
    next.f2?.cogsAtScale,
    next.f2?.netMarginAtScale,
    next.f2?.gstRatePct
  );
  if (derivedMrp != null && derivedMrp !== "") {
    recordAutofillOutcome(autofillStatus, "f2.mrpInr", {
      status: "filled",
      value: derivedMrp,
      aiSuggested: derivedMrp,
      reason: "Derived from COGS, margin and GST",
    });
    changed = true;
  } else if (isBlankF2Value(next.f2?.mrpInr)) {
    recordAutofillOutcome(autofillStatus, "f2.mrpInr", {
      status: "skipped",
      reason: autofillSkipReason("mrpInr", next, suggestions),
    });
  }

  const prevFindings =
    next.researchFindings && typeof next.researchFindings === "object" ? next.researchFindings : {};
  const prevStatus = prevFindings.autofillStatus || working?.autofillStatus || {};
  const meaningful = (map) => {
    const out = {};
    for (const [k, v] of Object.entries(map || {})) {
      if (!v || typeof v !== "object") continue;
      out[k] = {
        status: v.status,
        reason: v.reason || "",
        value: v.value,
        aiSuggested: v.aiSuggested,
        source: v.source || "",
      };
    }
    return out;
  };
  const statusChanged =
    JSON.stringify(meaningful(prevStatus)) !== JSON.stringify(meaningful(autofillStatus));
  if (statusChanged) {
    next.researchFindings = {
      ...prevFindings,
      autofillStatus,
      autofillReport: {
        at: new Date().toISOString(),
        fields: autofillStatus,
      },
    };
  }

  if (!changed && !statusChanged) return working;

  let saved = working;
  if (changed) {
    saved =
      (await updateProposition(id, omitEmptyFilterColumns(next), {
        handler: "auto-fill",
        writer: "server",
        team,
      })) || working;
  }
  if (statusChanged && next.researchFindings) {
    saved = (await markResearchRun(id, next.researchFindings)) || saved;
  }
  return saved;
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

async function fillF3MrpIfNeeded({ working, suggestions, provider, department, userEmail }) {
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
    const elasticity = await runWithLlm(
      provider || "claude",
      () =>
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
        }),
      { department, userEmail }
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

async function fillF4TechShiftIfNeeded({ working, suggestions, provider, department, userEmail }) {
  const current = working?.f4?.techShiftRisk;
  const fromCache = suggestions?.f4?.techShiftRisk;
  if (!isTechShiftRiskUnfilled(current) || !isTechShiftRiskUnfilled(fromCache)) {
    return suggestions;
  }
  try {
    const filter4 = await runWithLlm(
      provider || "claude",
      () =>
        runFilter4({
          ideaText: composeProductIdeaText({
            name: working.name || "",
            category: working.category || "",
            ideaDescription: working.ideaDescription || "",
          }),
        }),
      { department, userEmail }
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

async function applyDerivedAutoFill({ id, working, suggestions, provider, department, userEmail }) {
  let nextWorking = mergeWorkingProposition(working, {});
  if (!String(nextWorking.division || "").trim()) {
    try {
      const resolved = await runWithLlm(
        provider || "claude",
        () =>
          resolveDivisionSilently({
            ideaDescription: nextWorking.ideaDescription || "",
            category: nextWorking.category || "",
          }),
        { department, userEmail }
      );
      if (resolved.division) {
        const saved = await setPropositionDivision(id, resolved.division, resolved.divisionDetection);
        nextWorking = {
          ...(saved || nextWorking),
          ...nextWorking,
          division: resolved.division,
          researchFindings: saved?.researchFindings || nextWorking.researchFindings,
        };
      }
    } catch (e) {
      console.warn(`[primus/auto-fill] division resolve failed: ${e.message || e}`);
    }
  }
  let nextSuggestions = fillGstIfNeeded(nextWorking, suggestions);
  // Part 135 — F3 cliff research runs in the AI first pass, not as a safe-MRP band auto-fill.
  if (isTechShiftRiskUnfilled(nextWorking?.f4?.techShiftRisk)) {
    nextSuggestions = await fillF4TechShiftIfNeeded({
      working: nextWorking,
      suggestions: nextSuggestions,
      provider,
      department,
      userEmail,
    });
  }
  const persisted = await persistAutoFilledFields(id, nextWorking, nextSuggestions, department || "");
  await syncResearchCacheSuggestions(persisted || nextWorking, nextSuggestions);
  return { suggestions: nextSuggestions, proposition: persisted };
}

async function applyResearchFindings(id, findings, division, suggestions = null) {
  const current = await getPropositionById(id);
  if (!current) return null;
  if (!String(current.division || "").trim() && division) {
    await setPropositionDivision(id, division);
  }
  let enriched = enrichResearchFindingsSizingFactors(findings || null, suggestions);
  // Part 140 D — where an uploaded value came from (researchFindings.fieldSources) survives a research pass.
  const carried = current.researchFindings?.fieldSources;
  if (enriched && carried && enriched.fieldSources === undefined) enriched = { ...enriched, fieldSources: carried };
  return markResearchRun(id, enriched || null);
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
      if (!unlockedDepartmentOf(req.user) && !canApproveManagerRole(req.user?.role)) {
        sendJson(res, 401, { error: "Team session required.", departmentUnlockRequired: true });
        return;
      }
      const tableCount = await countPropositions();
      console.log(`[primus/propositions] total in table: ${tableCount}`);
      const rawList = await filterAccessibleIdeas(req.user, await listPropositions(limit));
      let propositions = rawList;
      try {
        const { hydrateReviewOnDoc } = await import("./managerReviewServer.js");
        propositions = await Promise.all(rawList.map((p) => hydrateReviewOnDoc(p)));
      } catch {
        propositions = rawList;
      }
      propositions = propositions.map((p) => annotateEvaluationOnListRow(p));
      sendJson(res, 200, { propositions, tableCount: propositions.length });
    } catch (e) {
      sendJson(res, e.status || 500, { error: readDbError(e, redactSecrets) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      requireUnlockedDepartment(req.user);
      if (authRequired() && !isCanonicalTeam(req.user?.team)) {
        sendJson(res, 403, { error: "Choose your team before opening the form.", needsTeam: true });
        return;
      }
      const probeDecision = probeTokenDecision(req);
      if (probeDecision === "reject") throw rejectProbeToken();
      const proposition = await createProposition({
        createdByUserId: req.user?.id || null,
        createdByEmail: req.user?.email || null,
        submitterName: String(req.user?.name || "").trim(),
        submitterDepartment: req.user?.team || "",
        probe: probeDecision === "ok",
      });
      sendJson(res, 201, await withAdvisory(proposition));
    } catch (e) {
      sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
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
      sendJson(res, 403, { error: "Only ADMIN or Master unlock can delete propositions." });
      return;
    }
    const count = await countPropositions();
    const body = await readJsonBody(req);
    const phrase = deleteAllConfirmPhrase(count);
    if (!deleteAllPhraseMatches(body.confirm, count)) {
      sendJson(res, 400, { error: `Type ${phrase} to delete every idea.`, expected: phrase });
      return;
    }
    console.log(`[primus/audit] delete-all by=Master rows=${count} at=${new Date().toISOString()}`);
    const deleted = await deleteAllPropositions(null, "Master");
    sendJson(res, 200, { deleted, department: null });
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
      sendJson(res, 403, { error: "Only ADMIN or Master unlock can delete propositions." });
      return;
    }
    const actor = unlockedDepartmentOf(req.user) || "Master";
    const ids = await deleteUntouchedDrafts(null, actor);
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
      const { hydrateReviewOnDoc } = await import("./managerReviewServer.js");
      const raw = await getPropositionById(id);
      if (!raw || !(await canAccessIdea(req.user, raw))) {
        sendJson(res, 404, { error: "Idea not found." });
        return;
      }
      const proposition = await hydrateReviewOnDoc(raw);
      const advisory = await withAdvisory(proposition);
      sendJson(res, 200, {
        ...advisory,
        suggestions: advisory.suggestions ?? (await cachedSuggestionsFor(proposition)),
        // Part 136 — never send live advisoryChecks on GET.
        advisoryChecks: undefined,
      });
    } catch (e) {
      sendJson(res, e.status || 500, { error: readDbError(e, redactSecrets) });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
      let payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
      const provider = normalizeProvider(body?.provider || payload?.provider || "claude");
      const forceResearch = Boolean(body?.forceResearch || payload?.forceResearch);
      const asNew = Boolean(body?.asNew);
      const opened = await getPropositionById(id);
      if (!opened || !(await canAccessIdea(req.user, opened))) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      // Part 140 A (D62) — server-owned keys are stripped, audited and reported; never a failure.
      const strippedSubmit = stripServerOwnedFields(payload, opened);
      // Part 141 C (D75) — typed f2 values own their markers (after strip, before the field payload is built).
      payload = withTypedF2Markers(strippedSubmit.cleaned, opened);
      let ignoredKeys = strippedSubmit.ignoredKeys;
      await auditServerOwnedWriteAttempt(id, req.user, strippedSubmit.attemptedDiffs, { handler: "submit" });
      if (payload?.submitterDepartment !== undefined) {
        const prevTeam = ideaTeamRaw(opened);
        const teamCheck = validateIdeaTeamChange(payload.submitterDepartment, prevTeam);
        if (!teamCheck.ok) {
          sendJson(res, 400, { error: teamCheck.error, field: "submitterDepartment" });
          return;
        }
        const nextTeam = teamCheck.team;
        if (nextTeam !== prevTeam) {
          await auditIdeaTeamChanged(id, req.user, { from: prevTeam, to: nextTeam });
          try {
            const { rerouteManagerReviewOnTeamChange } = await import("./managerReviewServer.js");
            await rerouteManagerReviewOnTeamChange({
              ideaId: id,
              user: req.user,
              fromTeam: prevTeam,
              toTeam: nextTeam,
              ideaName: opened.name || "",
            });
          } catch (e) {
            console.warn(`[primus/team] review re-route failed: ${e.message || e}`);
          }
        }
      }

      const forbidden = authRequired()
        ? await firstForbiddenField(req.user, opened, opened, payloadForOwnershipCheck(opened, payload))
        : null;
      if (forbidden) {
        const hint = isServerOwnedField(forbidden)
          ? "That value is set by research and cannot be typed in directly."
          : usuallyProvidedByHint(forbidden);
        sendJson(res, 403, {
          error: hint
            ? `You cannot change ${forbidden} (${hint}).`
            : `You cannot change ${forbidden}.`,
          field: forbidden,
        });
        return;
      }

      // Part 145 D105 — name and team are not boxes. A blank one is filled from the login
      // (name from the account, team from the profile); a typed team change still wins.
      payload = fillIdentityFromAccount(payload, opened, req.user);
      if (!hasSubmitterIdentity(payload)) {
        sendJson(res, 400, {
          error: "Your account has no team yet. Use Change next to your team to pick one, then Submit.",
          field: "submitterDepartment",
        });
        return;
      }

      // Part 138 A — required fields on Submit only. Draft saves (PATCH/POST) keep allowing blanks.
      const missingRequired = firstMissingRequiredField(payload, opened);
      if (missingRequired) {
        sendJson(res, 400, {
          error: `${missingRequired.label} is required before Submit.`,
          field: missingRequired.field,
        });
        return;
      }

      if (!opened.researchRunAt && !hasResearchMaterial(payload)) {
        sendJson(res, 400, {
          error: "Describe the idea, or attach a file, before the first Submit.",
          field: "ideaDescription",
        });
        return;
      }

      // Part 132 D13 — invalid inputs block Submit (no spend, no seal). Drafts never hit this path.
      const inputReview = reviewInputs(payload);
      if (INVALID_INPUTS_BLOCK_SUBMIT && inputReview.blocking) {
        sendJson(res, 422, {
          error: "Fix the invalid inputs before Submit. Nothing was spent and no verdict was sealed.",
          inputReview,
        });
        return;
      }

      // Prefer title-cased benchmark for research prompts; keep typed value on the form.
      if (payload.f1 && typeof payload.f1 === "object") {
        const corrected = researchDisplayValue("benchmark", payload.f1.benchmark, inputReview);
        if (corrected && corrected !== String(payload.f1.benchmark || "").trim()) {
          payload = {
            ...payload,
            f1: { ...payload.f1, benchmarkResearchName: corrected },
            _inputReview: inputReview,
          };
        } else {
          payload = { ...payload, _inputReview: inputReview };
        }
      } else {
        payload = { ...payload, _inputReview: inputReview };
      }

      const confirmMissingSteps = Boolean(body?.confirmMissingSteps || payload?.confirmMissingSteps);
      const previewPlan = planResearch(opened);
      const sameInputs = researchHashFor(payload) === researchHashFor(opened);
      if (
        previewPlan.researchState === "incomplete" &&
        sameInputs &&
        !forceResearch &&
        !asNew &&
        !confirmMissingSteps
      ) {
        sendJson(res, 200, {
          proposition: opened,
          researchRan: false,
          needsConfirm: true,
          suggestions: null,
          ignoredKeys,
        });
        return;
      }

      let targetId = id;
      let current = opened;
      let forkedFrom = null;
      if (asNew && shouldForkLogResubmit(opened, payload)) {
        const created = await createProposition({
          createdByUserId: req.user?.id || null,
          createdByEmail: req.user?.email || null,
          submitterName:
            String(req.user?.name || "").trim() ||
            String(opened.submitterName || "").trim(),
          submitterDepartment:
            req.user?.team ||
            opened.submitterDepartment ||
            unlockedDepartmentOf(req.user),
        });
        targetId = created.id;
        current = created;
        forkedFrom = opened.id;
      }

      const {
        goNoGo: _clientStoredResult,
        managerReview: _mr,
        managerApproval: _ma,
        finalSummary: _fs,
        id: _openedId,
        _inputReview: _ir,
        ...fieldPayload
      } = payload;
      // Keep typed benchmark on the form; research uses f1.benchmarkResearchName when set.
      const allowProbe = applyProbeFlag(req, payload, fieldPayload);
      if (fieldPayload.baseVersion == null && payload.version != null) fieldPayload.baseVersion = payload.version;
      fieldPayload.clearKeys = [...new Set([...(fieldPayload.clearKeys || []), ...blankClearsInPayload(payload)])];
      const proposition = await updateProposition(targetId, omitEmptyFilterColumns(fieldPayload), {
        handler: "submit",
        team: unlockedDepartmentOf(req.user) || "",
        allowProbe,
      });
      if (!proposition) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      ignoredKeys = mergeIgnoredKeys(ignoredKeys, proposition.ignoredKeys);
      delete proposition.ignoredKeys;
      openSubmissionCost(targetId);

      // Part 132 D14 — advisory AI notes only (never blocks; never changes score).
      let inputReviewAi = null;
      if (shouldRunInputReviewAi(inputReview)) {
        try {
          inputReviewAi = await runWithLlm(provider, () => runInputReviewAi(payload, { provider }), {
            department: unlockedDepartmentOf(req.user) || null,
            userEmail: req.user?.email || null,
          });
        } catch (e) {
          console.warn(`[primus/input-review] skipped: ${e?.message || e}`);
          inputReviewAi = { fields: [], cacheKey: inputReviewCacheKey(payload) };
        }
      }
      const storedInputReview = mergeInputReview(inputReview, inputReviewAi);

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
      let usedBundleHit = false;
      const inputHash = researchHashFor(payload);
      const priorHash = researchHashFor(current);
        const findingsMissCurrentAttributes = attributeFindingsAreStale(payload, current);
      const repairPlan = planResearch(current);
      const repairMissing =
        repairPlan.researchState === "incomplete" && !forceResearch && inputHash === priorHash;
      const workingForSteps = mergeWorkingProposition(current, { ...payload, id: targetId });
      const costNotNeeded = !shouldRunStep(workingForSteps, "cost", { forceFresh: false });

      function takeResearchBundleHit(cached) {
        return Boolean(
          cached &&
            !repairMissing &&
            (hasCachedCostEstimate(cached) ||
              (hasReplayableResearchCache(cached) && costNotNeeded))
        );
      }

      async function applyCachedResearchBundle(cached, billingDepartment) {
        usedBundleHit = true;
        console.log(
          `[primus/research-cache] proposition=${targetId} division=${cached.division || ""} providerUsed=${cached.providerUsed || ""}`
        );
        researchProvider = cached.providerUsed || provider;
        suggestions = suggestionsWithCachedCost(cached, cached.suggestions);
        notCovered = cached.notCovered;
        sources = cached.sources;
        let findings = cached.researchFindings;
        // Never force-fresh a no-competitor check on a bundle HIT — that would
        // re-roll the model and break identical-input scores.
        if (isClaimingNoCompetitor(payload.f1 || {}, findings?.f1 || {})) {
          await runWithLlm(
            researchProvider,
            async () => {
              findings = await attachNoCompetitorCheck(payload, findings, { forceFresh: false });
            },
            { department: billingDepartment, userEmail: req.user?.email }
          );
        }
        await applyResearchFindings(targetId, findings, cached.division, suggestions);
      }

      // forceResearch: explicit re-run (fallback retry). Hash mismatch: idea text changed.
      // Stale attribute rows: the form USP changed after the last pass (draft save).
      // An incomplete pass runs only the steps that have no result.
      const shouldRunResearch =
        hasResearchMaterial(payload) &&
        (!current.researchRunAt ||
          forceResearch ||
          inputHash !== priorHash ||
          findingsMissCurrentAttributes ||
          repairMissing);
      if (shouldRunResearch) {
        const billingDepartment = requireUnlockedDepartment(req.user);
        const cached = forceResearch ? null : await getResearchCache(inputHash);
        logResearchCacheLookup(inputHash, cached);
        const cachedCost = cachedCostEstimateFrom(cached);
        logCostEstimateCache(inputHash, cachedCost);
        if (takeResearchBundleHit(cached)) {
          await applyCachedResearchBundle(cached, billingDepartment);
        } else {
        console.log(`[primus/research-cache] miss detail proposition=${targetId} hash=${inputHash}`);
        // Race: a twin may have finished while we decided to miss. Re-read once.
        if (!forceResearch) {
          const raced = await getResearchCache(inputHash);
          if (takeResearchBundleHit(raced)) {
            logResearchCacheLookup(inputHash, raced);
            await applyCachedResearchBundle(raced, billingDepartment);
          }
        }
        if (!usedBundleHit) {
        const tried = [];
        let active = provider;
        let lastError = null;
        while (active && !tried.includes(active)) {
          tried.push(active);
          researchProvider = active;
          console.log(
            `[primus/propositions] research start id=${targetId} provider=${active} force=${forceResearch} hash=${inputHash} bill=${billingDepartment}`
          );
          try {
            await runWithLlm(
              active,
              async () => {
              let working = proposition;
              if (!String(working.division || "").trim()) {
                const resolved = await resolveDivisionSilently({
                  ideaDescription: payload.ideaDescription || "",
                  category: payload.category || working.category || "",
                });
                if (resolved.division) {
                  working =
                    (await setPropositionDivision(
                      targetId,
                      resolved.division,
                      resolved.divisionDetection
                    )) || working;
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
                proposition: {
                  ...working,
                  f1: {
                    ...(working.f1 || {}),
                    ...(payload.f1?.benchmarkResearchName
                      ? { benchmarkResearchName: payload.f1.benchmarkResearchName }
                      : {}),
                  },
                },
                division: working.division || "",
                inputHash,
                forceFresh: forceResearch,
                onlySteps: repairMissing ? repairPlan.internalSteps : undefined,
              });
              suggestions = research.suggestions;
              notCovered = research.notCovered;
              sources = research.sources;
              const findingsForStore = {
                ...(enrichResearchFindingsSizingFactors(
                  research.researchFindings || null,
                  research.suggestions
                ) || {}),
                inputReview: storedInputReview,
              };
              await applyResearchFindings(
                targetId,
                findingsForStore,
                working.division || research.division || "",
                research.suggestions
              );
              await saveResearchCache(inputHash, {
                researchFindings: findingsForStore || {},
                suggestions: research.suggestions,
                sources: research.sources,
                notCovered: research.notCovered,
                division: working.division || research.division || "",
                providerUsed: active,
              });
              // If a twin finished first, adopt that first-writer bundle so scores match.
              const afterSave = forceResearch ? null : await getResearchCache(inputHash);
              if (afterSave && hasReplayableResearchCache(afterSave) && !usedBundleHit) {
                const kept = JSON.stringify(afterSave.researchFindings || {});
                const ours = JSON.stringify(findingsForStore || {});
                if (kept !== ours) {
                  await applyCachedResearchBundle(afterSave, billingDepartment);
                  freshResearch = false;
                } else {
                  freshResearch = true;
                }
              } else {
                freshResearch = true;
              }
            },
              { department: billingDepartment, userEmail: req.user?.email }
            );
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
              `[primus/propositions] research failed id=${targetId} provider=${active}: ${researchError}`
            );
            break;
          }
        }
        if (lastError && !researchError) {
          researchError = redactSecrets(lastError.message || "Research pass failed.");
        }
        }
        }
      } else if (hasResearchMaterial(payload)) {
        const cached = await getResearchCache(inputHash);
        logResearchCacheLookup(inputHash, Boolean(cached || current.researchRunAt));
        if (cached?.suggestions || cached?.researchFindings) {
          suggestions = suggestions || suggestionsWithCachedCost(cached, cached.suggestions);
          const enrichedFindings = enrichResearchFindingsSizingFactors(
            current.researchFindings || cached.researchFindings,
            suggestions || cached.suggestions
          );
          if (enrichedFindings && enrichedFindings !== current.researchFindings) {
            await applyResearchFindings(
              targetId,
              enrichedFindings,
              cached.division || current.division || "",
              suggestions || cached.suggestions
            );
          }
        }
      }

      // Research blew up before findings were written — stamp failed steps so COGS/F3/F4
      // show "Research failed — retry" instead of empty Not-yet-run (which used to seal at 100%).
      if (researchError && shouldRunResearch && !usedBundleHit) {
        try {
          const priorDoc = await getPropositionById(targetId);
          const priorFindings =
            priorDoc?.researchFindings && typeof priorDoc.researchFindings === "object"
              ? priorDoc.researchFindings
              : {};
          const stamp = {
            researchFailed: true,
            failureReason: String(researchError || "research pass failed").slice(0, 240),
          };
          const failedFindings = {
            ...priorFindings,
            f1: { ...(priorFindings.f1 || {}), ...stamp },
            f2: { ...(priorFindings.f2 || {}), ...stamp },
            f3: { ...(priorFindings.f3 || {}), ...stamp },
            f4: { ...(priorFindings.f4 || {}), ...stamp },
            f5: { ...(priorFindings.f5 || {}), ...stamp },
            stepsFailed: [
              ...new Set([
                ...(Array.isArray(priorFindings.stepsFailed) ? priorFindings.stepsFailed : []),
                "F1",
                "F2",
                "F3",
                "F4",
                "F5",
              ]),
            ],
          };
          await applyResearchFindings(
            targetId,
            failedFindings,
            priorDoc?.division || proposition.division || "",
            suggestions
          );
        } catch (e) {
          console.warn(
            `[primus/propositions] could not stamp research failure id=${targetId}: ${e.message || e}`
          );
        }
      }

      const savedProposition = await getPropositionById(targetId);
      if (!suggestions) {
        suggestions = await cachedSuggestionsFor(savedProposition || proposition);
      }
      // Bundle HIT must not call LLM auto-fill (F3/F4 research) — that re-rolls scores.
      // Still persist suggestion numbers (F5, GST, …) onto the form.
      const skipDerivedAutoFill =
        usedBundleHit ||
        (Boolean(current.researchRunAt) && !forceResearch && inputHash === priorHash && !repairMissing);
      let derivedProposition = savedProposition || proposition;
      if (usedBundleHit) {
        const persisted = await persistAutoFilledFields(
          targetId,
          mergeWorkingProposition(savedProposition || proposition, { ...payload, id: targetId }),
          suggestions,
          unlockedDepartmentOf(req.user) || ""
        );
        derivedProposition = persisted || derivedProposition;
      } else if (!skipDerivedAutoFill) {
        const derived = await applyDerivedAutoFill({
          id: targetId,
          working: mergeWorkingProposition(savedProposition || proposition, { ...payload, id: targetId }),
          suggestions,
          provider,
          department: unlockedDepartmentOf(req.user),
          userEmail: req.user?.email,
        });
        suggestions = derived.suggestions;
        derivedProposition = derived.proposition || derivedProposition;
      }
      const advisory = await withAdvisory(derivedProposition, {
        attachGate: true,
        actor: unlockedDepartmentOf(req.user) || req.user?.email || "submit",
      });
      if (Object.prototype.hasOwnProperty.call(advisory.proposition || {}, "goNoGo")) {
        await updateProposition(
          targetId,
          { goNoGo: advisory.proposition.goNoGo },
          { handler: "submit-verdict" }
        );
        // Part 148 D120 — the first successful Submit stamps its date once; later Submits never move it.
        try {
          await markFirstSubmitted(targetId);
        } catch (e) {
          console.warn(`[primus/propositions] could not stamp first_submitted_at id=${targetId}: ${e.message || e}`);
        }
        try {
          const { closeOpenReviewsIfNotWatch } = await import("./managerReviewServer.js");
          if (advisory.proposition?.goNoGo?.classification) {
            await closeOpenReviewsIfNotWatch(advisory.proposition);
          }
        } catch {
          /* non-fatal */
        }
      }
      let outProposition = annotateEvaluationOnProposition({
        ...advisory.proposition,
        id: targetId,
      });
      if (shouldGenerateFinalSummary(current, outProposition)) {
        try {
          const summary = await runWithLlm(
            provider,
            () => generateFinalSummary(outProposition),
            { department: unlockedDepartmentOf(req.user), userEmail: req.user?.email }
          );
          const closed = await setPropositionFinalSummary(targetId, summary);
          if (closed) outProposition = closed;
        } catch (e) {
          console.error(`[primus/final-summary] proposition=${targetId} ${e.message}`);
        }
      }
      if (freshResearch) {
        logScoringTrace({
          propositionId: targetId,
          hash: inputHash,
          division: advisory.proposition?.division || savedProposition?.division,
          providerUsed: researchProvider,
          researchFindings: derivedProposition?.researchFindings,
          cache: "miss",
        });
      }
      closeSubmissionCost();
      sendJson(res, 200, {
        ...advisory,
        proposition: outProposition,
        suggestions,
        notCovered,
        sources,
        researchError,
        researchProvider,
        researchRan: Boolean(shouldRunResearch),
        forked: Boolean(forkedFrom),
        forkedFrom,
        suggestFallback,
        fallbackProviders,
        failedProvider,
        failedProviderLabel,
        ignoredKeys,
      });
    } catch (e) {
      closeSubmissionCost();
      sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
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
        sendJson(res, 403, { error: "Only ADMIN or Master unlock can delete propositions." });
        return;
      }
      const existing = await getPropositionById(id);
      if (!existing || !(await canAccessIdea(req.user, existing))) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      const actor = unlockedDepartmentOf(req.user) || "Master";
      const ok = await deleteProposition(id, actor);
      if (!ok) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, { ok: true, id });
    } catch (e) {
      const message =
        e?.code === "DELETE_FAILED" || /could not be deleted/i.test(String(e?.message || ""))
          ? "The idea could not be deleted. Please tell an admin."
          : redactSecrets(e.message);
      sendJson(res, 500, { error: message });
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const provider = normalizeProvider(body?.provider || payload?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
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
      const persisted = await persistAutoFilledFields(id, working, suggestions, unlockedDepartmentOf(req.user) || "");
      sendJson(res, 200, {
        ...(await withAdvisory(persisted || current)),
        suggestions,
      });
      return;
    }
    const derived = await applyDerivedAutoFill({
      id,
      working,
      suggestions,
      provider,
      department: requireUnlockedDepartment(req.user),
      userEmail: req.user?.email,
    });
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    const rawPayload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    // Part 140 A (D62) — server-owned keys are stripped, audited and reported; never a failure.
    const stripped = stripServerOwnedFields(rawPayload, current);
    // Part 141 C (D75) — typed f2 values own their markers (after strip, before update).
    const payload = withTypedF2Markers(stripped.cleaned, current);
    await auditServerOwnedWriteAttempt(id, req.user, stripped.attemptedDiffs, { handler: "draft" });
    if (payload?.submitterDepartment !== undefined) {
      const prevTeam = ideaTeamRaw(current);
      const teamCheck = validateIdeaTeamChange(payload.submitterDepartment, prevTeam);
      if (!teamCheck.ok) {
        sendJson(res, 400, { error: teamCheck.error, field: "submitterDepartment" });
        return;
      }
      const nextTeam = teamCheck.team;
      if (nextTeam !== prevTeam) {
        await auditIdeaTeamChanged(id, req.user, { from: prevTeam, to: nextTeam });
        try {
          const { rerouteManagerReviewOnTeamChange } = await import("./managerReviewServer.js");
          await rerouteManagerReviewOnTeamChange({
            ideaId: id,
            user: req.user,
            fromTeam: prevTeam,
            toTeam: nextTeam,
            ideaName: current.name || "",
          });
        } catch (e) {
          console.warn(`[primus/team] review re-route failed: ${e.message || e}`);
        }
      }
    }
    const forbidden = authRequired()
      ? await firstForbiddenField(req.user, current, current, payloadForOwnershipCheck(current, payload))
      : null;
    if (forbidden) {
      const hint = isServerOwnedField(forbidden)
        ? "That value is set by research and cannot be typed in directly."
        : usuallyProvidedByHint(forbidden);
      sendJson(res, 403, {
        error: hint ? `You cannot change ${forbidden} (${hint}).` : `You cannot change ${forbidden}.`,
        field: forbidden,
      });
      return;
    }
    const draft = omitEmptyFilterColumns(draftFieldPayload(payload));
    const allowProbe = applyProbeFlag(req, payload, draft);
    if (draft.baseVersion == null && payload.version != null) draft.baseVersion = payload.version;
    draft.clearKeys = [...new Set([...(payload.clearKeys || []), ...blankClearsInPayload(payload)])];
    const proposition = await updateProposition(id, draft, {
      bumpVersion: false,
      handler: "autosave",
      team: unlockedDepartmentOf(req.user) || "",
      allowProbe,
    });
    const ignoredKeys = mergeIgnoredKeys(stripped.ignoredKeys, proposition?.ignoredKeys);
    if (proposition) delete proposition.ignoredKeys;
    sendJson(res, 200, { proposition, draft: true, ignoredKeys });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    const attachment = body?.attachment && typeof body.attachment === "object" ? body.attachment : null;
    const provider = normalizeProvider(body?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const extracted = await runWithLlm(
      provider,
      () => extractConceptCardFields({ attachment, provider }),
      { department: requireUnlockedDepartment(req.user), userEmail: req.user?.email }
    );
    const suggestions = { top: {}, f1: {} };
    if (extracted.category) suggestions.top.category = extracted.category;
    if (extracted.ideaDescription) suggestions.top.ideaDescription = extracted.ideaDescription;
    if (extracted.declaredAttribute) suggestions.f1.declaredAttribute = extracted.declaredAttribute;
    if (extracted.benchmark) suggestions.f1.benchmark = extracted.benchmark;
    if (extracted.declaredGap != null) suggestions.f1.declaredGap = extracted.declaredGap;
    const conceptCardName = String(attachment?.name || "").trim();
    const proposition = await updateProposition(
      id,
      omitEmptyFilterColumns({
        ...current,
        f1: { ...(current.f1 || {}), conceptCardName },
      }),
      { bumpVersion: false, handler: "concept-card", writer: "server" }
    );
    // Part 138 B — suggestions were grounded in the document text; report what was dropped.
    const grounding = extracted?.grounding || { droppedCount: 0, droppedKeys: [], provenance: {} };
    sendJson(res, 200, {
      suggestions,
      extractedKeys: Object.keys(extracted),
      droppedCount: grounding.droppedCount,
      droppedKeys: grounding.droppedKeys,
      provenance: grounding.provenance,
      conceptCardName,
      proposition,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

const REFRESH_FIELDS = new Set([
  "cogsAtScale",
  "marginElasticity",
  "techShiftRisk",
]);

function applyRefreshedField(working, field, estimate, elasticity, risk) {
  if (field === "cogsAtScale" && estimate?.estimatedCogsPerUnitInr != null) {
    return {
      filterKey: "f2",
      fieldKey: "cogsAtScale",
      value: estimate.estimatedCogsPerUnitInr,
      extra: {
        cogsLowInr: estimate.estimatedCogsLowInr,
        cogsHighInr: estimate.estimatedCogsHighInr,
        cogsBasis: estimate.cogsBasis,
        cogsConfidenceNote: estimate.confidenceNote,
        cogsSources: estimate.sources,
      },
    };
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    const field = String(body?.field || "").trim();
    const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : {};
    const provider = normalizeProvider(body?.provider || "claude");
    if (!REFRESH_FIELDS.has(field)) {
      sendJson(res, 400, { error: "Unknown field to refresh." });
      return;
    }
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
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
    let f4Assessments = null;
    await runWithLlm(
      provider,
      async () => {
      if (field === "cogsAtScale") {
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
          forceFresh: true,
        });
      } else if (field === "techShiftRisk") {
        const filter4 = await runFilter4({ ideaText, category: working.category || "" });
        risk = normalizeTechShiftRisk(filter4?.techShiftRisk);
        f4Assessments = filter4?.assessments || null;
      }
    },
      { department: requireUnlockedDepartment(req.user), userEmail: req.user?.email }
    );

    const applied = applyRefreshedField(working, field, estimate, elasticity, risk);
    if (!applied) {
      sendJson(res, 422, { error: "Re-run returned no value for that field. Try again." });
      return;
    }
    // Part 138 F (D56) — the AI Filter 4 re-run stores a web-checked assessment per dimension
    // (searchUsed set in code from the request), so the refreshed ratings can earn their points.
    if (field === "techShiftRisk" && f4Assessments && Object.keys(f4Assessments).length) {
      const latest = (await getPropositionById(id)) || current;
      await updatePropositionResearchFindingsOnly(id, mergeF4Assessments(latest.researchFindings, f4Assessments));
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
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

const RETRY_STEP = { f1: "f1", f2: "cost", f3: "margin", f4: "f4", f5: "f5" };

export async function handlePropositionRetryStep(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const department = requireUnlockedDepartment(req.user);
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const filterKey = String(body.filter || "");
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    // Part 137 D45 — Evaluate / missing / retry: server picks steps from evaluationStatus
    // (missing + failed). planResearch remains for cost preview / ledger.
    const { evaluationStatus } = await import("./evaluationStatus.js");
    const { missingEvaluationInternalSteps } = await import("./inputCoverage.js");
    const evalStatus = evaluationStatus(current);
    const plan = planResearch(current);
    let onlySteps;
    if (body.missing || body.evaluate) {
      onlySteps = missingEvaluationInternalSteps(evalStatus);
      if (!onlySteps.length) onlySteps = plan.internalSteps;
    } else if (RETRY_STEP[filterKey]) {
      onlySteps = [RETRY_STEP[filterKey]];
    } else {
      onlySteps = [];
    }
    if (!onlySteps.length) {
      sendJson(res, 400, { error: body.missing || body.evaluate ? "No missing research steps." : "Unknown filter." });
      return;
    }
    const provider = normalizeProvider(body.provider || "claude");
    const inputHash = researchHashFor(current);
    let saved = null;
    await runWithLlm(
      provider,
      async () => {
        const research = await runPropositionResearch({
          ideaText: composeProductIdeaText({
            name: current.name || "",
            category: current.category || "",
            ideaDescription: current.ideaDescription || "",
          }),
          proposition: current,
          division: current.division || "",
          inputHash,
          onlySteps,
        });
        const findings = enrichResearchFindingsSizingFactors(
          research.researchFindings || null,
          research.suggestions
        );
        saved = await applyResearchFindings(id, findings, current.division || "", research.suggestions);
        await saveResearchCache(inputHash, {
          researchFindings: findings || {},
          suggestions: research.suggestions,
          sources: research.sources,
          notCovered: research.notCovered,
          division: current.division || "",
          providerUsed: provider,
        });
      },
      { department, userEmail: req.user?.email }
    );
    sendJson(res, 200, await withAdvisory(saved));
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

/** ADMIN: correct detected division (audited). Proposer cannot pick a lower-floor division. */
export async function handlePropositionCorrectDivision(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    if (String(req.user?.role || "").trim() !== "ADMIN") {
      sendJson(res, 403, { error: "Only ADMIN may correct division." });
      return;
    }
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const division = String(body.division || "").trim();
    if (!isLockedDivisionName(division)) {
      sendJson(res, 400, { error: "Division must be one of the locked table names." });
      return;
    }
    const respectiveDivision = String(body.respectiveDivision || "").trim() || null;
    if (division === "International Business") {
      if (!respectiveDivision || !isLockedDivisionName(respectiveDivision) || respectiveDivision === "International Business") {
        sendJson(res, 400, { error: "International Business needs a respective division from the other 10." });
        return;
      }
    }
    const previous = String(current.division || "").trim();
    const saved = await adminCorrectPropositionDivision(id, division, {
      respectiveDivision: division === "International Business" ? respectiveDivision : null,
      reason: body.reason || `ADMIN corrected division from ${previous || "(none)"} to ${division}.`,
      source: "admin",
      confidence: "high",
      needsConfirmation: false,
      divisionReviewRequested: false,
    });
    try {
      const { fileAppendAudit } = await import("./propositionRetention.js");
      await fileAppendAudit({
        action: "admin-correct-division",
        actor: req.user?.email || "ADMIN",
        ids: [id],
        detail: { previous, division, respectiveDivision },
      });
    } catch {
      /* audit best-effort */
    }
    console.log(
      `[primus/division] ADMIN correct id=${id} ${previous || "(none)"} → ${division} by ${req.user?.email || "?"}`
    );
    sendJson(res, 200, await withAdvisory(saved));
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

/** Anyone: report wrong division → admin Slack DM + queue flag. */
export async function handlePropositionRequestDivisionReview(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const suggestion = String(body.suggestion || "").trim().slice(0, 400);
    const detected = String(body.detected || current.division || "").trim() || null;
    const findings = {
      ...(current.researchFindings && typeof current.researchFindings === "object"
        ? current.researchFindings
        : {}),
      divisionDetection: {
        ...((current.researchFindings && current.researchFindings.divisionDetection) || {}),
        needsConfirmation: true,
        divisionReviewRequested: true,
        divisionReviewRequestedAt: new Date().toISOString(),
        divisionReviewRequestedBy: req.user?.email || null,
        divisionReviewSuggestion: suggestion || null,
        detectedAt: new Date().toISOString(),
      },
    };
    const saved = (await updatePropositionResearchFindingsOnly(id, findings)) || current;
    try {
      const { fileAppendAudit } = await import("./propositionRetention.js");
      await fileAppendAudit({
        action: "division-review-requested",
        actor: req.user?.email || "user",
        ids: [id],
        detail: { detected, suggestion },
      });
    } catch {
      /* best-effort */
    }
    try {
      const { listAdminEmails } = await import("./managerReviewServer.js");
      const { lookupSlackMemberByEmail, sendSlackLoginCodeDm } = await import("./slackAuth.js");
      const admins = await listAdminEmails();
      const text =
        `Division looks wrong on idea \`${id}\`.\n` +
        `Detected: ${detected || "(none)"}.\n` +
        (suggestion ? `Suggestion: ${suggestion}\n` : "") +
        `Requested by: ${req.user?.email || "?"}`;
      for (const email of admins.slice(0, 8)) {
        const lookup = await lookupSlackMemberByEmail(email);
        if (lookup?.member?.id) {
          await sendSlackLoginCodeDm(lookup.member.id, text);
        }
      }
    } catch (e) {
      console.warn(`[primus/division] admin Slack notify failed: ${e.message || e}`);
    }
    sendJson(res, 200, {
      ok: true,
      message: "Admin notified — only ADMIN can change the division.",
      proposition: saved,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

/** ADMIN: ideas marked needsConfirmation / division review requested. */
export async function handleDivisionConfirmationQueue(req, res, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only." });
    return;
  }
  try {
    if (String(req.user?.role || "").trim() !== "ADMIN") {
      sendJson(res, 403, { error: "ADMIN only." });
      return;
    }
    const items = await listDivisionConfirmationQueue(100);
    sendJson(res, 200, { items });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

/** Part 126: removed — net margin is proposer-typed; division minimum is a hint only. */
export async function handlePropositionResetMarginFloor(req, res, id, { sendJson, redactSecrets }) {
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
    sendJson(res, 410, {
      error: "Net margin is entered manually. The division minimum is shown as a hint under the field.",
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

