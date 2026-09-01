import { protectApi } from "../../../lib/auth.js";
import { handleIdeaExport } from "../../../lib/ideasApi.js";
import { redactSecrets, sendJson } from "../../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS" }))) return;

  const id =
    req.query?.id ??
    (typeof req.url === "string"
      ? decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).slice(-2, -1)[0] || "")
      : null);

  if (!id) {
    sendJson(res, 400, { error: "Idea id is required." });
    return;
  }

  await handleIdeaExport(req, res, id, { sendJson, redactSecrets });
}
