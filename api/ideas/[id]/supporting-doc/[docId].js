import { handleSupportingDocById } from "../../../../lib/ideasApi.js";
import { redactSecrets, sendJson } from "../../../../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const parts =
    typeof req.url === "string" ? req.url.split("?")[0].split("/").filter(Boolean) : [];
  const ideasIdx = parts.indexOf("ideas");
  const docIdx = parts.indexOf("supporting-doc");

  const id =
    req.query?.id ??
    (ideasIdx >= 0 && parts[ideasIdx + 1] ? decodeURIComponent(parts[ideasIdx + 1]) : null);
  const docId =
    req.query?.docId ??
    (docIdx >= 0 && parts[docIdx + 1] ? decodeURIComponent(parts[docIdx + 1]) : null);

  if (!id) {
    sendJson(res, 400, { error: "Idea id is required." });
    return;
  }
  if (!docId) {
    sendJson(res, 400, { error: "Document id is required." });
    return;
  }

  await handleSupportingDocById(req, res, id, docId, { sendJson, redactSecrets });
}
