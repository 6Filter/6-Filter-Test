import { getPropositionById } from "./db.js";
import { propositionForScore } from "./propositionGateApi.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";

/** Live draft check. Reads the saved idea so a partial body scores the same row. Never writes. */
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
    let saved = null;
    if (propositionId) {
      try {
        saved = await getPropositionById(propositionId);
      } catch {
        saved = null;
      }
    }
    const checked = saved ? propositionForScore(saved, draft) : draft && typeof draft === "object" ? { ...draft } : {};
    if (propositionId && !checked.id) checked.id = propositionId;
    sendJson(res, 200, { advisoryChecks: await computeAllAdvisoryChecks(checked) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
