import { noteSubmissionUsage } from "./submissionCost.js";
import { dataDir } from "./dataDir.js";

function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Additive daily ledger. Never reads or writes propositions.
 * Failures are logged and swallowed so a ledger miss cannot fail a score.
 */
export async function recordLlmUsage({
  department = "(unassigned)",
  label = "unlabeled",
  model = "",
  inputTokens = 0,
  outputTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  webSearches = 0,
  prefixHash = "",
  startedAt = "",
  endedAt = "",
  propositionId = "",
} = {}) {
  const row = {
    day: dayKey(),
    department: String(department || "(unassigned)").slice(0, 80),
    label: String(label || "unlabeled").slice(0, 80),
    model: String(model || "unknown").slice(0, 80),
    inputTokens: num(inputTokens),
    outputTokens: num(outputTokens),
    cacheReadTokens: num(cacheReadTokens),
    cacheWriteTokens: num(cacheWriteTokens),
    webSearches: num(webSearches),
  };
  const call = {
    ...row,
    prefixHash: String(prefixHash || "").slice(0, 16),
    startedAt: String(startedAt || ""),
    endedAt: String(endedAt || ""),
    propositionId: String(propositionId || "").slice(0, 80),
  };
  noteSubmissionUsage({
    label: row.label,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheRead: row.cacheReadTokens,
    cacheWrite: row.cacheWriteTokens,
    searches: row.webSearches,
    prefixHash: call.prefixHash,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
  });
  try {
    const db = await import("./db.js");
    await db.initDb();
    if (db.isUsingPostgres()) {
      await db.query(
        `INSERT INTO llm_usage_daily (
           day, department, label, model, calls,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches
         ) VALUES ($1::date, $2, $3, $4, 1, $5, $6, $7, $8, $9)
         ON CONFLICT (day, department, label, model) DO UPDATE SET
           calls = llm_usage_daily.calls + 1,
           input_tokens = llm_usage_daily.input_tokens + EXCLUDED.input_tokens,
           output_tokens = llm_usage_daily.output_tokens + EXCLUDED.output_tokens,
           cache_read_tokens = llm_usage_daily.cache_read_tokens + EXCLUDED.cache_read_tokens,
           cache_write_tokens = llm_usage_daily.cache_write_tokens + EXCLUDED.cache_write_tokens,
           web_searches = llm_usage_daily.web_searches + EXCLUDED.web_searches`,
        [
          row.day,
          row.department,
          row.label,
          row.model,
          row.inputTokens,
          row.outputTokens,
          row.cacheReadTokens,
          row.cacheWriteTokens,
          row.webSearches,
        ]
      );
      await insertCallRow(db, call);
      return;
    }
    await addFileUsage(row);
    await addFileCall(call);
  } catch (e) {
    console.warn(`[primus/cost] ledger write failed: ${e.message || e}`);
  }
}

async function usageFile() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "llm_usage_daily.json");
}

async function addFileUsage(row) {
  const { promises: fs } = await import("node:fs");
  const file = await usageFile();
  let rows = [];
  try {
    rows = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  const hit = rows.find(
    (r) => r.day === row.day && r.department === row.department && r.label === row.label && r.model === row.model
  );
  if (hit) {
    hit.calls += 1;
    hit.input_tokens += row.inputTokens;
    hit.output_tokens += row.outputTokens;
    hit.cache_read_tokens += row.cacheReadTokens;
    hit.cache_write_tokens += row.cacheWriteTokens;
    hit.web_searches += row.webSearches;
  } else {
    rows.push({
      day: row.day,
      department: row.department,
      label: row.label,
      model: row.model,
      calls: 1,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cache_read_tokens: row.cacheReadTokens,
      cache_write_tokens: row.cacheWriteTokens,
      web_searches: row.webSearches,
    });
  }
  await fs.writeFile(file, JSON.stringify(rows));
}

async function callsFile() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "llm_usage_calls.json");
}

async function insertCallRow(db, call) {
  await db.query(
    `INSERT INTO llm_usage_calls (
       day, department, label, model, prefix_hash,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches,
       started_at, ended_at, proposition_id
     ) VALUES (
       $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, $13
     )`,
    [
      call.day,
      call.department,
      call.label,
      call.model,
      call.prefixHash,
      call.inputTokens,
      call.outputTokens,
      call.cacheReadTokens,
      call.cacheWriteTokens,
      call.webSearches,
      call.startedAt || null,
      call.endedAt || null,
      call.propositionId,
    ]
  );
}

async function addFileCall(call) {
  const { promises: fs } = await import("node:fs");
  const file = await callsFile();
  let rows = [];
  try {
    rows = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  rows.push({
    day: call.day,
    department: call.department,
    label: call.label,
    model: call.model,
    prefix_hash: call.prefixHash,
    input_tokens: call.inputTokens,
    output_tokens: call.outputTokens,
    cache_read_tokens: call.cacheReadTokens,
    cache_write_tokens: call.cacheWriteTokens,
    web_searches: call.webSearches,
    started_at: call.startedAt,
    ended_at: call.endedAt,
    proposition_id: call.propositionId,
  });
  await fs.writeFile(file, JSON.stringify(rows));
}

export async function listLlmCalls({ propositionId = "" } = {}) {
  const db = await import("./db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    if (propositionId) {
      return db.query(
        `SELECT label, prefix_hash, cache_read_tokens, cache_write_tokens,
                input_tokens, output_tokens, web_searches, started_at, ended_at,
                department, proposition_id
         FROM llm_usage_calls
         WHERE proposition_id = $1
         ORDER BY started_at`,
        [propositionId]
      );
    }
    return db.query(
      `SELECT label, prefix_hash, cache_read_tokens, cache_write_tokens,
              input_tokens, output_tokens, web_searches, started_at, ended_at,
              department, proposition_id
       FROM llm_usage_calls
       ORDER BY started_at`
    );
  }
  const { promises: fs } = await import("node:fs");
  try {
    const rows = JSON.parse(await fs.readFile(await callsFile(), "utf8"));
    const list = Array.isArray(rows) ? rows : [];
    return propositionId ? list.filter((row) => row.proposition_id === propositionId) : list;
  } catch {
    return [];
  }
}

export async function listLlmUsage(days = 30) {
  const window = Math.min(365, Math.max(1, Number(days) || 30));
  const db = await import("./db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    return db.query(
      `SELECT day::text AS day, department, label, model, calls,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches
       FROM llm_usage_daily
       WHERE day >= (CURRENT_DATE - ($1::int - 1))
       ORDER BY day DESC, department, label`,
      [window]
    );
  }
  const { promises: fs } = await import("node:fs");
  try {
    const rows = JSON.parse(await fs.readFile(await usageFile(), "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
