/**
 * Part 140 D — routes behind "Upload your idea (Excel, Word or PDF)".
 *   GET  /api/propositions/import-template  → the Excel template
 *   POST /api/propositions/import           → { attachment: { name, data, mediaType } } → drafts owned by the uploader
 *
 * Drafts only: nothing is researched or scored here. Where each value came from is kept in
 * researchFindings.fieldSources[path] = { source: "upload", cell }.
 */
import { authRequired } from "./auth.js";
import { createProposition, deleteProposition, updateProposition, updatePropositionResearchFindingsOnly } from "./db.js";
import { isCanonicalTeam } from "./propositionFields.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";
import { omitEmptyFilterColumns } from "./filterWriteGuard.js";
import { normalizeProvider, runWithLlm } from "./llmContext.js";
import {
  TEMPLATE_FILENAME,
  XLSX_MEDIA_TYPE,
  buildImportTemplateBuffer,
  fieldsToDoc,
  importIdeasFromAttachment,
} from "./ideaImport.js";

function preflight(res, req) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export async function handleImportTemplate(req, res, { sendJson, redactSecrets }) {
  if (preflight(res, req)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only." });
    return;
  }
  try {
    const buffer = await buildImportTemplateBuffer();
    res.statusCode = 200;
    res.setHeader("Content-Type", XLSX_MEDIA_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${TEMPLATE_FILENAME}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}

/** Create one draft from the fields a file supplied. Throws on failure after removing a half-made draft. */
export async function createImportedDraft(idea, user) {
  const created = await createProposition({
    createdByUserId: user?.id || null,
    createdByEmail: user?.email || null,
    submitterDepartment: user?.team || "",
  });
  try {
    const doc = fieldsToDoc(idea.fields);
    const f2 = { ...(created.f2 || {}), ...(doc.f2 || {}) };
    // A shelf price written in the file is the person's own MRP. Leaving the
    // override off makes the save recompute MRP from COGS, margin and GST and
    // drop the number the file stated.
    const statedMrp = Number(idea?.fields?.["f2.mrpInr"]);
    if (Number.isFinite(statedMrp) && statedMrp > 0) f2.mrpOverride = true;
    const payload = omitEmptyFilterColumns({
      ...created,
      name: doc.name || "",
      category: doc.category || "",
      ideaDescription: doc.ideaDescription || "",
      submitterName: String(user?.name || "").trim() || created.submitterName || "",
      submitterDepartment: created.submitterDepartment || user?.team || "",
      f1: { ...(created.f1 || {}), ...(doc.f1 || {}) },
      f2,
      f3: { ...(created.f3 || {}), ...(doc.f3 || {}) },
      f5: { ...(created.f5 || {}), ...(doc.f5 || {}) },
    });
    // omitEmptyFilterColumns drops a filter with nothing in it, so empty filters are never written.
    const saved = await updateProposition(created.id, payload, {
      bumpVersion: false,
      handler: "idea-import",
      writer: "client",
    });
    if (!saved) throw new Error("Could not save the draft.");
    await updatePropositionResearchFindingsOnly(created.id, { fieldSources: idea.fieldSources || {} });
    return saved;
  } catch (e) {
    try {
      await deleteProposition(created.id);
    } catch {
      /* keep the original error */
    }
    throw e;
  }
}

export async function handleIdeaImport(req, res, { readBody, sendJson, redactSecrets }) {
  if (preflight(res, req)) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const department = requireUnlockedDepartment(req.user);
    if (authRequired() && !isCanonicalTeam(req.user?.team)) {
      sendJson(res, 403, { error: "Choose your team before uploading ideas.", needsTeam: true });
      return;
    }
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const attachment = body?.attachment && typeof body.attachment === "object" ? body.attachment : null;
    if (!attachment?.data) {
      sendJson(res, 400, { error: "Choose an Excel, Word or PDF file to upload." });
      return;
    }
    const provider = normalizeProvider(body?.provider || "claude");
    const read = await runWithLlm(
      provider,
      () => importIdeasFromAttachment({ attachment, user: req.user || null, provider }),
      { department, userEmail: req.user?.email }
    );

    const created = [];
    const rejected = [...read.rejected];
    for (const idea of read.ideas) {
      try {
        const saved = await createImportedDraft(idea, req.user || null);
        created.push({
          id: saved.id,
          row: idea.row,
          name: saved.name || idea.fields.name || "",
          filled: idea.filled,
          warnings: idea.warnings,
          ignoredColumns: idea.ignoredColumns || [],
          missingRequired: idea.missingRequired,
          dropped: idea.dropped,
        });
      } catch (e) {
        rejected.push({ row: idea.row, reason: "This idea could not be saved. Try uploading it again." });
        console.warn(`[primus/idea-import] row ${idea.row} not saved: ${redactSecrets(e?.message)}`);
      }
    }
    rejected.sort((a, b) => Number(a.row || 0) - Number(b.row || 0));
    sendJson(res, created.length ? 201 : 200, {
      created,
      rejected,
      ignoredColumns: read.ignoredColumns || [],
      usedAi: Boolean(read.usedAi),
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}
