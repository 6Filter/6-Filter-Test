/**
 * Part 131 — evidence_files table: store bytes off the idea record.
 */
import { randomUUID, createHash } from "node:crypto";
import { EVIDENCE_FILE_MAX_BYTES } from "./lockedConstants.js";
import { sha256Buffer, sniffEvidenceMagic } from "./evidenceExtract.js";
import { initDb, query, usingPostgres } from "./db.js";

/**
 * Part 152 — evidence_files.
 * initDb() creates this table and its indexes once at start-up, so a request runs no CREATE, ALTER or DROP.
 */
export async function ensureEvidenceFilesTable() {
  await initDb();
  if (!usingPostgres()) return;
}

function metaOnly(file) {
  if (!file || typeof file !== "object") return null;
  const fileId = file.fileId || file.id || null;
  const name = String(file.name || "").trim();
  const size = Number(file.size) || 0;
  const sha256 = String(file.sha256 || "").trim();
  if (!fileId && !name) return null;
  return {
    fileId: fileId || null,
    name: name || "evidence",
    size,
    sha256: sha256 || null,
    mime: file.mime || file.mediaType || null,
  };
}

/** Strip base64 from any f1.evidenceSourceFile blob before it is stored on the idea. */
export function stripEvidenceFileBytes(f1 = {}) {
  if (!f1 || typeof f1 !== "object") return f1;
  const file = f1.evidenceSourceFile;
  if (!file || typeof file !== "object") return f1;
  if (!file.data && !file.content) {
    return { ...f1, evidenceSourceFile: metaOnly(file) };
  }
  return {
    ...f1,
    evidenceSourceFile: metaOnly(file),
  };
}

export function evidenceMetaFromDoc(doc = {}) {
  return metaOnly(doc?.f1?.evidenceSourceFile);
}

/**
 * Persist an uploaded base64/file into evidence_files and return meta for the idea.
 */
