/**
 * Auth throttle, login codes, user audit, BH mapping, legacy team map.
 * Requires Postgres (auth never falls back to disk).
 */
import { randomUUID } from "node:crypto";
import { initDb, query, usingPostgres } from "./db.js";
import { normalizeEmail } from "./auth.js";
import { isCanonicalTeam, preserveSubmitterDepartment } from "./propositionFields.js";
import {
  CODE_TTL_MS,
  RATE_WINDOW_MS,
  hmacLoginCode,
  generateLoginCode,
} from "./loginCodes.js";

function requirePg() {
  if (!usingPostgres()) {
    const err = new Error("Database unavailable.");
    err.status = 503;
    err.code = "DB_UNAVAILABLE";
    throw err;
  }
}

export async function ensureAccessSchema() {
  await initDb();
  requirePg();
}

export async function checkDurableRateLimit(key, { max, windowMs = RATE_WINDOW_MS } = {}) {
  await ensureAccessSchema();
  requirePg();
  const k = String(key || "").slice(0, 200);
  const rows = await query(`SELECT count, reset_at FROM login_attempts WHERE key = $1`, [k]);
  const now = Date.now();
  let count = 0;
  let resetAt = now + windowMs;
  if (rows[0]) {
    resetAt = new Date(rows[0].reset_at).getTime();
    count = Number(rows[0].count) || 0;
    if (now > resetAt) {
      count = 0;
      resetAt = now + windowMs;
    }
  }
  count += 1;
  await query(
    `INSERT INTO login_attempts (key, count, reset_at, locked_until)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (key) DO UPDATE SET count = $2, reset_at = $3`,
    [k, count, new Date(resetAt).toISOString()]
  );
  return count <= max;
}

export async function replaceLoginCode(email) {
  await ensureAccessSchema();
  requirePg();
  const e = normalizeEmail(email);
  const code = generateLoginCode();
  const hmac = hmacLoginCode(code);
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await query(`DELETE FROM login_codes WHERE lower(email) = $1`, [e]);
  await query(
    `INSERT INTO login_codes (id, email, code_hmac, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, 0, NOW())`,
    [randomUUID(), e, hmac, expires]
  );
  return { code, expiresAt: expires };
}

export async function getLoginCodeRow(email) {
  await ensureAccessSchema();
  requirePg();
  const e = normalizeEmail(email);
  const rows = await query(
    `SELECT * FROM login_codes WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 1`,
    [e]
  );
  return rows[0] || null;
}

export async function consumeLoginCode(email) {
  await ensureAccessSchema();
  requirePg();
  await query(`DELETE FROM login_codes WHERE lower(email) = $1`, [normalizeEmail(email)]);
}

export async function bumpLoginCodeAttempts(email) {
  await ensureAccessSchema();
  requirePg();
  const e = normalizeEmail(email);
  const rows = await query(
    `UPDATE login_codes SET attempts = attempts + 1
     WHERE id = (
       SELECT id FROM login_codes WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 1
     )
     RETURNING *`,
    [e]
  );
  return rows[0] || null;
}

export async function cancelLoginCode(email) {
  return consumeLoginCode(email);
}

export async function writeUserAudit({ actorUserId = null, action, targetUserId = null, targetEmail = null, detail = {} }) {
  await ensureAccessSchema();
  requirePg();
  await query(
    `INSERT INTO user_audit (id, actor_user_id, action, target_user_id, target_email, detail_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      randomUUID(),
      actorUserId || null,
      String(action || "").slice(0, 80),
      targetUserId || null,
      targetEmail ? normalizeEmail(targetEmail) : null,
      JSON.stringify(detail && typeof detail === "object" ? detail : {}),
    ]
  );
}

export async function listBusinessHeadTeams() {
  await ensureAccessSchema();
  requirePg();
  return query(`SELECT email, team, note FROM business_head_teams ORDER BY email, team`);
}

export async function teamsForBusinessHead(email) {
  await ensureAccessSchema();
  requirePg();
  const rows = await query(`SELECT team FROM business_head_teams WHERE lower(email) = $1`, [
    normalizeEmail(email),
  ]);
  return rows.map((r) => preserveSubmitterDepartment(r.team)).filter(Boolean);
}

export async function replaceBusinessHeadTeams(rows, { actorUserId = null } = {}) {
  await ensureAccessSchema();
  requirePg();
  const cleaned = [];
  for (const row of rows || []) {
    const email = normalizeEmail(row.email);
    const team = preserveSubmitterDepartment(row.team);
    if (!email || !isCanonicalTeam(team)) continue;
    cleaned.push({ email, team, note: String(row.note || "").trim() });
  }
  await query(`DELETE FROM business_head_teams`);
  for (const row of cleaned) {
    await query(
      `INSERT INTO business_head_teams (email, team, note) VALUES ($1, $2, $3)
       ON CONFLICT (email, team) DO UPDATE SET note = EXCLUDED.note`,
      [row.email, row.team, row.note || null]
    );
  }
  await writeUserAudit({
    actorUserId,
    action: "import-business-head-teams",
    detail: { count: cleaned.length },
  });
  return cleaned;
}

export async function resolveCanonicalTeam(storedTeam) {
  const raw = preserveSubmitterDepartment(storedTeam);
  if (!raw) return "";
  if (isCanonicalTeam(raw)) return raw;
  await ensureAccessSchema();
  requirePg();
  const rows = await query(`SELECT team FROM legacy_team_map WHERE lower(alias) = $1 LIMIT 1`, [
    raw.toLowerCase(),
  ]);
  return rows[0] ? preserveSubmitterDepartment(rows[0].team) : "";
}

export async function listLegacyTeamMap() {
  await ensureAccessSchema();
  requirePg();
  return query(`SELECT alias, team FROM legacy_team_map ORDER BY alias`);
}

export async function upsertLegacyTeamMap(alias, team, { actorUserId = null } = {}) {
  await ensureAccessSchema();
  requirePg();
  const a = preserveSubmitterDepartment(alias);
  const t = preserveSubmitterDepartment(team);
  if (!a || !isCanonicalTeam(t)) {
    throw Object.assign(new Error("Alias and canonical team required."), { status: 400 });
  }
  await query(
    `INSERT INTO legacy_team_map (alias, team) VALUES ($1, $2)
     ON CONFLICT (alias) DO UPDATE SET team = EXCLUDED.team`,
    [a, t]
  );
  await writeUserAudit({
    actorUserId,
    action: "upsert-legacy-team-map",
    detail: { alias: a, team: t },
  });
}

let slackAlertAt = 0;
export async function maybeAlertSlackDown(message, { postSlackWebhook } = {}) {
  const now = Date.now();
  if (now - slackAlertAt < RATE_WINDOW_MS) return false;
  slackAlertAt = now;
  if (typeof postSlackWebhook === "function") {
    await postSlackWebhook({ text: message });
    return true;
  }
  return false;
}

/** Test helper — clear durable throttle rows (does not clear login_codes). */
export async function clearDurableRateLimits() {
  await ensureAccessSchema();
  requirePg();
  await query(`DELETE FROM login_attempts`);
}
