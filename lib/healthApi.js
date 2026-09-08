import { pingDatabase, countPropositions } from "./db.js";
import { redactSecrets, sendJson } from "./http.js";

export async function handleHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  try {
    await pingDatabase();
    const propositions = await countPropositions();
    sendJson(res, 200, { ok: true, db: "warm", propositions });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: redactSecrets(e.message) });
  }
}
