import { computeAllAdvisoryChecks } from "./propositionScoring.js";

/** Live draft check — never reads or writes the database. */
export async function handlePropositionCheck(req, res, { readBody, sendJson, redactSecrets }) {
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
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const draft = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
    sendJson(res, 200, { advisoryChecks: computeAllAdvisoryChecks(draft || {}) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
