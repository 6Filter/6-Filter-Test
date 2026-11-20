import { sendJson, readJsonBody, redactSecrets } from "./http.js";
import {
  getPropositionById,
  listPropositionAudit,
  mapPropositionsReadOnly,
  readDbForensics,
  invalidateResearchCache,
  listPropositions,
  listResearchDiagDocs,
  updateProposition,
} from "./db.js";
import { summariseIncomplete } from "./researchIncompleteDiag.js";
import { scoreReplayRecord } from "./replayScore.js";
import { runWithoutLlm } from "./replayGuard.js";
import { RELEVANCE_SHADOW_MODE, SCORING_RULESET_VERSION } from "./lockedConstants.js";
import { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } from "./propositionScoring.js";
import { buildGateRationale } from "./goNoGo.js";
import { scoreInputKey, storedScoreInputKey } from "./analysisStability.js";
import { effectiveRulesetVersion, stampScreenedGoNoGo } from "./scoringRuleset.js";
import { checkLabelsFromAdvisory, compactAdvisoryForLog } from "./logStatus.js";
import { compareScoringModels } from "./scoringComparison.js";
import {
  deleteFinanceGstRate,
  financeGstStandardSlabs,
  listFinanceGstRates,
  upsertFinanceGstRate,
} from "./financeGstTable.js";

/** Part 129 — admin endpoints accept role ADMIN only (Master unlock grants no admin rights). */
function requireAdminRole(req, res, message = "Only ADMIN can do this.") {
  if (String(req.user?.role || "").trim() !== "ADMIN") {
    sendJson(res, 403, { error: message });
    return false;
  }
  return true;
}

export async function handleDbForensics(req, res) {
  if (!requireAdminRole(req, res)) return;
  const report = await readDbForensics();
  sendJson(res, 200, report);
}

/** ADMIN counts of unfinished research. No idea text, names, files or secrets. */
export async function handleResearchIncomplete(req, res) {
  if (!requireAdminRole(req, res, "Only ADMIN can read research diagnostics.")) return;
  const docs = await listResearchDiagDocs();
  sendJson(res, 200, {
    generatedAt: new Date().toISOString(),
    ...summariseIncomplete(docs),
  });
}

/** Part 134 — ADMIN Finance GST rate table (seeded empty). */
export async function handleFinanceGstRates(req, res) {
  if (!requireAdminRole(req, res, "Only ADMIN can manage the Finance GST table.")) return;
  try {
    if (req.method === "GET") {
      const rows = await listFinanceGstRates();
      sendJson(res, 200, { rows, standardSlabs: financeGstStandardSlabs() });
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = (await readJsonBody(req)) || {};
      const row = await upsertFinanceGstRate(body, req.user?.email || "ADMIN");
      sendJson(res, 200, { row });
      return;
    }
    if (req.method === "DELETE") {
      const body = (await readJsonBody(req)) || {};
      const ok = await deleteFinanceGstRate(body.id);
      if (!ok) {
        sendJson(res, 404, { error: "Rate row not found." });
        return;
      }
      sendJson(res, 200, { deleted: true });
      return;
    }
    sendJson(res, 405, { error: "GET, POST, PUT or DELETE only." });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message || String(e)) });
  }
}

export async function handlePropositionAudit(req, res) {
  if (!requireAdminRole(req, res)) return;
  const rows = await listPropositionAudit();
  sendJson(res, 200, {
    rows: rows.map((row) => ({
      at: row.at,
      action: row.action,
      actor: row.actor,
      rowCount: row.row_count,
      ids: typeof row.ids_json === "string" ? JSON.parse(row.ids_json) : row.ids_json,
    })),
  });
}

