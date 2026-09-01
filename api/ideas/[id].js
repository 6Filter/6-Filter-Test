import { protectApi } from "../../lib/auth.js";
import { handleIdeaById } from "../../lib/ideasApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, DELETE, OPTIONS" }))) return;

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
