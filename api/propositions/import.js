import { protectApi } from "../../lib/auth.js";
import { handleIdeaImport } from "../../lib/ideaImportApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 10, bucket: "prop-import" } }))) return;
  await handleIdeaImport(req, res, { sendJson, redactSecrets });
}