export async function handleInvalidateResearchCache(req, res) {
  if (!requireAdminRole(req, res)) return;
  try {
    const body = (await readJsonBody(req)) || {};
    const result = await invalidateResearchCache(body.hash, req.user?.email || "ADMIN");
    if (!result.deleted) {
      sendJson(res, 404, { error: "Cache row not found." });
      return;
    }
    sendJson(res, 200, { deleted: true });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

export async function handleAdminReplay(req, res) {
  if (!requireAdminRole(req, res)) return;
  const records = await runWithoutLlm(() =>
    mapPropositionsReadOnly(async (docs) => {
      const out = [];
      for (const doc of docs) out.push(await scoreReplayRecord(doc));
      out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return out;
    })
  );
  sendJson(res, 200, { propositions: records.length, records });
}

/** Recompute Filter 1–4 from STORED evidence only (no AI / no search). */
export async function recomputeFromStoredEvidence(doc) {
  const checks = await computeAllAdvisoryChecks(doc);
  const liveScore = scoreAdvisoryChecks(checks);
  const liveClass = computeGoNoGo(checks);
  const rationale = buildGateRationale({
    classification: liveClass,
    score: liveScore,
    checks,
    ideaName: doc?.name || "",
  });
  return { checks, liveScore, liveClass, rationale };
}

function buildRescoreSeal(doc, checks, liveScore, liveClass, rationale) {
  const stamped = stampScreenedGoNoGo(
    {
      classification: liveClass,
      score: liveScore,
      rationale,
      checkLabels: checkLabelsFromAdvisory(compactAdvisoryForLog(doc, checks)),
      at: new Date().toISOString(),
      allowRulesetRescore: true,
    },
    doc
  );
  return { ...stamped, allowRulesetRescore: true };
}

/**
 * Part 128/129 — preview mismatches + live recompute under current ruleset.
 */
export async function handleScoringAudit(req, res) {
  if (!requireAdminRole(req, res, "Only ADMIN can view scoring audit.")) return;
  const mismatches = [];
  const preview = [];
  await runWithoutLlm(async () => {
    const rows = await listPropositions(2000);
    for (const doc of rows) {
      const go = doc?.goNoGo;
      if (!go?.classification || !(Number(go?.score?.total) > 0)) continue;
      const storedPct = Number(go.score.pct);
      const version = effectiveRulesetVersion(go);
      const key = storedScoreInputKey(go);
      const liveKey = scoreInputKey(doc);
      const { checks, liveScore, liveClass } = await recomputeFromStoredEvidence(doc);
      const wouldChange = storedPct !== liveScore.pct || go.classification !== liveClass;
      const comparison = compareScoringModels(checks || {});
      preview.push({
        id: doc.id,
        name: doc.name || "",
        storedPct,
        storedClass: go.classification,
        livePct: liveScore.pct,
        liveClass,
        legacyPct: comparison.legacy?.pct,
        legacyClass: comparison.legacy?.verdict,
        relevancePct: comparison.relevance?.pct,
        relevanceClass: comparison.relevance?.verdict,
        moved: comparison.moved,
        weightEffectNote: comparison.weightEffectNote,
        rulesetVersion: version,
        scoreStatus:
          version !== SCORING_RULESET_VERSION
            ? "older-ruleset"
            : key && key !== liveKey
              ? "edited-since-screening"
              : "current",
        wouldChange,
      });
      if (version === SCORING_RULESET_VERSION && key && key === liveKey && wouldChange) {
        mismatches.push({
          id: doc.id,
          name: doc.name || "",
          storedPct,
          livePct: liveScore.pct,
          storedClass: go.classification,
          liveClass,
        });
      }
    }
  });
  sendJson(res, 200, {
    rulesetVersion: SCORING_RULESET_VERSION,
    shadowMode: RELEVANCE_SHADOW_MODE,
    mismatches,
    mismatchCount: mismatches.length,
    preview,
    previewCount: preview.length,
    weightEffectNote:
      "Filter 4 is 7/17 ≈ 41% at equal weights; five judged Filter 1 checks are 5/17 ≈ 29%.",
  });
}

/**
 * Part 129 — ADMIN no-cost re-score: re-seal from stored evidence (no AI).
 * Body: { ids?: string[], confirm: "RE-SCORE", force?: boolean }
 */
export async function handleScoringRescore(req, res) {
  if (!requireAdminRole(req, res, "Only ADMIN can re-score.")) return;
  try {
    const body = (await readJsonBody(req)) || {};
    const confirm = String(body.confirm || "").trim();
    if (confirm !== "RE-SCORE") {
      sendJson(res, 400, { error: 'Type RE-SCORE to confirm.' });
      return;
    }
    const actor = req.user?.email || "ADMIN";
    const results = [];
    await runWithoutLlm(async () => {
      let docs = await listPropositions(2000);
      const idSet = Array.isArray(body.ids) && body.ids.length
        ? new Set(body.ids.map(String))
        : null;
      if (idSet) docs = docs.filter((d) => idSet.has(String(d.id)));

      for (const doc of docs) {
        const go = doc?.goNoGo;
        if (!go?.classification || !(Number(go?.score?.total) > 0)) continue;
        const { checks, liveScore, liveClass, rationale } = await recomputeFromStoredEvidence(doc);
        const wouldChange =
          Number(go.score.pct) !== liveScore.pct || go.classification !== liveClass;
        if (!idSet && !wouldChange && body.force !== true) continue;

        const sealed = buildRescoreSeal(doc, checks, liveScore, liveClass, rationale);
        await updateProposition(
          doc.id,
          { goNoGo: sealed, classification: liveClass },
          { handler: "scoring-rescore", team: actor, writer: "server" }
        );
        results.push({
          id: doc.id,
          name: doc.name || "",
          oldPct: Number(go.score.pct),
          oldClass: go.classification,
          newPct: liveScore.pct,
          newClass: liveClass,
        });
      }
    });
    sendJson(res, 200, {
      rulesetVersion: SCORING_RULESET_VERSION,
      rescored: results.length,
      results,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message || String(e)) });
  }
}

/**
 * Part 129 — single-idea no-cost recompute from the output page (no AI).
 */
export async function handlePropositionRescore(req, res, propositionId) {
  if (!requireAdminRole(req, res, "Only ADMIN can recompute without AI.")) return;
  try {
    const id = String(propositionId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing idea id." });
      return;
    }
    const doc = await getPropositionById(id);
    if (!doc) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    const go = doc.goNoGo;
    if (!go?.classification || !(Number(go?.score?.total) > 0)) {
      sendJson(res, 400, { error: "Idea has no sealed score to recompute." });
      return;
    }
    const actor = req.user?.email || "user";
    const sealed = await runWithoutLlm(async () => {
      const { checks, liveScore, liveClass, rationale } = await recomputeFromStoredEvidence(doc);
      return buildRescoreSeal(doc, checks, liveScore, liveClass, rationale);
    });
    const saved = await updateProposition(
      id,
      { goNoGo: sealed, classification: sealed.classification },
      { handler: "scoring-rescore-one", team: actor, writer: "server" }
    );
    sendJson(res, 200, { proposition: saved || { ...doc, goNoGo: sealed }, goNoGo: sealed });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message || String(e)) });
  }
}
