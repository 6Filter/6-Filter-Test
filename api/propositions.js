import { protectApi } from "../lib/auth.js";
import { handlePropositionsCollection } from "../lib/propositionsApi.js";
import { redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return;
  await handlePropositionsCollection(req, res, { sendJson, redactSecrets });
}
