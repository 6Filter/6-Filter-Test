/**
 * GET /api/admin/backup/export — ADMIN session or X-Backup-Token.
 * Streams every table except research_cache as gzip JSON Lines, AES-256-GCM encrypted.
 */
import { initDb, query, usingPostgres } from "./db.js";
import { protectApi } from "./auth.js";
import { checkRateLimit, rateLimitKey } from "./rateLimit.js";
import { selectExportTables, safeIdent } from "./backupPlan.js";
import { backupTokenMatches, encryptBackupPayload, gzipJsonLines, sha256Hex } from "./backupCrypto.js";
import {
  countBackupExportsSince,
  ensureManagerReviewEventsSchema,
  recordBackupExport,
} from "./managerReviewEvents.js";
import { redactSecrets } from "./http.js";

function jsonValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return { _bytea: value.toString("base64") };
  return value;
}

async function buildExportBundle() {
  await initDb();
  if (!usingPostgres()) {
    const err = new Error("Postgres required for backup export.");
    err.status = 503;
    throw err;
  }
  const found = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const names = selectExportTables(found.map((r) => r.table_name));
  const lines = [];
  const rowCounts = {};
  for (const name of names) {
    const table = safeIdent(name);
    const rows = await query(`SELECT * FROM "${table}"`);
    rowCounts[table] = rows.length;
    for (const row of rows) {
      const record = {};
      for (const [k, v] of Object.entries(row)) record[k] = jsonValue(v);
      lines.push({ type: "row", table, record });
    }
  }
  const gzip = gzipJsonLines(lines);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: Object.entries(rowCounts).map(([name, rows]) => ({ name, rows })),
    rowCounts,
    excluded: ["research_cache"],
  };
  const blob = encryptBackupPayload(gzip, manifest);
  return { blob, manifest: { ...manifest, sha256: sha256Hex(gzip) }, rowCounts };
}

export async function handleBackupExport(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "GET only." }));
    return;
  }

  await ensureManagerReviewEventsSchema();

  const headerToken = String(req.headers["x-backup-token"] || "").trim();
  const tokenOk = backupTokenMatches(headerToken);
  let actorEmail = null;

  if (!tokenOk) {
    const ok = await protectApi(req, res, { methods: "GET, OPTIONS" });
    if (!ok) return;
    if (String(req.user?.role || "").trim() !== "ADMIN") {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Admin session or backup token required." }));
      return;
    }
    actorEmail = req.user?.email || null;
  }

  // 2 calls / hour (memory + durable)
  const rlKey = rateLimitKey(req, "backup-export");
  if (!checkRateLimit(rlKey, { max: 2, windowMs: 3600_000 })) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Backup export limited to 2 calls per hour." }));
    return;
  }
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await countBackupExportsSince(since);
  if (recent >= 2) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Backup export limited to 2 calls per hour." }));
    return;
  }

  try {
    const { blob, manifest, rowCounts } = await buildExportBundle();
    await recordBackupExport({
      actorEmail: tokenOk ? "backup-token" : actorEmail,
      rowCounts,
      sha256: manifest.sha256,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="primus-backup-${stamp}.bk"`);
    res.setHeader("X-Backup-Sha256", manifest.sha256);
    res.setHeader("X-Backup-Tables", String((manifest.tables || []).length));
    res.end(blob);
  } catch (e) {
    const status = Number(e?.status) || 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: redactSecrets(e.message || "Backup failed.") }));
  }
}
