import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "ideas.json");
const PROP_FILE = path.join(process.cwd(), "data", "propositions.json");
let dbReady = false;
let usePostgres = false;
let pool = null;

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

function pgPoolConfig(url) {
  let host = "";
  let sslMode = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname || "";
    sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  } catch {
    sslMode = /sslmode=require/i.test(url) ? "require" : "";
  }
  const useSsl =
    sslMode !== "disable" &&
    (sslMode === "require" ||
      sslMode === "verify-full" ||
      sslMode === "verify-ca" ||
      host.endsWith("render.com") ||
      host.includes("neon.tech"));
  return {
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
}

async function ensureFileStore() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

async function readFileStore() {
  await ensureFileStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function writeFileStore(rows) {
  await ensureFileStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function ensurePropFileStore() {
  await fs.mkdir(path.dirname(PROP_FILE), { recursive: true });
  try {
    await fs.access(PROP_FILE);
  } catch {
    await fs.writeFile(PROP_FILE, "[]", "utf8");
  }
}

async function readPropFileStore() {
  await ensurePropFileStore();
  const raw = await fs.readFile(PROP_FILE, "utf8");
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function writePropFileStore(rows) {
  await ensurePropFileStore();
  await fs.writeFile(PROP_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function resolveIdeaType(result, columnType) {
  if (columnType === "process" || columnType === "product") return columnType;
  if (!result || typeof result !== "object") return "product";
  if (result.ideaType === "process") return "process";
  if (result.efficiency && result.feasibility && result.scalability) return "process";
  return "product";
}

function parseJsonCol(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseSupportingDocs(raw) {
  const parsed = parseJsonCol(raw, []);
  return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d === "object") : [];
}

function publicSupportingDocs(docs) {
  return parseSupportingDocs(docs).map((d) => ({
    id: d.id,
    name: d.name,
    mediaType: d.mediaType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.uploadedAt,
  }));
}

function npdFieldsFromResult(result) {
  const r = result && typeof result === "object" ? result : {};
  return {
    filter1_json: r.filter1 ? JSON.stringify(r.filter1) : null,
    filter2_json: r.filter2 ? JSON.stringify(r.filter2) : null,
    filter3_json: r.filter3 ? JSON.stringify(r.filter3) : null,
    filter4_json: r.filter4 ? JSON.stringify(r.filter4) : null,
    overall_verdict: r.overallVerdict || null,
    gram_class: r.gramClass || r.ideaWeight || null,
    escalation_status: r.escalationStatus || "none",
    escalation_notes: r.escalationNotes
      ? typeof r.escalationNotes === "string"
        ? r.escalationNotes
        : JSON.stringify(r.escalationNotes)
      : null,
  };
}

/**
 * PostgreSQL via DATABASE_URL or POSTGRES_URL (Render, Neon TCP, any Postgres).
 * Uses node-postgres (TCP). The Neon HTTP driver cannot talk to Render Postgres.
 * Locally, falls back to data/ideas.json with a console warning.
 */
export async function initDb() {
  if (dbReady) return;

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const onVercel = Boolean(process.env.VERCEL);

  if (!url) {
    if (onVercel) {
      const err = new Error(
        "DATABASE_URL is required on Vercel. Add a Postgres connection string under Project → Settings → Environment Variables."
      );
      err.status = 500;
      throw err;
    }
    console.warn(
      "[primus/db] DATABASE_URL not set — using local file store data/ideas.json and data/propositions.json. Set DATABASE_URL for PostgreSQL."
    );
    await ensureFileStore();
    await ensurePropFileStore();
    usePostgres = false;
    dbReady = true;
    return;
  }

  const pgMod = await import("pg");
  const Pool = pgMod.Pool || pgMod.default?.Pool;
  if (!pool) pool = new Pool(pgPoolConfig(url));

  await query(`
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      idea_text TEXT NOT NULL,
      image_json TEXT,
      status TEXT NOT NULL DEFAULT 'analyzed',
      phase1_score DOUBLE PRECISION,
      result_json TEXT NOT NULL,
      idea_type TEXT NOT NULL DEFAULT 'product',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Existing deployments may predate idea_type — add + backfill from result_json.
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS idea_type TEXT`);
  await query(`
    UPDATE ideas
    SET idea_type = CASE
      WHEN COALESCE(result_json::json->>'ideaType', '') = 'process' THEN 'process'
      WHEN (result_json::json->'efficiency') IS NOT NULL
        AND (result_json::json->'feasibility') IS NOT NULL
        AND (result_json::json->'scalability') IS NOT NULL THEN 'process'
      ELSE 'product'
    END
    WHERE idea_type IS NULL OR idea_type = ''
  `);
  await query(`
    ALTER TABLE ideas
    ALTER COLUMN idea_type SET DEFAULT 'product'
  `);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS filter1_json TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS filter2_json TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS filter3_json TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS filter4_json TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS overall_verdict TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS gram_class TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS escalation_status TEXT DEFAULT 'none'`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS escalation_notes TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS input_hash TEXT`);
  await query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS supporting_docs_json TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS ideas_input_hash_idx ON ideas (input_hash)`);
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ideas_input_hash_uidx ON ideas (input_hash) WHERE input_hash IS NOT NULL`
    );
  } catch (e) {
    console.error(
      "[primus/db] unique input_hash index skipped:",
      e?.message || e
    );
  }

  await query(`
    CREATE TABLE IF NOT EXISTS calibration_factors (
      id TEXT PRIMARY KEY,
      engine_id TEXT NOT NULL,
      output_measured TEXT NOT NULL,
      archetype TEXT NOT NULL,
      multiplier DOUBLE PRECISION NOT NULL,
      measured_from_category TEXT,
      confidence TEXT,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS category_sizing_runs (
      id TEXT PRIMARY KEY,
      idea_id TEXT,
      category_archetype TEXT,
      engines_run_json TEXT,
      engines_not_run_json TEXT,
      reconciliation_json TEXT,
      growth_decomposition_json TEXT,
      what_could_not_be_established TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS format_trend_assessments (
      id TEXT PRIMARY KEY,
      idea_id TEXT,
      format_trend_direction TEXT,
      digital_proxy_signal TEXT,
      analog_transfer_signal TEXT,
      early_warning_signal TEXT,
      trademark_filings_json TEXT,
      sources_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS propositions (
      id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      division TEXT,
      final_verdict TEXT,
      final_verdict_note TEXT,
      f1_json TEXT,
      f2_json TEXT,
      f3_json TEXT,
      f4_json TEXT,
      f5_json TEXT,
      f6_json TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  usePostgres = true;
  dbReady = true;
  console.log("[primus/db] connected to PostgreSQL");
}

function stripImageForStore(image) {
  if (!image) return null;
  return {
    name: image.name || "upload",
    mediaType: image.mediaType || "image/png",
    hasData: Boolean(image.data),
  };
}

function overlayNpdColumns(result, row) {
  const next = { ...result };
  if (row.filter1_json) next.filter1 = parseJsonCol(row.filter1_json, next.filter1);
  if (row.filter2_json) next.filter2 = parseJsonCol(row.filter2_json, next.filter2);
  if (row.filter3_json) next.filter3 = parseJsonCol(row.filter3_json, next.filter3);
  if (row.filter4_json) next.filter4 = parseJsonCol(row.filter4_json, next.filter4);
  if (row.overall_verdict) next.overallVerdict = row.overall_verdict;
  if (row.gram_class) {
    next.gramClass = row.gram_class;
    next.ideaWeight = row.gram_class;
  }
  if (row.escalation_status) next.escalationStatus = row.escalation_status;
  if (row.escalation_notes != null && row.escalation_notes !== "") {
    next.escalationNotes = parseJsonCol(row.escalation_notes, row.escalation_notes);
  }
  next.supportingDocs = publicSupportingDocs(row.supporting_docs_json);
  return next;
}

function rowToSummary(row) {
  let result = row.result ?? row.result_json;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = {};
    }
  }
  if (!result || typeof result !== "object") result = {};
  result = overlayNpdColumns(result, row);
  const ideaType = resolveIdeaType(result, row.idea_type);
  return {
    id: row.id,
    idea: row.idea_text || row.idea,
    phase1: Number(row.phase1_score ?? row.phase1 ?? result?.phase1 ?? 0),
    ts: new Date(row.created_at || row.ts || Date.now()).getTime(),
    ideaWeight: result?.gramClass || result?.ideaWeight || null,
    gramClass: result?.gramClass || null,
    overallVerdict: result?.overallVerdict || null,
    escalationStatus: result?.escalationStatus || row.escalation_status || "none",
    ideaType,
    phase1Max: Number(result?.phase1Max) || (ideaType === "process" ? 40 : 60),
    status: row.status || "analyzed",
    llmProvider: result?.llmProvider || "claude",
    llmLabel: result?.llmLabel || "Claude",
  };
}

function rowToFull(row) {
  let result = row.result_json ?? row.result;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = {};
    }
  }
  if (!result || typeof result !== "object") result = {};
  result = overlayNpdColumns(result, row);
  const ideaType = resolveIdeaType(result, row.idea_type);
  return {
    ...result,
    id: row.id,
    idea: row.idea_text || row.idea || result.idea,
    ts: new Date(row.created_at || row.ts || Date.now()).getTime(),
    status: row.status || "analyzed",
    ideaType,
    phase1Max: Number(result.phase1Max) || (ideaType === "process" ? 40 : 60),
  };
}

export async function saveIdea({ idea, image, result, status = "analyzed", inputHash = null }) {
  await initDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const imageJson = image ? JSON.stringify(stripImageForStore(image)) : null;
  const resultJson = JSON.stringify(result);
  const phase1 = Number(result.phase1) || 0;
  const ideaType = resolveIdeaType(result, result?.ideaType);
  const npd = npdFieldsFromResult(result);
  const hash = inputHash ? String(inputHash) : null;

  if (usePostgres) {
    try {
      await query(
        `INSERT INTO ideas (
        id, idea_text, image_json, status, phase1_score, result_json, idea_type, created_at,
        filter1_json, filter2_json, filter3_json, filter4_json,
        overall_verdict, gram_class, escalation_status, escalation_notes, input_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          id,
          idea,
          imageJson,
          status,
          phase1,
          resultJson,
          ideaType,
          createdAt,
          npd.filter1_json,
          npd.filter2_json,
          npd.filter3_json,
          npd.filter4_json,
          npd.overall_verdict,
          npd.gram_class,
          npd.escalation_status,
          npd.escalation_notes,
          hash,
        ]
      );
    } catch (e) {
      if (hash && (e?.code === "23505" || /ideas_input_hash/i.test(e?.message || ""))) {
        const existing = await getIdeaByInputHash(hash);
        if (existing) return existing;
      }
      throw e;
    }
  } else {
    const rows = await readFileStore();
    if (hash) {
      const existing = rows.find((r) => r.input_hash === hash);
      if (existing) return rowToFull(existing);
    }
    rows.unshift({
      id,
      idea_text: idea,
      image_json: imageJson,
      status,
      phase1_score: phase1,
      result_json: resultJson,
      idea_type: ideaType,
      created_at: createdAt,
      input_hash: hash,
      ...npd,
    });
    await writeFileStore(rows.slice(0, 200));
  }

  return rowToFull({
    id,
    idea_text: idea,
    status,
    result_json: resultJson,
    idea_type: ideaType,
    created_at: createdAt,
    ...npd,
  });
}

