import { protectApi } from "../../../lib/auth.js";
import { handlePropositionCheck } from "../../../lib/propositionCheckApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 120, bucket: "prop-check" } }))) return;

  await handlePropositionCheck(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
