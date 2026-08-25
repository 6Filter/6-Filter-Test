import { handleLlmGenerate } from "../lib/llmApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  await handleLlmGenerate(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