/**
 * @param {number} limit
 * @param {"product"|"process"|null|undefined} ideaType - optional DB filter
 */
export async function listIdeas(limit = 20, ideaType = null) {
  await initDb();
  const type = ideaType === "process" || ideaType === "product" ? ideaType : null;

  if (usePostgres) {
    const selectCols = `id, idea_text, status, phase1_score, result_json, idea_type, created_at,
               filter1_json, filter2_json, filter3_json, filter4_json,
               overall_verdict, gram_class, escalation_status, escalation_notes`;
    let rows;
    if (type === "process") {
      rows = await query(
        `SELECT ${selectCols} FROM ideas WHERE idea_type = 'process' ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    } else if (type === "product") {
      rows = await query(
        `SELECT ${selectCols} FROM ideas WHERE COALESCE(idea_type, 'product') = 'product' ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    } else {
      rows = await query(
        `SELECT ${selectCols} FROM ideas ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    }
    return rows.map((row) => rowToSummary(row));
  }

  const rows = await readFileStore();
  const mapped = rows.map((row) => rowToSummary(row));
  const filtered = type ? mapped.filter((r) => r.ideaType === type) : mapped;
  return filtered.slice(0, limit);
}

export async function getIdeaByInputHash(inputHash) {
  await initDb();
  const hash = String(inputHash || "").trim();
  if (!hash) return null;

  if (usePostgres) {
    const rows = await query(
      `SELECT id, idea_text, status, phase1_score, result_json, idea_type, created_at,
             filter1_json, filter2_json, filter3_json, filter4_json,
             overall_verdict, gram_class, escalation_status, escalation_notes,
             supporting_docs_json
       FROM ideas
       WHERE input_hash = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [hash]
    );
    if (!rows.length) return null;
    return rowToFull(rows[0]);
  }

  const rows = await readFileStore();
  const row = rows.find((r) => r.input_hash === hash);
  return row ? rowToFull(row) : null;
}

export async function getIdeaById(id) {
  await initDb();
  if (!id) return null;

  if (usePostgres) {
    const rows = await query(
      `SELECT id, idea_text, status, phase1_score, result_json, idea_type, created_at,
             filter1_json, filter2_json, filter3_json, filter4_json,
             overall_verdict, gram_class, escalation_status, escalation_notes,
             supporting_docs_json
       FROM ideas
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return null;
    return rowToFull(rows[0]);
  }

  const rows = await readFileStore();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  return rowToFull(row);
}

export async function readSupportingDocsRaw(id) {
  await initDb();
  if (!id) return null;

  if (usePostgres) {
    const rows = await query(
      `SELECT overall_verdict, supporting_docs_json FROM ideas WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) return null;
    return {
      overallVerdict: rows[0].overall_verdict || null,
      docs: parseSupportingDocs(rows[0].supporting_docs_json),
    };
  }

  const rows = await readFileStore();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const overlaid = overlayNpdColumns({}, row);
  return {
    overallVerdict: row.overall_verdict || overlaid.overallVerdict || null,
    docs: parseSupportingDocs(row.supporting_docs_json),
  };
}

export async function writeSupportingDocs(id, docs) {
  await initDb();
  if (!id) return null;
  const json = JSON.stringify(Array.isArray(docs) ? docs : []);

  if (usePostgres) {
    const rows = await query(
      `UPDATE ideas SET supporting_docs_json = $1 WHERE id = $2 RETURNING id`,
      [json, id]
    );
    if (!rows.length) return null;
  } else {
    const rows = await readFileStore();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], supporting_docs_json: json };
    await writeFileStore(rows);
  }

  return getIdeaById(id);
}

