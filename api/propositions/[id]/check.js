import { protectApi } from "../../../lib/auth.js";
import { handlePropositionCheck } from "../../../lib/propositionCheckApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 120, bucket: "prop-check" } }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2)[0] || "")
      : "");

  await handlePropositionCheck(req, res, {
    propositionId: id,
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
