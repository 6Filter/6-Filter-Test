/**
 * Part 134 — Finance-owned GST rate table (ADMIN-managed, seeded empty).
 * Node-only (DB). Browser scoring uses resolveGst with an injected `table`.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { query, usingPostgres, initDb } from "./db.js";
import { dataDir } from "./dataDir.js";
import { GST_STANDARD_RATES } from "./lockedConstants.js";

const storePath = () => path.join(dataDir(), "finance_gst_rates.json");

function readFileStore() {
  try {
    if (!existsSync(storePath())) return [];
    const raw = JSON.parse(readFileSync(storePath(), "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeFileStore(rows) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(storePath(), JSON.stringify(rows, null, 2) + "\n");
}

/**
 * Part 152 — finance_gst_rates.
 * initDb() creates this table and its indexes once at start-up, so a request runs no CREATE, ALTER or DROP.
 */
export async function ensureFinanceGstTable() {
  await initDb();
  if (!usingPostgres()) return;
}

function mapRow(row) {
  if (!row) return null;
  const keywords = String(row.category_keywords ?? row.categoryKeywords ?? "")
    .split(/[,;|]/)
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    id: row.id,
    categoryKeywords: keywords,
    hsn: String(row.hsn || "").trim(),
    rate: Number(row.rate),
    gstRatePct: Number(row.rate),
    effectiveFrom: String(row.effective_from ?? row.effectiveFrom ?? "").trim(),
    source: String(row.source || "").trim(),
    createdBy: row.created_by ?? row.createdBy ?? "",
    updatedBy: row.updated_by ?? row.updatedBy ?? "",
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

/** Seeded empty — Finance owns the rows. */
export async function listFinanceGstRates() {
  await ensureFinanceGstTable();
  if (usingPostgres()) {
    const rows = await query(
      `SELECT * FROM finance_gst_rates ORDER BY effective_from DESC NULLS LAST, updated_at DESC`
    );
    return rows.map(mapRow);
  }
  return readFileStore().map(mapRow);
}

export async function upsertFinanceGstRate(patch = {}, actor = "") {
  await ensureFinanceGstTable();
  const rate = Number(patch.rate ?? patch.gstRatePct);
  if (!Number.isFinite(rate)) {
    const err = new Error("rate is required");
    err.status = 400;
    throw err;
  }
  const keywords = Array.isArray(patch.categoryKeywords)
    ? patch.categoryKeywords.join(", ")
    : String(patch.categoryKeywords || patch.category || "").trim();
  const hsn = String(patch.hsn || "").trim();
  const effectiveFrom = String(patch.effectiveFrom || patch.effective_from || "").trim();
  const source = String(patch.source || "").trim();
  const id = String(patch.id || "").trim() || randomUUID();
  const who = String(actor || "").trim() || "ADMIN";

  if (usingPostgres()) {
    const rows = await query(
      `INSERT INTO finance_gst_rates (
         id, category_keywords, hsn, rate, effective_from, source, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT (id) DO UPDATE SET
         category_keywords = EXCLUDED.category_keywords,
         hsn = EXCLUDED.hsn,
         rate = EXCLUDED.rate,
         effective_from = EXCLUDED.effective_from,
         source = EXCLUDED.source,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [id, keywords, hsn, rate, effectiveFrom || null, source, who]
    );
    return mapRow(rows[0]);
  }

  const rows = readFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  const next = {
    id,
    category_keywords: keywords,
    hsn,
    rate,
    effective_from: effectiveFrom,
    source,
    created_by: idx >= 0 ? rows[idx].created_by : who,
    updated_by: who,
    created_at: idx >= 0 ? rows[idx].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  writeFileStore(rows);
  return mapRow(next);
}

export async function deleteFinanceGstRate(id) {
  await ensureFinanceGstTable();
  if (!id) return false;
  if (usingPostgres()) {
    const rows = await query(`DELETE FROM finance_gst_rates WHERE id = $1 RETURNING id`, [id]);
    return Boolean(rows[0]);
  }
  const rows = readFileStore();
  const next = rows.filter((r) => r.id !== id);
  writeFileStore(next);
  return next.length < rows.length;
}

export function financeGstStandardSlabs() {
  return [...GST_STANDARD_RATES];
}