export async function escalateIdea(id, { filterName, disputedEvidence }) {
  await initDb();
  const existing = await getIdeaById(id);
  if (!existing) return null;

  const notes = {
    filterName: String(filterName || "").trim(),
    disputedEvidence: String(disputedEvidence || "").trim(),
    at: new Date().toISOString(),
  };
  const notesJson = JSON.stringify(notes);
  const nextResult = {
    ...existing,
    escalationStatus: "escalated",
    escalationNotes: notes,
  };
  const resultJson = JSON.stringify(nextResult);

  if (usePostgres) {
    await query(
      `UPDATE ideas
       SET escalation_status = 'escalated',
           escalation_notes = $1,
           result_json = $2
       WHERE id = $3`,
      [notesJson, resultJson, id]
    );
  } else {
    const rows = await readFileStore();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    rows[idx] = {
      ...rows[idx],
      result_json: resultJson,
      escalation_status: "escalated",
      escalation_notes: notesJson,
    };
    await writeFileStore(rows);
  }

  return getIdeaById(id);
}

export async function deleteIdea(id) {
  await initDb();
  if (!id) return false;

  if (usePostgres) {
    const rows = await query(`DELETE FROM ideas WHERE id = $1 RETURNING id`, [id]);
    return rows.length > 0;
  }

  const rows = await readFileStore();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeFileStore(next);
  return true;
}

