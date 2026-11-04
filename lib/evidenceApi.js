/**
 * Part 131 — GET /api/propositions/:id/evidence-file
 * Streams the evidence file to the idea owner and ADMIN only; everyone else 404.
 */
import { getPropositionById } from "./db.js";
import { getEvidenceFileRow } from "./evidenceFiles.js";

function isAdmin(user) {
  const role = String(user?.role || "").toUpperCase();
  return role === "ADMIN" || role === "MASTER";
}

function isOwner(user, doc) {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  const uid = String(user?.id || user?.userId || "").trim();
  if (uid && doc.createdByUserId && String(doc.createdByUserId) === uid) return true;
  if (email && doc.createdByEmail && String(doc.createdByEmail).toLowerCase() === email) return true;
  return false;
}

export async function handleEvidenceFileDownload(req, res, propositionId, { sendJson }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const doc = await getPropositionById(propositionId);
  if (!doc) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (!isAdmin(req.user) && !isOwner(req.user, doc)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const fileId = doc.f1?.evidenceSourceFile?.fileId;
  if (!fileId) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const row = await getEvidenceFileRow(fileId);
  if (!row || String(row.idea_id || row.ideaId) !== String(propositionId)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content || []);
  const name = String(row.name || "evidence").replace(/[^\w.\- ()]+/g, "_");
  res.statusCode = 200;
  res.setHeader("Content-Type", row.mime || "application/octet-stream");
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buf);
  console.log(
    `[primus/evidence] download idea=${propositionId} file=${fileId} sha=${row.sha256} bytes=${buf.length}`
  );
}
