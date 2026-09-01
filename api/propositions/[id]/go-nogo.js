import { protectApi } from "../../../lib/auth.js";
import { handlePropositionGoNogo } from "../../../lib/propositionGateApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: true }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2)[0] || "")
      : null);

  await handlePropositionGoNogo(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
