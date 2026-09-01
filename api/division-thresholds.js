import { protectApi } from "../lib/auth.js";
import { handleDivisionThresholdsCollection } from "../lib/divisionThresholdsApi.js";
import { readJsonBody, redactSecrets, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return;
  await handleDivisionThresholdsCollection(req, res, {
    readBody: readJsonBody,
    sendJson,
    redactSecrets,
  });
}
