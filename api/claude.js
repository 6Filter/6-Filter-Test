import { protectApi } from "../lib/auth.js";
import { handleLlmGenerate } from "../lib/llmApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: true }))) return;
  await handleLlmGenerate(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
