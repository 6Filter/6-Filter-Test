/**
 * Per-dimension F4 mitigation judgment. Not a Filter 4 re-run and not a
 * research-cache write — original findings stay on the dimension; only
 * reassessedRisk / reassessedReason are filled after the judge returns.
 */
import { callLlm } from "../callLlm.js";
import { parseStrictJson } from "../llmJson.js";
import { computeAllAdvisoryChecks } from "../propositionScoring.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../goNoGo.js";
import { resolveHardLockedGoNoGo } from "../analysisStability.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "../ideaScale.js";
import { omitEmptyFilterColumns } from "../filterWriteGuard.js";
import { canEditIdeaInputs } from "../fieldOwnership.js";
import { normalizeProvider, runWithLlm } from "../llmContext.js";
import { getPropositionById, updateProposition, updatePropositionResearchFindingsOnly } from "../db.js";
import { canAccessIdea, unlockedDepartmentOf } from "../propositionAccess.js";
import { mergeProposition } from "../propositionFields.js";
import { composeProductIdeaText } from "../gstRate.js";
import { extractReturnedSourcesFromLlmResult, returnedSourceUrls } from "../returnedSources.js";
import { searchUsedFromRequest } from "../assessmentResult.js";
import { buildF4Assessment, failedF4Assessment, mergeF4Assessments } from "../f4Assessment.js";
import {
  DIMENSION_LABELS,
  TECH_SHIFT_DIMENSIONS,
  aggregateTechShiftRiskWithResponses,
  effectiveDimensionRisk,
  hasReassessedDimension,
  normalizeF4UserInputs,
  normalizeRiskLevel,
  normalizeTechShiftRisk,
} from "../techShiftRisk.js";

const RANK = { Low: 0, Medium: 1, High: 2 };
const RANK_LABEL = ["Low", "Medium", "High"];

const EVIDENCE_HINT =
  /\b(signed|contract|certif(?:icate|ication)|lab (?:test|report)|supplier|capacity|Q[1-4]\s*20\d{2}|effective\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4])|\b20\d{2}\b)/i;

