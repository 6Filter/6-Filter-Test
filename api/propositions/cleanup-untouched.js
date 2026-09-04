import { protectApi } from "../../lib/auth.js";
import { handlePropositionsCleanupUntouched } from "../../lib/propositionsApi.js";
import { redactSecrets, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "DELETE, OPTIONS" }))) return;
  await handlePropositionsCleanupUntouched(req, res, { sendJson, redactSecrets });
}
