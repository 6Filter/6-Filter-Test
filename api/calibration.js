import { handleCategoryIntelRequest } from "../lib/categoryIntelligence/http.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  const handled = await handleCategoryIntelRequest(req, res, "/api/calibration", {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
  if (!handled) sendJson(res, 404, { error: "Not found." });
}
