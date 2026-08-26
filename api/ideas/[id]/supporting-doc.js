import { handleSupportingDoc } from "../../../lib/ideasApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2, -1)[0] || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Idea id is required." });
    return;
  }

  await handleSupportingDoc(req, res, id, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
