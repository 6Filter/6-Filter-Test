/**
 * Per-dimension F4 mitigation judgment. Not a Filter 4 re-run and not a
 * research-cache write — original findings stay on the dimension; only
 * reassessedRisk / reassessedReason are filled after the judge returns.
 */
import { callLlm } from "../callLlm.js";
import { parseStrictJson } from "../llmJson.js";
import { computeAllAdvisoryChecks } from "../propositionScoring.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../goNoGo.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "../ideaScale.js";
import { omitEmptyFilterColumns } from "../filterWriteGuard.js";
import { canWriteField } from "../fieldOwnership.js";
import { normalizeProvider, runWithLlm } from "../llmContext.js";
import { getPropositionById, updateProposition } from "../db.js";
import { mergeProposition } from "../propositionFields.js";
import {
  DIMENSION_LABELS,
  TECH_SHIFT_DIMENSIONS,
  aggregateTechShiftRiskWithResponses,
  effectiveDimensionRisk,
  hasReassessedDimension,
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

function judgmentPrompt({ dimensionKey, originalFinding, userResponse }) {
  const label = DIMENSION_LABELS[dimensionKey] || dimensionKey;
  const risk = originalFinding?.risk || "";
  const reason = String(originalFinding?.reason || "").replace(/\s+/g, " ").trim();
  return `Original finding for ${label}: risk=${risk},
reason="${reason}"

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
    judgmentPrompt({ dimensionKey, originalFinding, userResponse: response }),
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
} = {}) {
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
        },
      },
      advisoryChecks,
    };
  });
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
    if (!current) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const role = req.user?.role || "";
    if (role && !canWriteField(role, "techShiftRisk")) {
      sendJson(res, 403, { error: "You cannot change Filter 4 responses (owned by CMI / R&D)." });
      return;
    }

    const incomingRisk =
      body?.techShiftRisk ||
      body?.f4?.techShiftRisk ||
      body?.proposition?.f4?.techShiftRisk ||
      current.f4?.techShiftRisk;
    const merged = mergeProposition({
      ...current,
      f4: { ...(current.f4 || {}), techShiftRisk: incomingRisk },
    });

    const judged = await runWithLlm(provider, () =>
      reassessF4WithResponses({
        techShiftRisk: merged.f4?.techShiftRisk,
        dimensionKeys: Array.isArray(body?.dimensionKeys) ? body.dimensionKeys : null,
      })
    );
    if (!judged?.dimensions) {
      sendJson(res, 400, { error: "Filter 4 has no dimensions to re-assess yet." });
      return;
    }

    const nextDoc = {
      ...merged,
      f4: { ...(merged.f4 || {}), techShiftRisk: judged },
    };
    let saved = await updateProposition(id, omitEmptyFilterColumns(nextDoc), { handler: "reassess-f4" });
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

export { effectiveDimensionRisk };