export async function storeEvidenceUpload({
  ideaId,
  name,
  mime,
  dataBase64,
  buffer,
  uploadedBy = "",
  ideaContext = {},
} = {}) {
  await ensureEvidenceFilesTable();
  const buf =
    buffer ||
    Buffer.from(String(dataBase64 || "").replace(/\s/g, ""), "base64");
  if (!buf.length) {
    const err = new Error("The uploaded file was empty.");
    err.status = 400;
    throw err;
  }
  if (buf.length > EVIDENCE_FILE_MAX_BYTES) {
    const err = new Error("The uploaded file is too large (max 8 MB).");
    err.status = 413;
    throw err;
  }
  const magic = sniffEvidenceMagic(buf);
  if (!magic && !/\.csv$/i.test(name || "")) {
    const err = new Error("Upload a PDF, Word (.docx), Excel (.xlsx), or CSV.");
    err.status = 400;
    throw err;
  }
  if (/\.xls$/i.test(name || "") && !/\.xlsx$/i.test(name || "")) {
    const err = new Error("Save as .xlsx and upload again.");
    err.status = 400;
    throw err;
  }
  if (/\.doc$/i.test(name || "") && !/\.docx$/i.test(name || "")) {
    const err = new Error("Save as .docx and upload again.");
    err.status = 400;
    throw err;
  }

  // Store bytes immediately; extract lazily on the evidence-read step (avoids hang on upload).
  const id = randomUUID();
  const sha256 = sha256Buffer(buf);
  const size = buf.length;

  if (usingPostgres()) {
    await query(
      `INSERT INTO evidence_files
        (id, idea_id, name, mime, size, sha256, content, extracted_text, extracted_at, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)`,
      [
        id,
        String(ideaId || ""),
        String(name || "evidence"),
        String(mime || ""),
        size,
        sha256,
        buf,
        null,
        String(uploadedBy || ""),
      ]
    );
  } else {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const { dataDir } = await import("./dataDir.js");
    const dir = path.join(dataDir(), "evidence_files");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${id}.bin`), buf);
    const indexPath = path.join(dir, "index.json");
    let index = [];
    try {
      index = JSON.parse(await readFile(indexPath, "utf8"));
    } catch {
      index = [];
    }
    index.push({
      id,
      ideaId: String(ideaId || ""),
      name: String(name || "evidence"),
      mime: String(mime || ""),
      size,
      sha256,
      extractedText: null,
      uploadedBy: String(uploadedBy || ""),
      createdAt: new Date().toISOString(),
    });
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  return {
    meta: {
      fileId: id,
      name: String(name || "evidence"),
      size,
      sha256,
      mime: String(mime || ""),
    },
    extracted: null,
  };
}

export async function getEvidenceFileRow(fileId) {
  await ensureEvidenceFilesTable();
  if (!fileId) return null;
  if (usingPostgres()) {
    const rows = await query(`SELECT * FROM evidence_files WHERE id = $1`, [String(fileId)]);
    return rows[0] || null;
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { dataDir } = await import("./dataDir.js");
  const dir = path.join(dataDir(), "evidence_files");
  let index = [];
  try {
    index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
  } catch {
    return null;
  }
  const meta = index.find((r) => r.id === fileId);
  if (!meta) return null;
  const content = await readFile(path.join(dir, `${fileId}.bin`));
  return { ...meta, idea_id: meta.ideaId, content, extracted_text: meta.extractedText };
}

export async function deleteEvidenceFilesForIdea(ideaId) {
  await ensureEvidenceFilesTable();
  if (!ideaId) return 0;
  if (usingPostgres()) {
    const rows = await query(`DELETE FROM evidence_files WHERE idea_id = $1 RETURNING id`, [
      String(ideaId),
    ]);
    return rows.length;
  }
  return 0;
}

/**
 * One-shot migration: move f1.evidenceSourceFile.data into evidence_files.
 * Idempotent. Returns { before, after, migrated }.
 */
export async function migrateInlineEvidenceFiles({ archive = true } = {}) {
  await ensureEvidenceFilesTable();
  await initDb();
  if (!usingPostgres()) return { before: 0, after: 0, migrated: 0, skipped: "no-postgres" };

  const rows = await query(
    `SELECT id, f1_json FROM propositions WHERE f1_json IS NOT NULL AND f1_json LIKE '%evidenceSourceFile%'`
  );
  let before = 0;
  let migrated = 0;
  const archiveRows = [];

  for (const row of rows) {
    let f1;
    try {
      f1 = JSON.parse(row.f1_json);
    } catch {
      continue;
    }
    const file = f1?.evidenceSourceFile;
    if (!file?.data) continue;
    before += 1;
    if (file.fileId && !file.data) continue;
    try {
      const { meta } = await storeEvidenceUpload({
        ideaId: row.id,
        name: file.name || "evidence",
        mime: file.mediaType || file.mime || "",
        dataBase64: file.data,
        uploadedBy: "migration",
      });
      if (archive) {
        archiveRows.push({
          ideaId: row.id,
          name: file.name,
          size: Number(file.size) || String(file.data || "").length,
          sha256: meta.sha256,
          at: new Date().toISOString(),
        });
      }
      f1.evidenceSourceFile = meta;
      await query(`UPDATE propositions SET f1_json = $2 WHERE id = $1`, [
        row.id,
        JSON.stringify(f1),
      ]);
      migrated += 1;
    } catch (e) {
      console.warn(`[primus/evidence] migrate skip id=${row.id}: ${e.message}`);
    }
  }

  if (archive && archiveRows.length) {
    await query(`
      CREATE TABLE IF NOT EXISTS evidence_migration_archive (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(
      `INSERT INTO evidence_migration_archive (id, payload_json) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), JSON.stringify({ count: archiveRows.length, rows: archiveRows })]
    );
  }

  const left = await query(
    `SELECT id, f1_json FROM propositions WHERE f1_json IS NOT NULL AND f1_json LIKE '%"data":%'`
  );
  let after = 0;
  for (const row of left) {
    try {
      const f1 = JSON.parse(row.f1_json);
      if (f1?.evidenceSourceFile?.data) after += 1;
    } catch {
      /* ignore */
    }
  }

  console.log(`[primus/evidence] migrate before=${before} migrated=${migrated} after=${after}`);
  return { before, after, migrated };
}

export function publicEvidenceMeta(file) {
  return metaOnly(file);
}

/** Hash helper for fingerprints when only meta is present. */
export function evidenceFingerprintSlice(doc = {}) {
  const link = String(doc?.f1?.evidenceSourceDate || "").trim();
  let linkClean = "";
  if (link) {
    try {
      const u = new URL(link);
      linkClean = `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
      linkClean = link.split("?")[0].toLowerCase();
    }
  }
  const meta = evidenceMetaFromDoc(doc);
  return {
    evidenceLink: linkClean || null,
    evidenceSha256: meta?.sha256 || null,
  };
}
