import { protectApi } from "../lib/auth.js";
import { handleIdeasCollection } from "../lib/ideasApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return;
  await handleIdeasCollection(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
