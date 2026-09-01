import { protectApi } from "../../../lib/auth.js";
import { handleAiFirstPass } from "../../../lib/propositionAiFirstPass.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: true }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2, -1)[0] || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  await handleAiFirstPass(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
