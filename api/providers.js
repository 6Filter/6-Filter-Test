import { protectApi } from "../lib/auth.js";
import { handleProviders } from "../lib/llmApi.js";
import { sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS" }))) return;
  await handleProviders(req, res, { sendJson });
}
