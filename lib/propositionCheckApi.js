import { getPropositionById } from "./db.js";
import { propositionForScore } from "./propositionGateApi.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";

/** Live draft check — scores the open row and does not write it. */
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
    const checked = draft && typeof draft === "object" ? { ...draft } : {};
    if (propositionId && !checked.id) checked.id = propositionId;
    const saved = propositionId ? await getPropositionById(propositionId) : null;
    const scored = propositionForScore(saved, checked);
    sendJson(res, 200, { advisoryChecks: await computeAllAdvisoryChecks(scored) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
