import { protectApi } from "../../../lib/auth.js";
import { handlePropositionVerifyF4 } from "../../../lib/filters/reassessTechShift.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 40, bucket: "prop-verify-f4" } }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2)[0] || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  await handlePropositionVerifyF4(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}