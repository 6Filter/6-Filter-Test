import { handleCategoryIntelRequest } from "../../../../lib/categoryIntelligence/http.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../../lib/http.js";

export default async function handler(req, res) {
  const runId = req.query?.runId;
  const engineId = req.query?.engineId;
  if (!runId || !engineId) {
    sendJson(res, 400, { error: "runId and engineId are required." });
    return;
  }
  const handled = await handleCategoryIntelRequest(
    req,
    res,
    `/api/category-sizing/${encodeURIComponent(String(runId))}/engine/${encodeURIComponent(String(engineId))}`,
    { readBody: readJsonBody, sendJson, redactSecrets }
  );
  if (!handled) sendJson(res, 404, { error: "Not found." });
}
