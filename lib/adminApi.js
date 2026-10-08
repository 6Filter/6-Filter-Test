import { sendJson, readJsonBody, redactSecrets } from "./http.js";
import { isMasterUnlock } from "./departmentAuthConstants.js";
import { unlockedDepartmentOf } from "./propositionAccess.js";
import { listPropositionAudit, mapPropositionsReadOnly, readDbForensics, invalidateResearchCache } from "./db.js";
import { scoreReplayRecord } from "./replayScore.js";
import { runWithoutLlm } from "./replayGuard.js";

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
