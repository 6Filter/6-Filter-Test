import { handleCategoryIntelRequest } from "../../../lib/categoryIntelligence/http.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  const runId = req.query?.runId;
  if (!runId) {
    sendJson(res, 400, { error: "runId is required." });
    return;
  }
  const handled = await handleCategoryIntelRequest(
    req,
    res,
    `/api/category-sizing/export/${encodeURIComponent(String(runId))}`,
    { readBody: readJsonBody, sendJson, redactSecrets }
  );
  if (!handled) sendJson(res, 404, { error: "Not found." });
}
