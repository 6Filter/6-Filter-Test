import { protectApi } from "../lib/auth.js";
import { handleCategoryIntelRequest } from "../lib/categoryIntelligence/http.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return;
  const handled = await handleCategoryIntelRequest(req, res, "/api/calibration", {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
  if (!handled) sendJson(res, 404, { error: "Not found." });
}
