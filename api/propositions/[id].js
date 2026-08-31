import { handlePropositionById } from "../../lib/propositionsApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
