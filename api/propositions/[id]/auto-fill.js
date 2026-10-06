import { protectApi } from "../../../lib/auth.js";
import { handlePropositionAutoFill } from "../../../lib/propositionsApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 60, bucket: "prop-auto-fill" } }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2)[0] || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  await handlePropositionAutoFill(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
