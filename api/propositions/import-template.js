import { protectApi } from "../../lib/auth.js";
import { handleImportTemplate } from "../../lib/ideaImportApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS", rateLimit: { max: 30, bucket: "prop-import-template" } }))) return;
  await handleImportTemplate(req, res, { sendJson, redactSecrets });
}
