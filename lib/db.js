import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DIVISION_THRESHOLD_SEED } from "./divisionSeed.js";
import { unwrapResearchCachePayload, wrapResearchCachePayload } from "./researchCache.js";
import { asResearchDurationMs } from "./processTimer.js";
import { normalizeSubmitterDepartment } from "./propositionFields.js";
import { isMasterUnlock, LOG_MASTER_UNLOCK, normalizeLogUnlock } from "./departmentAuthConstants.js";
import { advisoryChecksFromLabels, isUntouchedDraft, rowTeam } from "./logStatus.js";
import { LIST_PROPOSITIONS_CAP } from "./lockedConstants.js";
import { propositionDocFromIdea, mergeIdeaHistoryIntoLog } from "./ideaHistoryBackfill.js";

const DATA_FILE = path.join(process.cwd(), "data", "ideas.json");
const PROP_FILE = path.join(process.cwd(), "data", "propositions.json");
const USER_FILE = path.join(process.cwd(), "data", "users.json");
const DIVISION_FILE = path.join(process.cwd(), "data", "division_thresholds.json");
const RESEARCH_CACHE_FILE = path.join(process.cwd(), "data", "research_cache.json");
const DEPT_PASSWORD_FILE = path.join(process.cwd(), "data", "department_passwords.json");
const DEPT_API_KEYS_FILE = path.join(process.cwd(), "data", "department_api_keys.json");
let dbReady = false;
let usePostgres = false;
let pool = null;
let pgRetryAfter = 0;

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** Exported for divisionConfig / migrations that need raw SQL on Postgres. */
export async function runQuery(text, params = []) {
  await initDb();
  if (!usePostgres) {
    throw new Error("runQuery requires PostgreSQL (DATABASE_URL).");
  }
  return query(text, params);
}

/** Trivial store touch so keep-alive can warm Postgres (or the local file store). */
export async function pingDatabase() {
  await initDb();
  if (usePostgres) {
    await query("SELECT 1");
    return { ok: true, db: "postgres", usePostgres: true };
  }
  await readPropFileStore();
  return { ok: true, db: "file", usePostgres: false };
}

/**
 * Render's blueprint DATABASE_URL uses the private hostname (dpg-…-a).
 * That name only resolves on Render's internal DNS. Local unlock, and some
 * Render deploys, get getaddrinfo ENOTFOUND. Point those hosts at the public
 * oregon hostname so team passwords can be checked.
 */
export function rewriteRenderDatabaseUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  // On Render the private hostname resolves. Rewriting it to the public host drops the connection.
  if (process.env.RENDER) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname || "";
    if (/^dpg-[a-z0-9]+-a$/i.test(host)) {
      parsed.hostname = `${host}.oregon-postgres.render.com`;
      if (!parsed.searchParams.get("sslmode")) parsed.searchParams.set("sslmode", "require");
      return parsed.toString();
    }
    return raw;
  } catch {
    return raw;
  }
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
    connectionTimeoutMillis: 15_000,
    family: 4,
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

async function ensureUserFileStore() {
  await fs.mkdir(path.dirname(USER_FILE), { recursive: true });
  try {
    await fs.access(USER_FILE);
  } catch {
    await fs.writeFile(USER_FILE, "[]", "utf8");
  }
}

