import { protectApi } from "../../lib/auth.js";
import { handlePropositionById } from "../../lib/propositionsApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, PUT, DELETE, OPTIONS" }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  await handlePropositionById(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
