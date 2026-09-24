import { isUsingPostgres, pingDatabase, countPropositions, countIdeas } from "./db.js";
import { redactSecrets, sendJson } from "./http.js";

export async function handleHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  try {
    const ping = await pingDatabase();
    const propositions = await countPropositions();
    const ideas = await countIdeas();
    const usePostgres = isUsingPostgres();
    sendJson(res, 200, {
      ok: true,
      db: ping.db || (usePostgres ? "postgres" : "file"),
      usePostgres,
      propositions,
      ideas,
    });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: redactSecrets(e.message) });
  }
}
