import { computeAllAdvisoryChecks } from "./propositionScoring.js";
import { getPropositionById } from "./db.js";
import { canViewProposition } from "./propositionAccess.js";
import { propositionForScore } from "./propositionGateApi.js";

/** Live draft check. Reads the saved row so a blank division uses the same floor as Submit. */
export async function handlePropositionCheck(req, res, { propositionId, readBody, sendJson, redactSecrets }) {
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
    const body = typeof readBody === "function" ? await readBody(req) || {} : req.body || {};
    const draft = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    const saved = propositionId ? await getPropositionById(propositionId) : null;
    const visible = saved && canViewProposition(req.user, saved) ? saved : null;
    const checked = propositionForScore(visible, draft);
    if (propositionId && !checked.id) checked.id = propositionId;
    sendJson(res, 200, { advisoryChecks: await computeAllAdvisoryChecks(checked) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