export function isUsingPostgres() {
  return usePostgres;
}

function emptyFilterBlob() {
  return JSON.stringify({ forumVerdict: "", verdictNote: "" });
}

function stringifyFilter(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value.trim()) return value;
  return emptyFilterBlob();
}

function normStoredVerdict(value) {
  if (value === "pass" || value === "fail") return value;
  return null;
}

function publicProposition(row) {
  if (!row) return null;
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const updatedAt = row.updated_at ?? row.updatedAt ?? null;
  return {
    id: row.id,
    name: row.name || "",
    category: row.category || "",
    division: row.division || "",
    finalVerdict: row.final_verdict ?? row.finalVerdict ?? "",
    finalVerdictNote: row.final_verdict_note ?? row.finalVerdictNote ?? "",
    f1: parseJsonCol(row.f1_json ?? row.f1, { forumVerdict: "", verdictNote: "" }),
    f2: parseJsonCol(row.f2_json ?? row.f2, { forumVerdict: "", verdictNote: "" }),
    f3: parseJsonCol(row.f3_json ?? row.f3, { forumVerdict: "", verdictNote: "" }),
    f4: parseJsonCol(row.f4_json ?? row.f4, { forumVerdict: "", verdictNote: "" }),
    f5: parseJsonCol(row.f5_json ?? row.f5, { forumVerdict: "", verdictNote: "" }),
    f6: parseJsonCol(row.f6_json ?? row.f6, { forumVerdict: "", verdictNote: "" }),
    version: Number(row.version) || 1,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

export async function createProposition() {
  await initDb();
  const id = randomUUID();
  const blank = emptyFilterBlob();

  if (usePostgres) {
    const rows = await query(
      `INSERT INTO propositions (
         id, name, category, division, final_verdict, final_verdict_note,
         f1_json, f2_json, f3_json, f4_json, f5_json, f6_json, version
       ) VALUES ($1, '', '', '', NULL, NULL, $2, $3, $4, $5, $6, $7, 1)
       RETURNING *`,
      [id, blank, blank, blank, blank, blank, blank]
    );
    return publicProposition(rows[0]);
  }

  const now = new Date().toISOString();
  const doc = publicProposition({
    id,
    name: "",
    category: "",
    division: "",
    finalVerdict: "",
    finalVerdictNote: "",
    f1: { forumVerdict: "", verdictNote: "" },
    f2: { forumVerdict: "", verdictNote: "" },
    f3: { forumVerdict: "", verdictNote: "" },
    f4: { forumVerdict: "", verdictNote: "" },
    f5: { forumVerdict: "", verdictNote: "" },
    f6: { forumVerdict: "", verdictNote: "" },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const rows = await readPropFileStore();
  rows.unshift(doc);
  await writePropFileStore(rows);
  return doc;
}

export async function getPropositionById(id) {
  await initDb();
  if (!id) return null;

  if (usePostgres) {
    const rows = await query(`SELECT * FROM propositions WHERE id = $1`, [id]);
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const found = rows.find((r) => r.id === id);
  return found ? publicProposition(found) : null;
}

export async function listPropositions(limit = 100) {
  await initDb();
  const cap = Number.isFinite(Number(limit)) ? Math.min(200, Math.max(1, Math.floor(Number(limit)))) : 100;

  if (usePostgres) {
    const rows = await query(
      `SELECT id, name, category, division, final_verdict, version, created_at, updated_at
       FROM propositions
       ORDER BY updated_at DESC
       LIMIT $1`,
      [cap]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name || "",
      category: r.category || "",
      division: r.division || "",
      finalVerdict: r.final_verdict || "",
      version: Number(r.version) || 1,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }));
  }

  const rows = await readPropFileStore();
  return rows
    .map((r) => publicProposition(r))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, cap)
    .map((r) => ({
      id: r.id,
      name: r.name || "",
      category: r.category || "",
      division: r.division || "",
      finalVerdict: r.finalVerdict || "",
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
}

export async function updateProposition(id, payload) {
  await initDb();
  if (!id) return null;
  const body = payload && typeof payload === "object" ? payload : {};

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET
         name = $2,
         category = $3,
         division = $4,
         final_verdict = $5,
         final_verdict_note = $6,
         f1_json = $7,
         f2_json = $8,
         f3_json = $9,
         f4_json = $10,
         f5_json = $11,
         f6_json = $12,
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.name ?? "",
        body.category ?? "",
        body.division ?? "",
        normStoredVerdict(body.finalVerdict),
        body.finalVerdictNote ?? "",
        stringifyFilter(body.f1),
        stringifyFilter(body.f2),
        stringifyFilter(body.f3),
        stringifyFilter(body.f4),
        stringifyFilter(body.f5),
        stringifyFilter(body.f6),
      ]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const next = publicProposition({
    ...prev,
    name: body.name ?? "",
    category: body.category ?? "",
    division: body.division ?? "",
    finalVerdict: normStoredVerdict(body.finalVerdict) || "",
    finalVerdictNote: body.finalVerdictNote ?? "",
    f1: body.f1 && typeof body.f1 === "object" ? body.f1 : prev.f1,
    f2: body.f2 && typeof body.f2 === "object" ? body.f2 : prev.f2,
    f3: body.f3 && typeof body.f3 === "object" ? body.f3 : prev.f3,
    f4: body.f4 && typeof body.f4 === "object" ? body.f4 : prev.f4,
    f5: body.f5 && typeof body.f5 === "object" ? body.f5 : prev.f5,
    f6: body.f6 && typeof body.f6 === "object" ? body.f6 : prev.f6,
    version: (Number(prev.version) || 1) + 1,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  });
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

export async function deleteProposition(id) {
  await initDb();
  if (!id) return false;

  if (usePostgres) {
    const rows = await query(`DELETE FROM propositions WHERE id = $1 RETURNING id`, [id]);
    return rows.length > 0;
  }

  const rows = await readPropFileStore();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writePropFileStore(next);
  return true;
}

export async function runQuery(text, params = []) {
  await initDb();
  if (!usePostgres) {
    throw new Error("PostgreSQL is not configured.");
  }
  return query(text, params);
}
