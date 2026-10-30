/**
 * Append-only manager review history. Current state is derived from latest events.
 */
import { randomUUID } from "node:crypto";
import { initDb, query, usingPostgres } from "./db.js";
import { normalizeEmail } from "./auth.js";

export const REVIEW_EVENTS = Object.freeze([
  "requested",
  "notified",
  "approved",
  "rejected",
  "reminded",
  "closed",
]);

export async function ensureManagerReviewEventsSchema() {
  await initDb();
  if (!usingPostgres()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS manager_review_events (
      id TEXT PRIMARY KEY,
      idea_id TEXT NOT NULL,
      event TEXT NOT NULL,
      actor_email TEXT,
      actor_name TEXT,
      comment TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS manager_review_events_idea_idx ON manager_review_events (idea_id, created_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS backup_exports (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      row_counts_json TEXT NOT NULL DEFAULT '{}',
      sha256 TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function appendManagerReviewEvent({
  ideaId,
  event,
  actorEmail = null,
  actorName = null,
  comment = null,
  detail = {},
} = {}) {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres()) {
    const err = new Error("Database unavailable.");
    err.status = 503;
    throw err;
  }
  const ev = String(event || "").trim();
  if (!REVIEW_EVENTS.includes(ev)) throw new Error(`Unknown review event: ${ev}`);
  const id = randomUUID();
  await query(
    `INSERT INTO manager_review_events (id, idea_id, event, actor_email, actor_name, comment, detail_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [
      id,
      String(ideaId || ""),
      ev,
      actorEmail ? normalizeEmail(actorEmail) : null,
      actorName ? String(actorName).trim().slice(0, 200) : null,
      comment ? String(comment).trim().slice(0, 4000) : null,
      JSON.stringify(detail && typeof detail === "object" ? detail : {}),
    ]
  );
  return id;
}

export async function listManagerReviewEvents(ideaId, { limit = 100 } = {}) {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres() || !ideaId) return [];
  return query(
    `SELECT * FROM manager_review_events WHERE idea_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [String(ideaId), Math.min(500, Math.max(1, Number(limit) || 100))]
  );
}

export async function listLatestReviewEventsByIdea(ideaIds = []) {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres()) return new Map();
  const ids = [...new Set((ideaIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await query(
    `SELECT DISTINCT ON (idea_id) *
     FROM manager_review_events
     WHERE idea_id = ANY($1::text[])
     ORDER BY idea_id, created_at DESC`,
    [ids]
  );
  // Need full history for status; fetch all for these ideas
  const all = await query(
    `SELECT * FROM manager_review_events WHERE idea_id = ANY($1::text[]) ORDER BY created_at ASC`,
    [ids]
  );
  const map = new Map();
  for (const row of all) {
    const list = map.get(row.idea_id) || [];
    list.push(row);
    map.set(row.idea_id, list);
  }
  void rows;
  return map;
}

/**
 * Derive current review status from event history + legacy manager_review_json.
 */
export function reviewStateFromEvents(events = [], legacyReview = null, legacyApproval = null) {
  const rows = Array.isArray(events) ? events : [];
  let openRequest = null;
  let decision = null;
  let lastNotified = null;
  let lastReminded = null;

  for (const row of rows) {
    const ev = String(row.event || "");
    if (ev === "requested") {
      openRequest = row;
      decision = null;
    } else if (ev === "notified") {
      lastNotified = row;
    } else if (ev === "reminded") {
      lastReminded = row;
    } else if (ev === "approved" || ev === "rejected") {
      decision = row;
      openRequest = null;
    } else if (ev === "closed") {
      openRequest = null;
      if (!decision) decision = row;
    }
  }

  // Legacy stored approval still counts when no event decision exists.
  const legacyComment = String(legacyApproval?.comment || legacyReview?.comment || "").trim();
  if (!decision && legacyComment) {
    decision = {
      event: "approved",
      actor_name: legacyApproval?.managerName || legacyReview?.managerName || "",
      actor_email: null,
      comment: legacyComment,
      created_at: legacyApproval?.approvedAt || legacyReview?.approvedAt || null,
      legacy: true,
    };
  }

  const legacyRequested =
    !openRequest &&
    !decision &&
    legacyReview?.requestedAt &&
    !legacyComment
      ? {
          event: "requested",
          actor_name: legacyReview?.requestedBy?.name || "",
          actor_email: null,
          created_at: legacyReview.requestedAt,
          legacy: true,
        }
      : null;

  if (!openRequest && legacyRequested) openRequest = legacyRequested;

  return {
    openRequest,
    decision,
    lastNotified,
    lastReminded,
    isOpen: Boolean(openRequest),
    isApproved: decision?.event === "approved",
    isRejected: decision?.event === "rejected",
    statusKey: decision?.event === "approved"
      ? "approved"
      : decision?.event === "rejected"
        ? "rejected"
        : openRequest
          ? "waiting"
          : "none",
  };
}

export function formatReviewLogLabel(state, { now = Date.now() } = {}) {
  if (!state || state.statusKey === "none") return { label: "—", statusKey: "none" };
  if (state.statusKey === "waiting") {
    const name = state.openRequest?.actor_name || "manager";
    const t = new Date(state.openRequest?.created_at || state.openRequest?.createdAt || 0).getTime();
    const days = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
    // Waiting for decision-maker name if present in detail, else requester wait copy:
    const waitingFor = state.openRequest?.detail_json
      ? (() => {
          try {
            const d = typeof state.openRequest.detail_json === "string"
              ? JSON.parse(state.openRequest.detail_json)
              : state.openRequest.detail_json;
            return d?.waitingForName || null;
          } catch {
            return null;
          }
        })()
      : null;
    return {
      label: `Requested (waiting for ${waitingFor || "review"}, ${days}d)`,
      statusKey: "waiting",
      requesterName: name,
      days,
    };
  }
  const when = state.decision?.created_at || state.decision?.createdAt || "";
  const date = when ? new Date(when).toISOString().slice(0, 10) : "";
  const who = state.decision?.actor_name || state.decision?.actor_email || "manager";
  if (state.statusKey === "approved") {
    return { label: `Approved by ${who}${date ? `, ${date}` : ""}`, statusKey: "approved", comment: state.decision?.comment || "" };
  }
  return { label: `Rejected by ${who}${date ? `, ${date}` : ""}`, statusKey: "rejected", comment: state.decision?.comment || "" };
}

export async function recordBackupExport({ actorEmail = null, rowCounts = {}, sha256 = "" } = {}) {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres()) return null;
  const id = randomUUID();
  await query(
    `INSERT INTO backup_exports (id, actor_email, row_counts_json, sha256, created_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [id, actorEmail ? normalizeEmail(actorEmail) : null, JSON.stringify(rowCounts), String(sha256 || "")]
  );
  return id;
}

export async function latestBackupAt() {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres()) return null;
  const rows = await query(`SELECT created_at FROM backup_exports ORDER BY created_at DESC LIMIT 1`);
  return rows[0]?.created_at || null;
}

export async function countBackupExportsSince(iso) {
  await ensureManagerReviewEventsSchema();
  if (!usingPostgres()) return 0;
  const rows = await query(
    `SELECT count(*)::int AS n FROM backup_exports WHERE created_at >= $1::timestamptz`,
    [iso]
  );
  return Number(rows[0]?.n) || 0;
}
