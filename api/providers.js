import { handleProviders } from "../lib/llmApi.js";
import { sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  await handleProviders(req, res, { sendJson });
}
