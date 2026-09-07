import { pingDatabase } from "./db.js";
import { redactSecrets, sendJson } from "./http.js";

export async function handleHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  try {
    await pingDatabase();
    sendJson(res, 200, { ok: true, db: "warm" });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: redactSecrets(e.message) });
  }
}
