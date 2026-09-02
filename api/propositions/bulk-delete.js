import { protectApi } from "../../lib/auth.js";
import { handlePropositionsBulkDelete } from "../../lib/propositionsApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "DELETE, OPTIONS" }))) return;
  await handlePropositionsBulkDelete(req, res, { sendJson, redactSecrets });
}
