import { protectApi } from "../../lib/auth.js";
import { handleDivisionThresholdById } from "../../lib/divisionThresholdsApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "PUT, OPTIONS" }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Division threshold id is required." });
    return;
  }

  await handleDivisionThresholdById(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
