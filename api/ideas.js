import { handleIdeasCollection } from "../lib/ideasApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  await handleIdeasCollection(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
