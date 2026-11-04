import { sendJson, readJsonBody, redactSecrets } from "./http.js";
import { isMasterUnlock } from "./departmentAuthConstants.js";
import { unlockedDepartmentOf } from "./propositionAccess.js";
import { listPropositionAudit, mapPropositionsReadOnly, readDbForensics, invalidateResearchCache, listPropositions } from "./db.js";
import { scoreReplayRecord } from "./replayScore.js";
import { runWithoutLlm } from "./replayGuard.js";
import { SCORING_RULESET_VERSION } from "./lockedConstants.js";
import { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } from "./propositionScoring.js";
import { scoreInputKey, storedScoreInputKey } from "./analysisStability.js";
import { effectiveRulesetVersion } from "./scoringRuleset.js";

function masterOnly(req, res) {
  if (!isMasterUnlock(unlockedDepartmentOf(req.user))) {
    sendJson(res, 403, { error: "Only Master can view this." });
    return false;
  }
  return true;
}

export async function handleDbForensics(req, res) {
  if (!masterOnly(req, res)) return;
  const report = await readDbForensics();
  sendJson(res, 200, report);
}

export async function handlePropositionAudit(req, res) {
  if (!masterOnly(req, res)) return;
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
  if (!masterOnly(req, res)) return;
  try {
    const body = (await readJsonBody(req)) || {};
    const result = await invalidateResearchCache(body.hash, "Master");
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
  if (!masterOnly(req, res)) return;
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

function requireAdminRole(req, res) {
  if (String(req.user?.role || "").trim() !== "ADMIN" && !isMasterUnlock(unlockedDepartmentOf(req.user))) {
    sendJson(res, 403, { error: "Only ADMIN can view scoring audit." });
    return false;
  }
  return true;
}

/**
 * Part 128 — recompute snapshots whose ruleset + fingerprint still match.
 * Expected answer is always zero mismatches.
 */
export async function handleScoringAudit(req, res) {
  if (!requireAdminRole(req, res)) return;
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
      const checks = await computeAllAdvisoryChecks(doc);
      const liveScore = scoreAdvisoryChecks(checks);
      const liveClass = computeGoNoGo(checks);
      preview.push({
        id: doc.id,
        name: doc.name || "",
        storedPct,
        storedClass: go.classification,
        livePct: liveScore.pct,
        liveClass,
        rulesetVersion: version,
        wouldChange: storedPct !== liveScore.pct || go.classification !== liveClass,
      });
      if (version === SCORING_RULESET_VERSION && key && key === liveKey) {
        if (storedPct !== liveScore.pct || go.classification !== liveClass) {
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
    }
  });
  sendJson(res, 200, {
    rulesetVersion: SCORING_RULESET_VERSION,
    mismatches,
    mismatchCount: mismatches.length,
    preview,
    previewCount: preview.length,
  });
}