async function readUserFileStore() {
  await ensureUserFileStore();
  const raw = await fs.readFile(USER_FILE, "utf8");
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function writeUserFileStore(rows) {
  await ensureUserFileStore();
  await fs.writeFile(USER_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function ensureResearchCacheFileStore() {
  await fs.mkdir(path.dirname(RESEARCH_CACHE_FILE), { recursive: true });
  try {
    await fs.access(RESEARCH_CACHE_FILE);
  } catch {
    await fs.writeFile(RESEARCH_CACHE_FILE, "{}", "utf8");
  }
}

async function readResearchCacheFileStore() {
  await ensureResearchCacheFileStore();
  const raw = await fs.readFile(RESEARCH_CACHE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeResearchCacheFileStore(map) {
  await ensureResearchCacheFileStore();
  await fs.writeFile(RESEARCH_CACHE_FILE, JSON.stringify(map, null, 2), "utf8");
}

function mapResearchCacheRow(row) {
  if (!row) return null;
  const unwrapped = unwrapResearchCachePayload(
    parseJsonCol(row.research_findings_json ?? row.researchFindingsJson ?? row.payload, null)
  );
  if (!unwrapped) return null;
  return {
    inputHash: row.input_hash ?? row.inputHash,
    ...unwrapped,
    division: row.division || null,
    providerUsed: row.provider_used ?? row.providerUsed ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export async function getResearchCache(inputHash) {
  await initDb();
  const hash = String(inputHash || "").trim();
  if (!hash) return null;

  if (usePostgres) {
    const rows = await query(`SELECT * FROM research_cache WHERE input_hash = $1`, [hash]);
    return mapResearchCacheRow(rows[0]);
  }

  const map = await readResearchCacheFileStore();
  return mapResearchCacheRow(map[hash] || null);
}

export async function saveResearchCache(inputHash, payload = {}) {
  await initDb();
  const hash = String(inputHash || "").trim();
  if (!hash) return null;
  const existing = await getResearchCache(hash);
  const merged = {
    researchFindings:
      payload.researchFindings !== undefined
        ? payload.researchFindings
        : existing?.researchFindings ?? {},
    suggestions: payload.suggestions !== undefined ? payload.suggestions : existing?.suggestions ?? null,
    sources: payload.sources !== undefined ? payload.sources : existing?.sources ?? [],
    notCovered: payload.notCovered !== undefined ? payload.notCovered : existing?.notCovered ?? [],
    filterNarratives:
      payload.filterNarratives !== undefined
        ? payload.filterNarratives
        : existing?.filterNarratives ?? null,
    narrativeChecksHash:
      payload.narrativeChecksHash !== undefined
        ? payload.narrativeChecksHash
        : existing?.narrativeChecksHash ?? "",
    division: payload.division !== undefined ? payload.division : existing?.division,
    providerUsed: payload.providerUsed !== undefined ? payload.providerUsed : existing?.providerUsed,
  };
  const wrapped = wrapResearchCachePayload(merged);
  const findingsJson = JSON.stringify(wrapped);
  const division = String(merged.division || "").trim() || null;
  const providerUsed = String(merged.providerUsed || "").trim() || null;
  const now = new Date().toISOString();

  if (usePostgres) {
    const rows = await query(
      `INSERT INTO research_cache (input_hash, research_findings_json, division, provider_used, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (input_hash) DO UPDATE SET
         research_findings_json = EXCLUDED.research_findings_json,
         division = EXCLUDED.division,
         provider_used = EXCLUDED.provider_used,
         created_at = NOW()
       RETURNING *`,
      [hash, findingsJson, division, providerUsed]
    );
    return mapResearchCacheRow(rows[0]);
  }

  const map = await readResearchCacheFileStore();
  map[hash] = {
    inputHash: hash,
    researchFindingsJson: wrapped,
    division,
    providerUsed,
    createdAt: now,
  };
  await writeResearchCacheFileStore(map);
  return mapResearchCacheRow(map[hash]);
}

function mapDivisionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    division_name: row.division_name ?? row.divisionName,
    min_net_margin_pct:
      row.min_net_margin_pct === undefined
        ? row.minNetMarginPct ?? null
        : row.min_net_margin_pct,
    revenue_target_all_channels_cr:
      row.revenue_target_all_channels_cr === undefined
        ? row.revenueTargetAllChannelsCr ?? null
        : row.revenue_target_all_channels_cr,
    revenue_target_ecom_mt_cr:
      row.revenue_target_ecom_mt_cr === undefined
        ? row.revenueTargetEcomMtCr ?? null
        : row.revenue_target_ecom_mt_cr,
    note: row.note ?? "",
    updated_at: row.updated_at ?? row.updatedAt ?? null,
  };
}

function seedDivisionRows() {
  return DIVISION_THRESHOLD_SEED.map((s) => ({
    id: randomUUID(),
    division_name: s.division_name,
    min_net_margin_pct: s.min_net_margin_pct,
    revenue_target_all_channels_cr: s.revenue_target_all_channels_cr,
    revenue_target_ecom_mt_cr: s.revenue_target_ecom_mt_cr,
    note: s.note || "",
    updated_at: new Date().toISOString(),
  }));
}

async function ensureDivisionFileStore() {
  await fs.mkdir(path.dirname(DIVISION_FILE), { recursive: true });
  try {
    await fs.access(DIVISION_FILE);
    const raw = await fs.readFile(DIVISION_FILE, "utf8");
    const rows = JSON.parse(raw);
    if (Array.isArray(rows) && rows.length > 0) return;
  } catch {
    /* seed below */
  }
  await fs.writeFile(DIVISION_FILE, JSON.stringify(seedDivisionRows(), null, 2), "utf8");
}

async function readDivisionFileStore() {
  await ensureDivisionFileStore();
  const raw = await fs.readFile(DIVISION_FILE, "utf8");
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows.map(mapDivisionRow) : [];
  } catch {
    return [];
  }
}

async function writeDivisionFileStore(rows) {
  await ensureDivisionFileStore();
  await fs.writeFile(DIVISION_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function seedDivisionThresholdsPostgres() {
  for (const s of DIVISION_THRESHOLD_SEED) {
    await query(
      `INSERT INTO division_thresholds (
         id, division_name, min_net_margin_pct, revenue_target_all_channels_cr,
         revenue_target_ecom_mt_cr, note
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (division_name) DO NOTHING`,
      [
        randomUUID(),
        s.division_name,
        s.min_net_margin_pct,
        s.revenue_target_all_channels_cr,
        s.revenue_target_ecom_mt_cr,
        s.note || "",
      ]
    );
  }
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash ?? row.passwordHash,
    role: row.role,
    division: row.division || "",
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
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
  const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (dbReady && usePostgres) return;
  if (dbReady && !usePostgres && rawUrl) {
    if (Date.now() < pgRetryAfter) return;
    dbReady = false;
    ideaBackfillRan = false;
  } else if (dbReady) {
    return;
  }
  pgRetryAfter = Date.now() + 20000;
  const url = rewriteRenderDatabaseUrl(rawUrl);
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
      "[primus/db] DATABASE_URL not set — using local file store data/ideas.json, data/propositions.json, and data/users.json. Set DATABASE_URL for PostgreSQL."
    );
    await ensureFileStore();
    await ensurePropFileStore();
    await ensureUserFileStore();
    await ensureDivisionFileStore();
    usePostgres = false;
    dbReady = true;
    console.log(
      `[primus/db] usePostgres=${usePostgres} — ${usePostgres ? "real Postgres, durable" : "FILE FALLBACK, NOT DURABLE ACROSS REDEPLOYS"}`
    );
    await bootstrapDepartmentPasswordsFromEnv();
    await backfillIdeasIntoPropositions();
    return;
  }

  const pgMod = await import("pg");
  const Pool = pgMod.Pool || pgMod.default?.Pool;
  const candidates = [];
  if (rawUrl) candidates.push(rawUrl);
  if (url && url !== rawUrl) candidates.push(url);

  let lastConnectError = null;
  for (const connectionString of candidates) {
    try {
      if (pool) {
        try {
          await pool.end();
        } catch {
          /* ignore */
        }
        pool = null;
      }
      pool = new Pool(pgPoolConfig(connectionString));
      await query("SELECT 1");
      lastConnectError = null;
      break;
    } catch (e) {
      lastConnectError = e;
      console.warn(`[primus/db] PostgreSQL connect failed (${e.code || e.message})`);
    }
  }

  if (lastConnectError) {
    console.error(
      `[primus/db] PostgreSQL unavailable (${lastConnectError.code || lastConnectError.message}). Falling back to file store so team unlock still works.`
    );
    try {
      await pool?.end();
    } catch {
      /* ignore */
    }
    pool = null;
    await ensureFileStore();
    await ensurePropFileStore();
    await ensureUserFileStore();
    await ensureDivisionFileStore();
    usePostgres = false;
    dbReady = true;
    console.log(
      `[primus/db] usePostgres=${usePostgres} — ${usePostgres ? "real Postgres, durable" : "FILE FALLBACK, NOT DURABLE ACROSS REDEPLOYS"}`
    );
    await bootstrapDepartmentPasswordsFromEnv();
    await backfillIdeasIntoPropositions();
    return;
  }

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
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS idea_description TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS attachment_json TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS research_run_at TIMESTAMPTZ`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS research_findings_json TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS proof_json TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS go_nogo_json TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS research_duration_ms INTEGER`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS submitter_name TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS submitter_department TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS manager_review_json TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS final_summary_json TEXT`);
  await query(`
    CREATE TABLE IF NOT EXISTS research_cache (
      input_hash TEXT PRIMARY KEY,
      research_findings_json TEXT NOT NULL,
      division TEXT,
      provider_used TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS division TEXT`);
  await query(`ALTER TABLE propositions ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS division_thresholds (
      id TEXT PRIMARY KEY,
      division_name TEXT UNIQUE NOT NULL,
      min_net_margin_pct DOUBLE PRECISION,
      revenue_target_all_channels_cr DOUBLE PRECISION,
      revenue_target_ecom_mt_cr DOUBLE PRECISION,
      note TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await seedDivisionThresholdsPostgres();

  await query(`
    CREATE TABLE IF NOT EXISTS department_passwords (
      department TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS department_api_keys (
      department TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  usePostgres = true;
  dbReady = true;
  console.log(
    `[primus/db] usePostgres=${usePostgres} — ${usePostgres ? "real Postgres, durable" : "FILE FALLBACK, NOT DURABLE ACROSS REDEPLOYS"}`
  );
  console.log("[primus/db] connected to PostgreSQL");
  await bootstrapDepartmentPasswordsFromEnv();
  await backfillIdeasIntoPropositions();
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
        if (existing) {
          await upsertPropositionFromIdea(existing);
          return existing;
        }
      }
      throw e;
    }
  } else {
    const rows = await readFileStore();
    if (hash) {
      const existing = rows.find((r) => r.input_hash === hash);
      if (existing) {
        const full = rowToFull(existing);
        await upsertPropositionFromIdea(full);
        return full;
      }
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
    await writeFileStore(rows);
  }

  const saved = rowToFull({
    id,
    idea_text: idea,
    status,
    result_json: resultJson,
    idea_type: ideaType,
    created_at: createdAt,
    ...npd,
  });
  await upsertPropositionFromIdea(saved);
  return saved;
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

async function ensureDepartmentPasswordFileStore() {
  await fs.mkdir(path.dirname(DEPT_PASSWORD_FILE), { recursive: true });
  try {
    await fs.access(DEPT_PASSWORD_FILE);
  } catch {
    await fs.writeFile(DEPT_PASSWORD_FILE, "{}", "utf8");
  }
}

async function readDepartmentPasswordFileStore() {
  await ensureDepartmentPasswordFileStore();
  const raw = await fs.readFile(DEPT_PASSWORD_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDepartmentPasswordFileStore(map) {
  await ensureDepartmentPasswordFileStore();
  await fs.writeFile(DEPT_PASSWORD_FILE, JSON.stringify(map, null, 2), "utf8");
}

/**
 * Built-in scrypt hashes for the current team passwords (and Master).
 * Used when Postgres is unreachable or a department_passwords row is missing.
 * Rotate with seedDepartmentPasswords.mjs — do not put plaintext here.
 */
const BUILTIN_DEPT_PASSWORD_HASHES = {
  "R&D": "643460b0c96d7921f9c0a6b730972785:c6a8720ee562302c8471c0c2ac3840ba63e0f6bb25dae65386bc922bdcae92a237b8be6ae62e38eec0811510d535720e72fd6091bd015337a540ebb58619fa86",
  CIA: "603ff0f00275ee889103186cc9f8b673:2fd191f89bc100a369eef8273dac439f50a6626304a45cbe2c9b63a8cbc28c3dff9d4a666fe785e46a51656692c2a3c1937da945b7b4f00aab70f64d8218f641",
  Marketing:
    "209b79c0922709c0f4c25003cc340d39:655570e388e73f63b37e00251e7610ca2970e75b7448711f10dd953c2ab6a06817298fa0506bc44c769b4ba0a70a4eb9c6dd993f830f9a103eb4e7cbc0ce4c08",
  NPD: "68d9f2c7bd76df3d44d974c12913bb5d:b723eefb26e301cfc61757f2c603cd774302a1a84285e2b0ce08cd18cae4d76249aeee7145334ac711f2eabc0efb61c5a453906bc32db7a7ee5ef048e7b68a38",
  [LOG_MASTER_UNLOCK]:
    "a2b0c59d5747bdf936efd65eee2e8e1e:2b8900c3fc09bae8eed1cafc107d905c2c3b2106b5e51dffdc4ce6f47b7d2357b497026f8a6f89dd07c660ed403a3210d477baf36e4897505f7f81faa7c14aac",
};

export function departmentPasswordHashFallbacks() {
  return {
    "R&D": String(process.env.DEPT_PASSWORD_HASH_RD || BUILTIN_DEPT_PASSWORD_HASHES["R&D"] || "").trim(),
    CIA: String(process.env.DEPT_PASSWORD_HASH_CIA || BUILTIN_DEPT_PASSWORD_HASHES.CIA || "").trim(),
    Marketing: String(
      process.env.DEPT_PASSWORD_HASH_MARKETING || BUILTIN_DEPT_PASSWORD_HASHES.Marketing || ""
    ).trim(),
    NPD: String(process.env.DEPT_PASSWORD_HASH_NPD || BUILTIN_DEPT_PASSWORD_HASHES.NPD || "").trim(),
    [LOG_MASTER_UNLOCK]: String(
      process.env.DEPT_PASSWORD_HASH_MASTER || BUILTIN_DEPT_PASSWORD_HASHES[LOG_MASTER_UNLOCK] || ""
    ).trim(),
  };
}

/** Lookup hash for a Log unlock identity (R&D / CIA / Marketing / NPD / Master). */
export async function getDepartmentPasswordHash(department) {
  const dept = normalizeLogUnlock(department);
  if (!dept) return "";
  const envFallback = departmentPasswordHashFallbacks();
  try {
    await initDb();
  } catch (e) {
    console.warn(`[primus/db] password hash lookup skipped store (${e.code || e.message})`);
    return envFallback[dept] || "";
  }

  if (usePostgres) {
    try {
      const rows = await query(`SELECT password_hash FROM department_passwords WHERE department = $1`, [dept]);
      const existing = String(rows[0]?.password_hash || "").trim();
      if (existing) return existing;
      const fromEnv = envFallback[dept] || "";
      if (fromEnv) {
        await upsertDepartmentPasswordHash(dept, fromEnv);
        console.log(`[primus/db] filled missing department_passwords row for ${dept} from env`);
        return fromEnv;
      }
      return "";
    } catch (e) {
      console.warn(`[primus/db] password hash query failed (${e.code || e.message})`);
      return envFallback[dept] || "";
    }
  }

  const map = await readDepartmentPasswordFileStore();
  const existing = String(map[dept]?.password_hash || "").trim();
  if (existing) return existing;
  const fromEnv = envFallback[dept] || "";
  if (fromEnv) {
    map[dept] = { password_hash: fromEnv, updated_at: new Date().toISOString() };
    await writeDepartmentPasswordFileStore(map);
    console.log(`[primus/db] filled missing department password file entry for ${dept} from env`);
    return fromEnv;
  }
  return "";
}

export async function upsertDepartmentPasswordHash(department, passwordHash) {
  await initDb();
  const dept = normalizeLogUnlock(department);
  const hash = String(passwordHash || "").trim();
  if (!dept || !hash) throw new Error("department and password_hash are required.");

  if (usePostgres) {
    await query(
      `INSERT INTO department_passwords (department, password_hash) VALUES ($1, $2)
       ON CONFLICT (department) DO UPDATE SET password_hash = $2, updated_at = now()`,
      [dept, hash]
    );
    return;
  }

  const map = await readDepartmentPasswordFileStore();
  map[dept] = { password_hash: hash, updated_at: new Date().toISOString() };
  await writeDepartmentPasswordFileStore(map);
}

/**
 * Additive bootstrap: copy DEPT_PASSWORD_HASH_* env values into the store only
 * for unlock identities that have no row yet. Never overwrites an existing hash
 * (so DB rotations stick) and never writes plaintext.
 */
export async function bootstrapDepartmentPasswordsFromEnv() {
  await initDb();
  const envHashes = departmentPasswordHashFallbacks();

  if (usePostgres) {
    const existing = await query(`SELECT department, password_hash FROM department_passwords`);
    const have = new Map(existing.map((r) => [r.department, String(r.password_hash || "").trim()]));
    let n = 0;
    for (const [dept, hash] of Object.entries(envHashes)) {
      if (!hash) continue;
      const current = have.get(dept) || "";
      // R&D / CIA / Marketing: fill missing only so manual rotations stick.
      // NPD / Master: heal to env/built-in when missing or mismatched (NPD was
      // partially seeded wrong once and blocked unlock forever).
      const mustHeal = dept === "NPD" || dept === LOG_MASTER_UNLOCK;
      if (current && !mustHeal) continue;
      if (current === hash) continue;
      await upsertDepartmentPasswordHash(dept, hash);
      n += 1;
    }
    if (n) console.log(`[primus/db] bootstrapped/healed ${n} department password hash(es) into Postgres`);
    return { bootstrapped: n > 0, count: n, store: "postgres", existing: existing.length };
  }

  const map = await readDepartmentPasswordFileStore();
  let n = 0;
  for (const [dept, hash] of Object.entries(envHashes)) {
    if (!hash) continue;
    const current = String(map[dept]?.password_hash || "").trim();
    const mustHeal = dept === "NPD" || dept === LOG_MASTER_UNLOCK;
    if (current && !mustHeal) continue;
    if (current === hash) continue;
    map[dept] = { password_hash: hash, updated_at: new Date().toISOString() };
    n += 1;
  }
  if (n) {
    await writeDepartmentPasswordFileStore(map);
    console.log(`[primus/db] bootstrapped/healed ${n} department password hash(es) into local file store`);
  }
  return { bootstrapped: n > 0, count: n, store: "file", existing: Object.keys(map).length };
}

async function ensureDepartmentApiKeysFileStore() {
  await fs.mkdir(path.dirname(DEPT_API_KEYS_FILE), { recursive: true });
  try {
    await fs.access(DEPT_API_KEYS_FILE);
  } catch {
    await fs.writeFile(DEPT_API_KEYS_FILE, "{}", "utf8");
  }
}

async function readDepartmentApiKeysFileStore() {
  await ensureDepartmentApiKeysFileStore();
  const raw = await fs.readFile(DEPT_API_KEYS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDepartmentApiKeysFileStore(map) {
  await ensureDepartmentApiKeysFileStore();
  await fs.writeFile(DEPT_API_KEYS_FILE, JSON.stringify(map, null, 2), "utf8");
}

/** Encrypted Anthropic key blob for a submitter team (not Master). */
export async function getDepartmentApiKeyCiphertext(department) {
  await initDb();
  const dept = normalizeLogUnlock(department);
  if (!dept || isMasterUnlock(dept)) return null;

  if (usePostgres) {
    const rows = await query(
      `SELECT ciphertext, iv, tag FROM department_api_keys WHERE department = $1`,
      [dept]
    );
    const row = rows[0];
    if (!row?.ciphertext) return null;
    return { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag };
  }

  const map = await readDepartmentApiKeysFileStore();
  const row = map[dept];
  if (!row?.ciphertext) return null;
  return { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag };
}

export async function upsertDepartmentApiKeyCiphertext(department, blob) {
  await initDb();
  const dept = normalizeLogUnlock(department);
  const ciphertext = String(blob?.ciphertext || "").trim();
  const iv = String(blob?.iv || "").trim();
  const tag = String(blob?.tag || "").trim();
  if (!dept || isMasterUnlock(dept) || !ciphertext || !iv || !tag) {
    throw new Error("department and ciphertext/iv/tag are required.");
  }

  if (usePostgres) {
    await query(
      `INSERT INTO department_api_keys (department, ciphertext, iv, tag) VALUES ($1, $2, $3, $4)
       ON CONFLICT (department) DO UPDATE SET ciphertext = $2, iv = $3, tag = $4, updated_at = now()`,
      [dept, ciphertext, iv, tag]
    );
    return;
  }

  const map = await readDepartmentApiKeysFileStore();
  map[dept] = { ciphertext, iv, tag, updated_at: new Date().toISOString() };
  await writeDepartmentApiKeysFileStore(map);
}

/**
 * Additive bootstrap: encrypt DEPT_API_KEY_* env values into the store only when
 * that team has no row yet. Never overwrites an existing ciphertext.
 * @param {(plaintext: string) => { ciphertext: string, iv: string, tag: string }} encryptFn
 */
export async function bootstrapDepartmentApiKeysFromEnv(encryptFn) {
  await initDb();
  if (typeof encryptFn !== "function") return { bootstrapped: false, count: 0 };

  const envPlain = {
    "R&D": String(process.env.DEPT_API_KEY_RD || "").trim(),
    CIA: String(process.env.DEPT_API_KEY_CIA || "").trim(),
    Marketing: String(process.env.DEPT_API_KEY_MARKETING || "").trim(),
    NPD: String(process.env.DEPT_API_KEY_NPD || "").trim(),
  };

  let n = 0;
  for (const [dept, plaintext] of Object.entries(envPlain)) {
    if (!plaintext || !plaintext.startsWith("sk-ant-")) continue;
    const existing = await getDepartmentApiKeyCiphertext(dept);
    if (existing?.ciphertext) continue;
    await upsertDepartmentApiKeyCiphertext(dept, encryptFn(plaintext));
    n += 1;
  }
  if (n) {
    console.log(
      `[primus/db] bootstrapped ${n} department API key(s) into ${usePostgres ? "Postgres" : "file"} store`
    );
  }
  return { bootstrapped: n > 0, count: n, store: usePostgres ? "postgres" : "file" };
}

function emptyFilterBlob() {
  return JSON.stringify({ forumVerdict: "", verdictNote: "" });
}

function stringifyFilter(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value.trim()) return value;
  return emptyFilterBlob();
}

function stringifyAttachment(value) {
  if (!value || typeof value !== "object") return null;
  const data = value.data != null ? String(value.data) : "";
  if (!data && !value.name) return null;
  return JSON.stringify({
    name: value.name || "upload",
    mediaType: value.mediaType || "application/octet-stream",
    data,
  });
}

function parseAttachment(value) {
  if (!value) return null;
  const parsed = typeof value === "string" ? parseJsonCol(value, null) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed.data != null ? String(parsed.data) : "";
  if (!data && !parsed.name) return null;
  return {
    name: parsed.name || "upload",
    mediaType: parsed.mediaType || "application/octet-stream",
    data,
    preview: parsed.preview || null,
  };
}

function normStoredVerdict(value) {
  if (value === "pass" || value === "fail") return value;
  return null;
}

function parseFilterNarratives(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of ["f1", "f2", "f3", "f4"]) {
    const text = String(value[key] || "").trim();
    if (text) out[key] = text;
  }
  return Object.keys(out).length ? out : null;
}

function parseGoNogo(value) {
  const parsed = typeof value === "string" ? parseJsonCol(value, null) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const classification = String(parsed.classification || "").trim();
  if (!["GO", "NO-GO", "WATCH"].includes(classification)) return null;
  const filterNarratives = parseFilterNarratives(parsed.filterNarratives);
  const score = parsed.score && typeof parsed.score === "object" ? parsed.score : null;
  const ideaScale = String(parsed.ideaScale || "").trim() || (classification ? "10g" : "");
  const ideaName = String(parsed.ideaName || "").trim();
  const category = String(parsed.category || "").trim();
  const checkLabels = parseCheckLabels(parsed.checkLabels);
  return {
    classification,
    rationale: String(parsed.rationale || "").trim(),
    at: parsed.at || null,
    ...(score ? { score } : {}),
    ...(filterNarratives ? { filterNarratives } : {}),
    ...(ideaScale ? { ideaScale } : {}),
    ...(ideaName ? { ideaName } : {}),
    ...(category ? { category } : {}),
    ...(checkLabels ? { checkLabels } : {}),
  };
}

function parseCheckLabels(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
    const raw = value[key];
    const label = typeof raw === "string" ? raw : raw?.checkLabel;
    if (label) out[key] = String(label);
  }
  return Object.keys(out).length ? out : null;
}

function stringifyGoNogo(value) {
  const parsed = parseGoNogo(value);
  return parsed ? JSON.stringify(parsed) : null;
}

function parseManagerReview(value) {
  const parsed = typeof value === "string" ? parseJsonCol(value, null) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const comment = String(parsed.comment || "").trim();
  const requestedBy =
    parsed.requestedBy && typeof parsed.requestedBy === "object"
      ? {
          id: parsed.requestedBy.id || null,
          name: String(parsed.requestedBy.name || "").trim(),
          role: String(parsed.requestedBy.role || "").trim(),
        }
      : null;
  return {
    requestedAt: parsed.requestedAt || null,
    requestedBy,
    comment,
    managerUserId: parsed.managerUserId || null,
    managerName: String(parsed.managerName || "").trim(),
    managerRole: String(parsed.managerRole || "").trim(),
    approvedAt: parsed.approvedAt || null,
  };
}

function managerApprovalFromReview(review) {
  if (!review || !String(review.comment || "").trim()) return null;
  return {
    comment: String(review.comment).trim(),
    managerUserId: review.managerUserId || null,
    managerName: review.managerName || "",
    managerRole: review.managerRole || "",
    approvedAt: review.approvedAt || null,
  };
}

function parseFinalSummary(value) {
  const parsed = typeof value === "string" ? parseJsonCol(value, null) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const summaryText = String(parsed.summaryText || "").trim();
  if (!summaryText && !parsed.expectedBusinessImpact) return null;
  return {
    expectedBusinessImpact: String(parsed.expectedBusinessImpact || "").trim(),
    summaryText,
    generatedAt: parsed.generatedAt || null,
    f6Result: String(parsed.f6Result || "").trim(),
    path: String(parsed.path || "").trim(),
  };
}

function publicProposition(row) {
  if (!row) return null;
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const updatedAt = row.updated_at ?? row.updatedAt ?? null;
  const researchRunAt = row.research_run_at ?? row.researchRunAt ?? null;
  const managerReview = parseManagerReview(row.manager_review_json ?? row.managerReview);
  return {
    id: row.id,
    name: row.name || "",
    category: row.category || "",
    division: row.division || "",
    createdByUserId: row.created_by_user_id ?? row.createdByUserId ?? null,
    submitterName: String(row.submitter_name ?? row.submitterName ?? "").trim(),
    submitterDepartment: normalizeSubmitterDepartment(row.submitter_department ?? row.submitterDepartment),
    ideaDescription: row.idea_description ?? row.ideaDescription ?? "",
    attachment: parseAttachment(row.attachment_json ?? row.attachment),
    marketResearchProof: parseAttachment(row.proof_json ?? row.marketResearchProof),
    goNoGo: parseGoNogo(row.go_nogo_json ?? row.goNoGo),
    researchRunAt: researchRunAt ? new Date(researchRunAt).toISOString() : null,
    researchDurationMs: asResearchDurationMs(row.research_duration_ms ?? row.researchDurationMs),
    researchFindings: parseJsonCol(row.research_findings_json ?? row.researchFindings, null),
    managerReview,
    managerApproval: managerApprovalFromReview(managerReview),
    finalSummary: parseFinalSummary(row.final_summary_json ?? row.finalSummary),
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

export async function createProposition({ createdByUserId, submitterDepartment } = {}) {
  await initDb();
  const id = randomUUID();
  const blank = emptyFilterBlob();
  const ownerId = createdByUserId ? String(createdByUserId) : null;
  const team = normalizeSubmitterDepartment(submitterDepartment);

  if (usePostgres) {
    const rows = await query(
      `INSERT INTO propositions (
         id, name, category, division, created_by_user_id, final_verdict, final_verdict_note,
         f1_json, f2_json, f3_json, f4_json, f5_json, f6_json, version, submitter_department
       ) VALUES ($1, '', '', '', $8, NULL, NULL, $2, $3, $4, $5, $6, $7, 1, $9)
       RETURNING *`,
      [id, blank, blank, blank, blank, blank, blank, ownerId, team || null]
    );
    return publicProposition(rows[0]);
  }

  const now = new Date().toISOString();
  const doc = publicProposition({
    id,
    name: "",
    category: "",
    division: "",
    createdByUserId: ownerId,
    submitterName: "",
    submitterDepartment: team,
    ideaDescription: "",
    attachment: null,
    marketResearchProof: null,
    goNoGo: null,
    researchRunAt: null,
    researchDurationMs: null,
    researchFindings: null,
    managerReview: null,
    managerApproval: null,
    finalSummary: null,
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
    if (rows[0]) return publicProposition(rows[0]);
    return hydratePropositionFromIdea(id);
  }

  const rows = await readPropFileStore();
  const found = rows.find((r) => r.id === id);
  if (found) return publicProposition(found);
  return hydratePropositionFromIdea(id);
}

export async function countPropositions() {
  await initDb();
  if (usePostgres) {
    const rows = await query(`SELECT COUNT(*)::int AS n FROM propositions`);
    return Number(rows[0]?.n) || 0;
  }
  const rows = await readPropFileStore();
  return rows.length;
}

export async function countIdeas() {
  await initDb();
  if (usePostgres) {
    const rows = await query(`SELECT COUNT(*)::int AS n FROM ideas`);
    return Number(rows[0]?.n) || 0;
  }
  const rows = await readFileStore();
  return rows.length;
}

let ideaBackfillRan = false;
let ideaBackfillRunning = false;

async function hydratePropositionFromIdea(id) {
  const idea = await getIdeaById(id);
  if (!idea) return null;
  return upsertPropositionFromIdea(idea);
}

export async function upsertPropositionFromIdea(idea) {
  if (!idea?.id) return null;
  const doc = publicProposition(propositionDocFromIdea(idea));
  if (!doc?.id) return null;

  if (usePostgres) {
    const existing = await query(`SELECT id FROM propositions WHERE id = $1`, [doc.id]);
    if (existing[0]) {
      const rows = await query(`SELECT * FROM propositions WHERE id = $1`, [doc.id]);
      return rows[0] ? publicProposition(rows[0]) : doc;
    }
    const blank = emptyFilterBlob();
    await query(
      `INSERT INTO propositions (
         id, name, category, division, created_by_user_id, idea_description,
         submitter_name, submitter_department, go_nogo_json, research_run_at,
         final_verdict, final_verdict_note,
         f1_json, f2_json, f3_json, f4_json, f5_json, f6_json,
         version, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, NULL, $5, $6, $7, $8, $9::timestamptz,
         NULL, NULL, $10, $11, $12, $13, $14, $15, 1, $16::timestamptz, $17::timestamptz
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        doc.id,
        doc.name,
        doc.category,
        doc.division,
        doc.ideaDescription,
        doc.submitterName,
        doc.submitterDepartment || null,
        stringifyGoNogo(doc.goNoGo),
        doc.researchRunAt,
        blank,
        blank,
        blank,
        blank,
        blank,
        blank,
        doc.createdAt,
        doc.updatedAt,
      ]
    );
    const rows = await query(`SELECT * FROM propositions WHERE id = $1`, [doc.id]);
    return rows[0] ? publicProposition(rows[0]) : doc;
  }

  const rows = await readPropFileStore();
  if (rows.some((r) => r.id === doc.id)) {
    return publicProposition(rows.find((r) => r.id === doc.id));
  }
  rows.unshift(doc);
  await writePropFileStore(rows);
  return doc;
}

export async function backfillIdeasIntoPropositions() {
  if (ideaBackfillRan || ideaBackfillRunning) return 0;
  ideaBackfillRunning = true;
  try {
    const ideas = await listIdeas(LIST_PROPOSITIONS_CAP);
    let n = 0;
    for (const idea of ideas) {
      const before = usePostgres
        ? (await query(`SELECT id FROM propositions WHERE id = $1`, [idea.id]))[0]
        : (await readPropFileStore()).find((r) => r.id === idea.id);
      if (before) continue;
      await upsertPropositionFromIdea(idea);
      n += 1;
    }
    ideaBackfillRan = true;
    if (n) console.log(`[primus/db] auto-populated ${n} historical ideas into the Log`);
    return n;
  } catch (e) {
    console.warn(`[primus/db] idea history backfill skipped (${e.message})`);
    return 0;
  } finally {
    ideaBackfillRunning = false;
  }
}

export async function listPropositions(limit = 100) {
  await initDb();
  const cap = Number.isFinite(Number(limit)) ? Math.min(LIST_PROPOSITIONS_CAP, Math.max(1, Math.floor(Number(limit)))) : 100;

  if (usePostgres) {
    const rows = await query(
      `SELECT id, name, category, division, created_by_user_id, submitter_name, submitter_department, idea_description,
              final_verdict, version, created_at, updated_at, final_summary_json, manager_review_json, go_nogo_json,
              research_run_at
       FROM propositions
       ORDER BY updated_at DESC
       LIMIT $1`,
      [cap]
    );
    const props = rows.map((r) => {
      const finalSummary = parseFinalSummary(r.final_summary_json);
      const managerReview = parseManagerReview(r.manager_review_json);
      let goNoGo = parseGoNogo(r.go_nogo_json);
      if (goNoGo?.classification && !goNoGo.ideaScale) {
        goNoGo = { ...goNoGo, ideaScale: "10g" };
      }
      return {
        id: r.id,
        name: r.name || "",
        category: r.category || "",
        division: r.division || "",
        createdByUserId: r.created_by_user_id || null,
        submitterName: String(r.submitter_name || "").trim(),
        submitterDepartment: normalizeSubmitterDepartment(r.submitter_department),
        ideaDescription: r.idea_description || "",
        finalVerdict: r.final_verdict || "",
        finalSummary,
        classification: goNoGo?.classification || "",
        goNoGo,
        managerReview,
        managerApproval: managerApprovalFromReview(managerReview),
        managerReviewRequested: Boolean(managerReview?.requestedAt),
        advisoryChecks: advisoryChecksFromLabels(goNoGo?.checkLabels),
        researchRunAt: r.research_run_at ? new Date(r.research_run_at).toISOString() : null,
        version: Number(r.version) || 1,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      };
    });
    const ideas = await listIdeas(cap);
    return mergeIdeaHistoryIntoLog(props, ideas, cap);
  }

  const rows = await readPropFileStore();
  const props = rows
    .map((r) => publicProposition(r))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, cap)
    .map((r) => ({
      id: r.id,
      name: r.name || "",
      category: r.category || "",
      division: r.division || "",
      createdByUserId: r.createdByUserId || null,
      submitterName: r.submitterName || "",
      submitterDepartment: r.submitterDepartment || "",
      ideaDescription: r.ideaDescription || "",
      finalVerdict: r.finalVerdict || "",
      finalSummary: r.finalSummary || null,
      classification: r.goNoGo?.classification || "",
      goNoGo: r.goNoGo || null,
      managerReview: r.managerReview || null,
      managerApproval: r.managerApproval || null,
      managerReviewRequested: Boolean(r.managerReview?.requestedAt),
      advisoryChecks: advisoryChecksFromLabels(r.goNoGo?.checkLabels),
      researchRunAt: r.researchRunAt || null,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  const ideas = await listIdeas(cap);
  return mergeIdeaHistoryIntoLog(props, ideas, cap);
}

export async function updateProposition(id, payload, { bumpVersion = true } = {}) {
  await initDb();
  if (!id) return null;
  const body = payload && typeof payload === "object" ? payload : {};
  const attachmentJson = stringifyAttachment(body.attachment);
  const proofJson =
    body.marketResearchProof === undefined
      ? undefined
      : stringifyAttachment(body.marketResearchProof);
  const goNogoJson =
    body.goNoGo === undefined ? undefined : stringifyGoNogo(body.goNoGo);

  if (usePostgres) {
    const existingRows = await query(
      `SELECT division, proof_json, go_nogo_json FROM propositions WHERE id = $1`,
      [id]
    );
    if (!existingRows[0]) return null;
    const existingDivision = String(existingRows[0].division || "").trim();
    const incomingDivision = String(body.division || "").trim();
    // Once set, division never changes — empty or a different client value cannot overwrite it.
    if (existingDivision && incomingDivision && incomingDivision !== existingDivision) {
      console.log(
        `[primus/division] lock — keep ${existingDivision}, ignore client ${incomingDivision}`
      );
    }
    const division = existingDivision || incomingDivision;
    const nextProofJson =
      proofJson !== undefined ? proofJson : existingRows[0].proof_json ?? null;
    const nextGoNogoJson =
      goNogoJson !== undefined ? goNogoJson : existingRows[0].go_nogo_json ?? null;

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
         idea_description = $13,
         attachment_json = $14,
         proof_json = $15,
         go_nogo_json = $16,
         research_duration_ms = COALESCE($17, research_duration_ms),
         submitter_name = COALESCE($18, submitter_name),
         submitter_department = COALESCE($19, submitter_department),
         version = version + $20,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.name ?? "",
        body.category ?? "",
        division,
        normStoredVerdict(body.finalVerdict),
        body.finalVerdictNote ?? "",
        stringifyFilter(body.f1),
        stringifyFilter(body.f2), // typed mrpInr + grammage; never recomputed on save
        stringifyFilter(body.f3),
        stringifyFilter(body.f4),
        stringifyFilter(body.f5),
        stringifyFilter(body.f6),
        body.ideaDescription ?? "",
        attachmentJson,
        nextProofJson,
        nextGoNogoJson,
        asResearchDurationMs(body.researchDurationMs),
        body.submitterName !== undefined ? String(body.submitterName ?? "").trim() : null,
        body.submitterDepartment !== undefined ? normalizeSubmitterDepartment(body.submitterDepartment) : null,
        bumpVersion ? 1 : 0,
      ]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const incomingDivision = String(body.division || "").trim();
  const existingDivision = String(prev.division || "").trim();
  if (existingDivision && incomingDivision && incomingDivision !== existingDivision) {
    console.log(
      `[primus/division] lock — keep ${existingDivision}, ignore client ${incomingDivision}`
    );
  }
  const division = existingDivision || incomingDivision;
  const next = publicProposition({
    ...prev,
    name: body.name ?? "",
    category: body.category ?? "",
    division,
    submitterName:
      body.submitterName !== undefined ? String(body.submitterName ?? "").trim() : prev.submitterName || "",
    submitterDepartment:
      body.submitterDepartment !== undefined
        ? normalizeSubmitterDepartment(body.submitterDepartment)
        : prev.submitterDepartment || "",
    ideaDescription: body.ideaDescription ?? "",
    attachment: parseAttachment(attachmentJson) || (body.attachment === null ? null : prev.attachment),
    marketResearchProof:
      body.marketResearchProof === undefined
        ? prev.marketResearchProof
        : parseAttachment(proofJson) || (body.marketResearchProof === null ? null : prev.marketResearchProof),
    goNoGo:
      body.goNoGo === undefined
        ? prev.goNoGo
        : parseGoNogo(goNogoJson) || (body.goNoGo === null ? null : prev.goNoGo),
    researchRunAt: prev.researchRunAt,
    researchDurationMs:
      asResearchDurationMs(body.researchDurationMs) ?? prev.researchDurationMs,
    researchFindings: prev.researchFindings,
    managerReview: prev.managerReview,
    managerApproval: prev.managerApproval,
    finalSummary: prev.finalSummary,
    finalVerdict: normStoredVerdict(body.finalVerdict) || "",
    finalVerdictNote: body.finalVerdictNote ?? "",
    f1: body.f1 && typeof body.f1 === "object" ? body.f1 : prev.f1,
    f2: body.f2 && typeof body.f2 === "object" ? body.f2 : prev.f2, // mrpInr + grammage stored as typed; no server recompute
    f3: body.f3 && typeof body.f3 === "object" ? body.f3 : prev.f3,
    f4: body.f4 && typeof body.f4 === "object" ? body.f4 : prev.f4,
    f5: body.f5 && typeof body.f5 === "object" ? body.f5 : prev.f5,
    f6: body.f6 && typeof body.f6 === "object" ? body.f6 : prev.f6,
    version: (Number(prev.version) || 1) + (bumpVersion ? 1 : 0),
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  });
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

/** Patch only the concept-card file name. Never rewrite the rest of the row. */
export async function setPropositionConceptCardName(id, conceptCardName) {
  await initDb();
  const name = String(conceptCardName || "").trim();
  if (!id || !name) return null;

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET
         f1_json = (
           COALESCE(NULLIF(btrim(f1_json), ''), '{}')::jsonb
           || jsonb_build_object('conceptCardName', $2::text)
         )::text,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const next = {
    ...prev,
    f1: { ...(prev.f1 || {}), conceptCardName: name },
    updatedAt: new Date().toISOString(),
  };
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

export async function setPropositionManagerReview(id, review) {
  await initDb();
  if (!id) return null;
  const payload = review && typeof review === "object" ? review : null;
  const json = payload ? JSON.stringify(payload) : null;

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET manager_review_json = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, json]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const next = publicProposition({
    ...prev,
    managerReview: payload,
    managerApproval: managerApprovalFromReview(payload),
    updatedAt: new Date().toISOString(),
  });
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

/** Writes once. Later calls return the existing closed-case record unchanged. */
export async function setPropositionFinalSummary(id, summary) {
  await initDb();
  if (!id) return null;
  const current = await getPropositionById(id);
  if (!current) return null;
  if (current.finalSummary?.summaryText) return current;
  const payload = summary && typeof summary === "object" ? summary : null;
  if (!payload?.summaryText) return current;
  const json = JSON.stringify(payload);

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET final_summary_json = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, json]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next = publicProposition({
    ...current,
    finalSummary: payload,
    updatedAt: new Date().toISOString(),
  });
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

export async function markResearchRun(id, findings = null) {
  await initDb();
  if (!id) return null;
  const findingsJson =
    findings && typeof findings === "object" ? JSON.stringify(findings) : null;

  if (usePostgres) {
    const rows = findingsJson
      ? await query(
          `UPDATE propositions SET research_run_at = NOW(), research_findings_json = $2 WHERE id = $1 RETURNING *`,
          [id, findingsJson]
        )
      : await query(`UPDATE propositions SET research_run_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const next = {
    ...prev,
    researchRunAt: new Date().toISOString(),
    researchFindings: findings && typeof findings === "object" ? findings : prev.researchFindings,
  };
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

/** Persist the input-page ProcessEta elapsed time. Does not bump version or re-run research. */
export async function setResearchDurationMs(id, ms) {
  const duration = asResearchDurationMs(ms);
  if (!id || duration == null) return null;
  await initDb();

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET research_duration_ms = $2 WHERE id = $1 RETURNING *`,
      [id, duration]
    );
    return rows[0] ? publicProposition(rows[0]) : null;
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  const next = { ...prev, researchDurationMs: duration };
  rows[idx] = next;
  await writePropFileStore(rows);
  return next;
}

export async function setPropositionDivision(id, division) {
  await initDb();
  if (!id) return null;
  const value = String(division || "").trim();
  if (!value) return getPropositionById(id);

  const current = await getPropositionById(id);
  if (!current) return null;
  const existing = String(current.division || "").trim();
  if (existing) {
    if (existing !== value) {
      console.log(`[primus/division] lock — already set division=${existing}, ignore ${value}`);
    }
    return current;
  }

  if (usePostgres) {
    const rows = await query(
      `UPDATE propositions SET division = $2, updated_at = NOW()
       WHERE id = $1 AND (division IS NULL OR BTRIM(division) = '')
       RETURNING *`,
      [id, value]
    );
    return rows[0] ? publicProposition(rows[0]) : getPropositionById(id);
  }

  const rows = await readPropFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = publicProposition(rows[idx]);
  if (String(prev.division || "").trim()) return prev;
  const next = { ...prev, division: value, updatedAt: new Date().toISOString() };
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

/**
 * Wipe propositions. Pass a submitter department (R&D / CIA / Marketing / NPD)
 * to scope the delete — never CavinKare business division. Unscoped wipe (null)
 * is Master / ADMIN only via the Log delete APIs.
 */
export async function deleteAllPropositions(scopedToDepartment = null) {
  await initDb();
  if (isMasterUnlock(scopedToDepartment)) {
    throw new Error("Pass null for a Master wipe, not the Master label.");
  }
  const dept = normalizeSubmitterDepartment(scopedToDepartment);

  if (usePostgres) {
    if (dept) {
      const rows = await query(`DELETE FROM propositions WHERE submitter_department = $1 RETURNING id`, [dept]);
      return rows.length;
    }
    const rows = await query(`DELETE FROM propositions RETURNING id`);
    return rows.length;
  }

  const rows = await readPropFileStore();
  if (dept) {
    const keep = rows.filter((r) => rowTeam(r) !== dept);
    const count = rows.length - keep.length;
    if (count) await writePropFileStore(keep);
    return count;
  }
  const count = rows.length;
  if (count) await writePropFileStore([]);
  return count;
}

/** Blank, never-researched drafts only — scoped the same way as delete-all. */
export async function deleteUntouchedDrafts(scopedToDepartment = null) {
  await initDb();
  if (isMasterUnlock(scopedToDepartment)) {
    throw new Error("Pass null for a Master wipe, not the Master label.");
  }
  const dept = normalizeSubmitterDepartment(scopedToDepartment);

  if (usePostgres) {
    if (dept) {
      const rows = await query(
        `DELETE FROM propositions
         WHERE research_run_at IS NULL
           AND (name IS NULL OR btrim(name) = '')
           AND (idea_description IS NULL OR btrim(idea_description) = '')
           AND submitter_department = $1
         RETURNING id`,
        [dept]
      );
      return rows.map((r) => r.id);
    }
    const rows = await query(
      `DELETE FROM propositions
       WHERE research_run_at IS NULL
         AND (name IS NULL OR btrim(name) = '')
         AND (idea_description IS NULL OR btrim(idea_description) = '')
       RETURNING id`
    );
    return rows.map((r) => r.id);
  }

  const rows = await readPropFileStore();
  const keep = [];
  const deleted = [];
  for (const row of rows) {
    if (dept && rowTeam(row) !== dept) {
      keep.push(row);
      continue;
    }
    if (isUntouchedDraft(row)) deleted.push(row.id);
    else keep.push(row);
  }
  if (deleted.length) await writePropFileStore(keep);
  return deleted;
}

export async function getUserById(id) {
  await initDb();
  if (!id) return null;
  if (usePostgres) {
    const rows = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return mapUserRow(rows[0]);
  }
  const rows = await readUserFileStore();
  return mapUserRow(rows.find((r) => r.id === id));
}

export async function getUserByEmail(email) {
  await initDb();
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return null;
  if (usePostgres) {
    const rows = await query(`SELECT * FROM users WHERE lower(email) = $1`, [needle]);
    return mapUserRow(rows[0]);
  }
  const rows = await readUserFileStore();
  return mapUserRow(rows.find((r) => String(r.email || "").toLowerCase() === needle));
}

export async function createUser({ id, name, email, passwordHash, role, division }) {
  await initDb();
  const row = {
    id: id || randomUUID(),
    name: String(name || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    password_hash: passwordHash,
    role: String(role || "").trim(),
    division: String(division || "").trim(),
    created_at: new Date().toISOString(),
  };
  if (!row.name || !row.email || !row.password_hash || !row.role) {
    throw new Error("name, email, password, and role are required.");
  }
  const existing = await getUserByEmail(row.email);
  if (existing) {
    const err = new Error(`A user with email ${row.email} already exists.`);
    err.status = 409;
    throw err;
  }
  if (usePostgres) {
    await query(
      `INSERT INTO users (id, name, email, password_hash, role, division) VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.id, row.name, row.email, row.password_hash, row.role, row.division || null]
    );
    return mapUserRow(row);
  }
  const rows = await readUserFileStore();
  rows.push({
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    division: row.division || "",
    createdAt: row.created_at,
  });
  await writeUserFileStore(rows);
  return mapUserRow(row);
}

export async function listDivisionThresholdRows() {
  await initDb();
  if (usePostgres) {
    const rows = await query(
      `SELECT id, division_name, min_net_margin_pct, revenue_target_all_channels_cr,
              revenue_target_ecom_mt_cr, note, updated_at
       FROM division_thresholds
       ORDER BY division_name`
    );
    return rows.map(mapDivisionRow);
  }
  const rows = await readDivisionFileStore();
  return rows
    .slice()
    .sort((a, b) => String(a.division_name).localeCompare(String(b.division_name)));
}

export async function updateDivisionThresholdRow(id, patch = {}) {
  await initDb();
  if (!id) return null;

  if (usePostgres) {
    const existing = await query(`SELECT * FROM division_thresholds WHERE id = $1`, [id]);
    if (!existing[0]) return null;
    const nextName =
      patch.division_name != null
        ? String(patch.division_name).trim()
        : existing[0].division_name;
    if (!nextName) {
      const err = new Error("division_name is required.");
      err.status = 400;
      throw err;
    }
    const rows = await query(
      `UPDATE division_thresholds SET
         division_name = $2,
         min_net_margin_pct = $3,
         revenue_target_all_channels_cr = $4,
         revenue_target_ecom_mt_cr = $5,
         note = $6,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        nextName,
        patch.min_net_margin_pct !== undefined
          ? nullableNumber(patch.min_net_margin_pct)
          : existing[0].min_net_margin_pct,
        patch.revenue_target_all_channels_cr !== undefined
          ? nullableNumber(patch.revenue_target_all_channels_cr)
          : existing[0].revenue_target_all_channels_cr,
        patch.revenue_target_ecom_mt_cr !== undefined
          ? nullableNumber(patch.revenue_target_ecom_mt_cr)
          : existing[0].revenue_target_ecom_mt_cr,
        patch.note !== undefined ? String(patch.note ?? "") : existing[0].note ?? "",
      ]
    );
    return mapDivisionRow(rows[0]);
  }

  const rows = await readDivisionFileStore();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const cur = rows[idx];
  const nextName =
    patch.division_name != null ? String(patch.division_name).trim() : cur.division_name;
  if (!nextName) {
    const err = new Error("division_name is required.");
    err.status = 400;
    throw err;
  }
  if (
    rows.some(
      (r, i) => i !== idx && String(r.division_name).toLowerCase() === nextName.toLowerCase()
    )
  ) {
    const err = new Error(`Division "${nextName}" already exists.`);
    err.status = 409;
    throw err;
  }
  const next = {
    ...cur,
    division_name: nextName,
    min_net_margin_pct:
      patch.min_net_margin_pct !== undefined
        ? nullableNumber(patch.min_net_margin_pct)
        : cur.min_net_margin_pct,
    revenue_target_all_channels_cr:
      patch.revenue_target_all_channels_cr !== undefined
        ? nullableNumber(patch.revenue_target_all_channels_cr)
        : cur.revenue_target_all_channels_cr,
    revenue_target_ecom_mt_cr:
      patch.revenue_target_ecom_mt_cr !== undefined
        ? nullableNumber(patch.revenue_target_ecom_mt_cr)
        : cur.revenue_target_ecom_mt_cr,
    note: patch.note !== undefined ? String(patch.note ?? "") : cur.note || "",
    updated_at: new Date().toISOString(),
  };
  rows[idx] = next;
  await writeDivisionFileStore(rows);
  return mapDivisionRow(next);
}

export async function createDivisionThresholdRow(payload = {}) {
  await initDb();
  const division_name = String(payload.division_name || "").trim();
  if (!division_name) {
    const err = new Error("division_name is required.");
    err.status = 400;
    throw err;
  }
  const row = {
    id: randomUUID(),
    division_name,
    min_net_margin_pct: nullableNumber(payload.min_net_margin_pct),
    revenue_target_all_channels_cr: nullableNumber(payload.revenue_target_all_channels_cr),
    revenue_target_ecom_mt_cr: nullableNumber(payload.revenue_target_ecom_mt_cr),
    note: String(payload.note || ""),
    updated_at: new Date().toISOString(),
  };

  if (usePostgres) {
    try {
      const rows = await query(
        `INSERT INTO division_thresholds (
           id, division_name, min_net_margin_pct, revenue_target_all_channels_cr,
           revenue_target_ecom_mt_cr, note
         ) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          row.id,
          row.division_name,
          row.min_net_margin_pct,
          row.revenue_target_all_channels_cr,
          row.revenue_target_ecom_mt_cr,
          row.note,
        ]
      );
      return mapDivisionRow(rows[0]);
    } catch (e) {
      if (String(e?.code) === "23505" || /unique/i.test(String(e?.message || ""))) {
        const err = new Error(`Division "${division_name}" already exists.`);
        err.status = 409;
        throw err;
      }
      throw e;
    }
  }

  const rows = await readDivisionFileStore();
  if (rows.some((r) => String(r.division_name).toLowerCase() === division_name.toLowerCase())) {
    const err = new Error(`Division "${division_name}" already exists.`);
    err.status = 409;
    throw err;
  }
  rows.push(row);
  await writeDivisionFileStore(rows);
  return mapDivisionRow(row);
}
