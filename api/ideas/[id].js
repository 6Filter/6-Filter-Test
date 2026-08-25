import { handleIdeaById } from "../../lib/ideasApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Idea id is required." });
    return;
  }

  await handleIdeaById(req, res, id, { sendJson, redactSecrets });
}