const VAGUE_CLAIM =
  /we(?:['’]ll| will) (?:handle|address|solve|fix|manage|look into)|not a concern|we(?:['’]ve| have) solved|we plan to be compliant|will be addressed|we(?:['’]ve| have) got this|typing .we.ve solved/i;

export function looksVagueMitigation(text) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return true;
  if (EVIDENCE_HINT.test(s)) return false;
  if (s.length < 48) return true;
  return VAGUE_CLAIM.test(s);
}

export function clampReassessedRisk(originalRisk, proposedRisk, { verified = true, vague = false } = {}) {
  const orig = RANK[normalizeRiskLevel(originalRisk)];
  const origLabel = RANK_LABEL[orig] || normalizeRiskLevel(originalRisk) || "Medium";
  if (vague || orig == null) return origLabel;
  let next = RANK[normalizeRiskLevel(proposedRisk)];
  if (next == null) return origLabel;
  if (next > orig) next = orig;
  if (!verified) {
    next = Math.max(next, orig - 1, 1);
  }
  return RANK_LABEL[next];
}

function inferredUnverified(parsed, reason) {
  if (parsed?.verified === false || parsed?.verified === "false") return true;
  if (parsed?.verified === true || parsed?.verified === "true") return false;
  return /asserted-not-verified|cannot verify|could not verify|unverified claim/i.test(String(reason || ""));
}

export async function callLlmForJudgment(prompt, { temperature = 0 } = {}) {
  const { text } = await callLlm({
    userText: prompt,
    system:
      "You judge whether a proposer's written mitigation actually changes a structural-risk rating. Do not accept a response because it exists. Return ONLY minified JSON.",
    useWebSearch: true,
    temperature: temperature ?? 0,
    maxTokens: 800,
  });
  return text;
}

function judgmentPrompt({ dimensionKey, originalFinding, userResponse, personView = "" }) {
  const label = DIMENSION_LABELS[dimensionKey] || dimensionKey;
  const risk = originalFinding?.risk || "";
  const reason = String(originalFinding?.reason || "").replace(/\s+/g, " ").trim();
  const view = String(personView || "").replace(/\s+/g, " ").trim().replace(/"/g, "'");
  const viewLine = view ? `\nThe proposer's own view of this dimension (context only, not evidence): "${view}"\n` : "";
  return `Original finding for ${label}: risk=${risk},
reason="${reason}"
${viewLine}
The proposer has written this response, claiming it addresses the risk:
"${String(userResponse || "").replace(/"/g, "'")}"

Judge this response on its merits — do not accept it because it exists. A
specific, verifiable claim (a named supplier contract, a completed lab test, a
certification already obtained, a concrete date) can genuinely lower the risk
rating. A vague claim ("we will address this," "not a concern for us," "we plan
to be compliant") should not move the rating at all — restate the original
finding and explain why the response doesn't change it. If the response contains
a specific claim you cannot verify via search, treat it as asserted-not-verified —
it can move the rating one level at most (e.g. High to Medium), never to Low,
since an unverified claim is weaker evidence than the original research finding.

Return ONLY minified JSON:
{"reassessedRisk":"Low|Medium|High","reassessedReason":"one sentence explaining whether and why the response changed the rating","verified":true|false}`;
}

export async function reassessTechShiftDimension({
  dimensionKey,
  originalFinding,
  userResponse,
  personView = "",
  callJudgment = null,
} = {}) {
  const originalRisk = normalizeRiskLevel(originalFinding?.risk) || "Medium";
  const originalReason = String(originalFinding?.reason || "").replace(/\s+/g, " ").trim();
  const response = String(userResponse || "").trim();
  if (!response) {
    return {
      reassessedRisk: null,
      reassessedReason: null,
      skipped: "empty",
    };
  }
  if (looksVagueMitigation(response)) {
    return {
      reassessedRisk: originalRisk,
      reassessedReason: `Response is too vague to move the ${originalRisk} rating — ${originalReason || "original finding stands"}`,
      skipped: "vague",
    };
  }

  const run = callJudgment || callLlmForJudgment;
  const raw = await run(
    judgmentPrompt({ dimensionKey, originalFinding, userResponse: response, personView }),
    { temperature: 0 }
  );
  const parsed = parseStrictJson(raw, { label: "f4-reassess" });
  const proposed = normalizeRiskLevel(parsed?.reassessedRisk) || originalRisk;
  const reason = String(parsed?.reassessedReason || "").replace(/\s+/g, " ").trim();
  const verified = !inferredUnverified(parsed, reason);
  const reassessedRisk = clampReassessedRisk(originalRisk, proposed, { verified, vague: false });
  const reassessedReason =
    reason ||
    (reassessedRisk === originalRisk
      ? `Response did not change the original ${originalRisk} finding`
      : `${originalRisk} moved to ${reassessedRisk} after the response`);
  return { reassessedRisk, reassessedReason, verified };
}

export async function reassessF4WithResponses({
  techShiftRisk,
  callJudgment = null,
  dimensionKeys = null,
  userInputs = null,
} = {}) {
  const views = normalizeF4UserInputs(userInputs);
  const risk = normalizeTechShiftRisk(techShiftRisk, { aiSourced: techShiftRisk?.aiSourced !== false });
  if (!risk?.dimensions) return null;
  const wanted = Array.isArray(dimensionKeys) && dimensionKeys.length
    ? dimensionKeys
    : TECH_SHIFT_DIMENSIONS;
  const dimensions = { ...risk.dimensions };
  for (const key of wanted) {
    const cell = dimensions[key];
    if (!cell) continue;
    const originalRisk = normalizeRiskLevel(cell.risk);
    if (originalRisk !== "Medium" && originalRisk !== "High") continue;
    if (!String(cell.userResponse || "").trim()) continue;
    const judged = await reassessTechShiftDimension({
      dimensionKey: key,
      originalFinding: { risk: cell.risk, reason: cell.reason },
      userResponse: cell.userResponse,
      personView: views[key]?.pov || "",
      callJudgment,
    });
    if (!judged?.reassessedRisk) continue;
    dimensions[key] = {
      ...cell,
      risk: cell.risk,
      reason: cell.reason,
      userResponse: cell.userResponse,
      reassessedRisk: judged.reassessedRisk,
      reassessedReason: judged.reassessedReason,
    };
  }
  return {
    ...risk,
    dimensions,
    overallRisk: hasReassessedDimension(dimensions)
      ? aggregateTechShiftRiskWithResponses(dimensions)
      : risk.overallRisk,
  };
}

function advisoryBundle(proposition) {
  return computeAllAdvisoryChecks(proposition).then((advisoryChecks) => {
    const prev = proposition?.goNoGo && typeof proposition.goNoGo === "object" ? proposition.goNoGo : null;
    if (!prev?.classification) return { proposition, advisoryChecks };
    let goNoGo = resolveHardLockedGoNoGo({
      doc: proposition,
      prev,
      advisoryChecks,
      computeClassification: computeGoNoGo,
      computeScore: scoreAdvisoryChecks,
      extras: {
        ideaScale: ideaScaleFromDoc(proposition),
        ideaName: formIdeaLabel(proposition),
        category: formCategoryLabel(proposition),
      },
    });
    if (goNoGo?.classification === "INCOMPLETE" && goNoGo.ideaScale != null) {
      const { ideaScale: _omit, ...rest } = goNoGo;
      goNoGo = rest;
    }
    return {
      proposition: { ...proposition, goNoGo },
      advisoryChecks,
    };
  });
}

function overlayMitigationResponses(risk, responses) {
  const base = normalizeTechShiftRisk(risk, { aiSourced: risk?.aiSourced !== false }) || risk;
  if (!base?.dimensions || !responses || typeof responses !== "object") return base;
  const dimensions = { ...base.dimensions };
  for (const [key, text] of Object.entries(responses)) {
    if (!dimensions[key] || !String(text || "").trim()) continue;
    dimensions[key] = { ...dimensions[key], userResponse: String(text).trim() };
  }
  return { ...base, dimensions };
}

export async function handlePropositionReassessF4(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const provider = normalizeProvider(body?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    if (req.user && !canEditIdeaInputs(req.user, current)) {
      sendJson(res, 403, { error: "You cannot change Filter 4 responses on this idea." });
      return;
    }

    const incomingRisk =
      body?.techShiftRisk ||
      body?.f4?.techShiftRisk ||
      body?.proposition?.f4?.techShiftRisk ||
      current.f4?.techShiftRisk;
    const responses =
      body?.f4MitigationResponses ||
      body?.f4?.f4MitigationResponses ||
      body?.proposition?.f4?.f4MitigationResponses ||
      current.f4?.f4MitigationResponses ||
      {};
    const riskForJudgment = overlayMitigationResponses(incomingRisk, responses);
    const merged = mergeProposition({
      ...current,
      f4: { ...(current.f4 || {}), techShiftRisk: riskForJudgment, f4MitigationResponses: responses },
    });

    const judged = await runWithLlm(
      provider,
      () =>
        reassessF4WithResponses({
          techShiftRisk: merged.f4?.techShiftRisk,
          dimensionKeys: Array.isArray(body?.dimensionKeys) ? body.dimensionKeys : null,
          // Part 140 C — the person's view is context for the judge; it is never written back here.
          userInputs: body?.userInputs || body?.f4?.userInputs || current.f4?.userInputs || null,
        }),
      {
        department: unlockedDepartmentOf(req.user),
        userEmail: req.user?.email,
      }
    );
    if (!judged?.dimensions) {
      sendJson(res, 400, { error: "Filter 4 has no dimensions to re-assess yet." });
      return;
    }

    const nextDoc = {
      ...merged,
      f4: { ...(merged.f4 || {}), techShiftRisk: judged, f4MitigationResponses: responses },
    };
    let saved = await updateProposition(id, omitEmptyFilterColumns(nextDoc), {
      handler: "reassess-f4",
      writer: "server",
      team: unlockedDepartmentOf(req.user) || "",
    });
    const bundle = await advisoryBundle(saved || nextDoc);
    if (bundle.proposition?.goNoGo) {
      saved = await updateProposition(id, { goNoGo: bundle.proposition.goNoGo }, { handler: "reassess-f4-verdict" });
    }
    sendJson(res, 200, {
      proposition: saved || bundle.proposition,
      advisoryChecks: bundle.advisoryChecks,
      researchRan: false,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

/* ------------------------------------------------------------------ */
/* Part 138 F (D56) — web-check a hand-entered Filter 4 rating          */
/* ------------------------------------------------------------------ */

const VERIFY_SYSTEM =
  "You web-check ONE structural-obsolescence risk rating that a person typed for an FMCG product idea. " +
  "Use web search. Do not accept the rating because a person wrote it. " +
  "supported=true only if public evidence backs this exact Low/Medium/High rating; " +
  "supported=false if the evidence contradicts it (the real exposure is clearly higher or lower). " +
  "Never invent a source_url that your own web search did not return. " +
  'Return ONLY minified JSON: {"supported":true|false,"source_url":"https://...","quote":"short exact quote"}';

function verifyPrompt({ dimensionKey, rating, reason, ideaText }) {
  const label = DIMENSION_LABELS[dimensionKey] || dimensionKey;
  return `PRODUCT IDEA:
${String(ideaText || "").slice(0, 1600)}

DIMENSION: ${label}
RATING THE PERSON TYPED: ${rating} risk
THEIR REASON: "${String(reason || "").replace(/\s+/g, " ").trim().replace(/"/g, "'")}"

Is this rating supported by web evidence?`;
}

export async function callWebCheckLlm({ system, userText, provider = "claude" }) {
  return callLlm({
    provider,
    system,
    userText,
    useWebSearch: true,
    maxTokens: 900,
    temperature: 0,
    tier: "heavy",
    label: "f4-verify",
  });
}

/**
 * Web-check one dimension rating. Always resolves to the same assessment shape
 * { status, searchUsed, raw: { rating, supported, source_url, quote }, returnedSources }.
 * - searchUsed is set by CODE from this request (never from the model).
 * - failure (error, empty, unreadable, no boolean verdict, "supported" with no returned source) → status:"failed".
 * @param {{ dimensionKey: string, rating: string, reason?: string, ideaText?: string, provider?: string,
 *           callWebCheck?: Function|null }} args
 */
export async function verifyF4Dimension({
  dimensionKey,
  rating,
  reason = "",
  ideaText = "",
  provider = "claude",
  callWebCheck = null,
} = {}) {
  const webSearchEnabled = true;
  const level = normalizeRiskLevel(rating);
  if (!TECH_SHIFT_DIMENSIONS.includes(dimensionKey) || !level) {
    return failedF4Assessment("Pick a Low, Medium or High rating to web-check", { webSearchEnabled: false });
  }
  const run = callWebCheck || callWebCheckLlm;
  let result;
  try {
    result = await run({
      system: VERIFY_SYSTEM,
      userText: verifyPrompt({ dimensionKey, rating: level, reason, ideaText }),
      provider,
      useWebSearch: webSearchEnabled,
    });
  } catch (e) {
    return failedF4Assessment(e?.message || "The AI did not answer", { webSearchEnabled });
  }
  const searchesUsed = Number(result?.webSearchRequests) || 0;
  const returnedSources = extractReturnedSourcesFromLlmResult(result);
  const urls = returnedSourceUrls(returnedSources);
  const flags = { webSearchEnabled, searchesUsed, returnedSources: urls };
  const text = String(result?.text || result?.content || "").trim();
  if (!text) return failedF4Assessment("The AI did not answer", flags);
  let parsed;
  try {
    parsed = parseStrictJson(text, { label: "f4-verify" });
  } catch {
    return failedF4Assessment("The AI's answer could not be read", flags);
  }
  if (typeof parsed?.supported !== "boolean") {
    return failedF4Assessment("The AI's answer could not be read", flags);
  }
  const cited = String(parsed.source_url || "").trim();
  const sourceOk = cited && urls.includes(cited);
  // A "supported" verdict must be backed by a source the search really returned.
  if (parsed.supported === true && !sourceOk) {
    return failedF4Assessment("The web check returned no source for this rating", flags);
  }
  return buildF4Assessment({
    rating: level,
    supported: parsed.supported === true,
    source_url: sourceOk ? cited : "",
    quote: parsed.quote,
    returnedSources: urls,
    webSearchEnabled,
    searchesUsed,
  });
}

/**
 * Verify the rating of each requested dimension (default: every rated dimension whose rating
 * is not already web-checked as supported/contradicted for that same rating).
 * @returns {Promise<Record<string, object>>} assessments by dimension key
 */
export async function verifyF4Dimensions({
  techShiftRisk,
  dimensionKeys = null,
  ideaText = "",
  provider = "claude",
  callWebCheck = null,
} = {}) {
  const dims = techShiftRisk?.dimensions && typeof techShiftRisk.dimensions === "object" ? techShiftRisk.dimensions : {};
  const wanted = Array.isArray(dimensionKeys) && dimensionKeys.length ? dimensionKeys : TECH_SHIFT_DIMENSIONS;
  const out = {};
  for (const key of wanted) {
    if (!TECH_SHIFT_DIMENSIONS.includes(key)) continue;
    const cell = dims[key];
    const rating = normalizeRiskLevel(cell?.risk);
    if (!rating) continue;
    out[key] = await verifyF4Dimension({
      dimensionKey: key,
      rating,
      reason: cell?.reason,
      ideaText,
      provider,
      callWebCheck,
    });
  }
  return out;
}

export async function handlePropositionVerifyF4(req, res, id, { readBody, sendJson, redactSecrets, callWebCheck = null }) {
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
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const provider = normalizeProvider(body?.provider || "claude");
    const current = await getPropositionById(id);
    if (!current || !(await canAccessIdea(req.user, current))) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    if (req.user && !canEditIdeaInputs(req.user, current)) {
      sendJson(res, 403, { error: "You cannot change Filter 4 ratings on this idea." });
      return;
    }
    const keys = [
      ...(body?.dimensionKey ? [body.dimensionKey] : []),
      ...(Array.isArray(body?.dimensionKeys) ? body.dimensionKeys : []),
    ].filter((k) => TECH_SHIFT_DIMENSIONS.includes(k));
    if (!keys.length) {
      sendJson(res, 400, { error: "Name the Filter 4 dimension to verify." });
      return;
    }
    const base = current.f4?.techShiftRisk;
    const incomingDims = body?.techShiftRisk?.dimensions || body?.f4?.techShiftRisk?.dimensions || {};
    // Part 140 C (D63) — the person's own rating and view live in f4.userInputs. They are the
    // rating that gets web-checked and their view is sent as context. They are read here and
    // NEVER written back: research cannot overwrite what a person said.
    const userInputs = normalizeF4UserInputs(body?.userInputs || body?.f4?.userInputs || current.f4?.userInputs);
    // Only the dimensions the person named are verified; their typed rating is what gets checked.
    const toPersist = {
      dimensions: Object.fromEntries(
        keys.map((k) => [k, { ...(base?.dimensions?.[k] || {}), ...(incomingDims[k] || {}) }])
      ),
    };
    const toCheck = {
      dimensions: Object.fromEntries(
        keys.map((k) => {
          const cell = toPersist.dimensions[k];
          const mine = userInputs[k];
          if (mine?.rating && !incomingDims[k]) {
            return [k, { ...cell, risk: mine.rating, reason: String(mine.pov || "").trim() || cell.reason }];
          }
          return [k, cell];
        })
      ),
    };
    const legacyTypedRating = keys.some((k) => incomingDims[k]);
    const ideaText = composeProductIdeaText({
      name: current.name,
      category: current.category,
      ideaDescription: current.ideaDescription,
    });
    const assessments = await runWithLlm(
      provider,
      () =>
        verifyF4Dimensions({
          techShiftRisk: toCheck,
          dimensionKeys: keys,
          ideaText,
          provider,
          callWebCheck,
        }),
      { department: unlockedDepartmentOf(req.user), userEmail: req.user?.email }
    );
    if (!Object.keys(assessments).length) {
      sendJson(res, 400, { error: "Pick a Low, Medium or High rating first." });
      return;
    }

    // Persist the typed ratings together with their assessments so the two never disagree.
    // (Only the older "typed rating inside techShiftRisk" request shape writes ratings back;
    // the userInputs shape leaves techShiftRisk exactly as research stored it.)
    const mergedDims = { ...(base?.dimensions || {}) };
    for (const k of keys) {
      if (legacyTypedRating && toPersist.dimensions[k]) {
        mergedDims[k] = { ...(mergedDims[k] || {}), ...toPersist.dimensions[k] };
      }
    }
    const nextRisk = legacyTypedRating
      ? normalizeTechShiftRisk({ ...(base || {}), dimensions: mergedDims }, { aiSourced: false })
      : null;
    const nextDoc = {
      f4: { ...(current.f4 || {}), ...(nextRisk ? { techShiftRisk: nextRisk } : {}) },
    };
    let saved = legacyTypedRating
      ? await updateProposition(id, omitEmptyFilterColumns(nextDoc), {
          handler: "verify-f4",
          writer: "server",
          team: unlockedDepartmentOf(req.user) || "",
        })
      : current;
    // researchFindings is not a form column — store the assessments with the findings-only writer,
    // merged into the latest stored findings so nothing else is lost.
    const latest = (await getPropositionById(id)) || saved || current;
    saved =
      (await updatePropositionResearchFindingsOnly(id, mergeF4Assessments(latest.researchFindings, assessments))) ||
      saved;
    const bundle = await advisoryBundle(saved || { ...current, ...nextDoc });
    if (bundle.proposition?.goNoGo) {
      saved = await updateProposition(id, { goNoGo: bundle.proposition.goNoGo }, { handler: "verify-f4-verdict" });
    }
    sendJson(res, 200, {
      proposition: saved || bundle.proposition,
      advisoryChecks: bundle.advisoryChecks,
      assessments,
      researchRan: true,
    });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export { effectiveDimensionRisk, mergeF4Assessments };
