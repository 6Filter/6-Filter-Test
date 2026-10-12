/**
 * Syndicated rows live in Postgres. Local file mode may fall back to data/*.json.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./dataDir.js";
import { initDb, query, usingPostgres } from "./db.js";
import { fileAppendAudit } from "./propositionRetention.js";

const STORE_FILE = "syndicated_rows.json";

function storePath() {
  return path.join(dataDir(), STORE_FILE);
}

async function readJson(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return parsed;
  } catch {
    return null;
  }
}

function asPayload(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : row;
  if (!payload || typeof payload !== "object") return null;
  return {
    ...payload,
    source: String(row.source || payload.source || "").trim().toLowerCase(),
    category: String(row.category || payload.category || "").trim(),
    categoryFamily: String(row.family || payload.categoryFamily || payload.family || "").trim(),
    as_of: String(row.asOf || row.as_of || payload.as_of || payload.period || "").trim(),
  };
}

async function readFileStore() {
  const parsed = await readJson(storePath());
  const rows = Array.isArray(parsed) ? parsed : [];
  return rows.map(asPayload).filter((row) => row && row.source && row.category);
}

async function readDataFiles() {
  const [nielsen, kantar] = await Promise.all([
    readJson(path.join(dataDir(), "nielsen.json")),
    readJson(path.join(dataDir(), "kantar.json")),
  ]);
  const out = [];
  for (const row of Array.isArray(nielsen) ? nielsen : []) {
    const payload = asPayload({ ...row, source: "nielsen" });
    if (payload?.category) out.push(payload);
  }
  for (const row of Array.isArray(kantar) ? kantar : []) {
    const payload = asPayload({ ...row, source: "kantar" });
    if (payload?.category) out.push(payload);
  }
  return out;
}

export async function listSyndicatedPayloads() {
  await initDb();
  if (usingPostgres()) {
    const rows = await query(
      `SELECT source, category, family, payload_json, as_of FROM syndicated_rows ORDER BY source, category, id`
    );
    return rows
      .map((row) => {
        let payload = {};
        try {
          payload = JSON.parse(row.payload_json || "{}");
        } catch {
          payload = {};
        }
        return asPayload({
          source: row.source,
          category: row.category,
          family: row.family,
          asOf: row.as_of,
          payload,
        });
      })
      .filter(Boolean);
  }
  const stored = await readFileStore();
  if (stored.length) return stored;
  return readDataFiles();
}

export async function listSyndicatedBySource(source) {
  const want = String(source || "").trim().toLowerCase();
  const rows = await listSyndicatedPayloads();
  return rows.filter((row) => row.source === want);
}

async function writeAudit({ actor, rowCount, categories }) {
  const ids = [...new Set(categories)];
  if (usingPostgres()) {
    await query(
      `INSERT INTO proposition_audit (at, action, actor, row_count, ids_json)
       VALUES (NOW(), $1, $2, $3, $4)`,
      ["syndicated-import", String(actor || "Master"), rowCount, JSON.stringify(ids)]
    );
    return;
  }
  await fileAppendAudit({ action: "syndicated-import", actor, ids });
}

/** Replace every stored row for the sources present in this import. */
export async function replaceSyndicatedRows(rows, { actor = "Master" } = {}) {
  await initDb();
  const sources = [...new Set(rows.map((row) => row.source))];
  if (usingPostgres()) {
    if (sources.length) {
      await query(`DELETE FROM syndicated_rows WHERE source = ANY($1::text[])`, [sources]);
    }
    for (const row of rows) {
      await query(
        `INSERT INTO syndicated_rows (source, category, family, payload_json, as_of, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.source,
          row.category,
          row.family || "",
          JSON.stringify(row.payload),
          row.asOf,
          String(actor || ""),
        ]
      );
    }
  } else {
    const existing = await readFileStore();
    const kept = existing.filter((row) => !sources.includes(row.source));
    const next = kept.concat(rows.map((row) => asPayload(row)));
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(storePath(), JSON.stringify(next));
  }
  await writeAudit({
    actor,
    rowCount: rows.length,
    categories: rows.map((row) => `${row.source}:${row.category}`),
  });
  return { written: rows.length, sources };
}
