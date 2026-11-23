/**
 * MCP connector access: env allowlist, admin approval, and a one-time Slack notice.
 * The MCP URL alone never grants access. Empty MCP_ALLOWED_EMAILS means nobody (fail closed).
 */
import { usingPostgres, query } from "./db.js";

export const MCP_REQUEST_MESSAGE =
  "Your request was sent to the admin. You can connect again after they approve.";
export const MCP_PENDING_MESSAGE = "Your request is waiting for the admin to approve.";
export const MCP_DENIED_MESSAGE = "The admin did not approve connector access for this email.";
export const MCP_PILOT_MESSAGE = "This connector is in a limited pilot. Your email is not on the pilot list.";

const memory = new Map();
const NOTIFY_GAP_MS = 24 * 60 * 60 * 1000;

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function mcpAllowlist() {
  return String(process.env.MCP_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Env list only. Empty list is nobody. A lone * would mean every signed-in user — do not set that. */
export function envAllowsMcp(email) {
  const list = mcpAllowlist();
  if (!list.length) return false;
  if (list.includes("*")) return true;
  return list.includes(normEmail(email));
}

async function ensureAccessTable() {
  if (!usingPostgres()) return;
  await query(`CREATE TABLE IF NOT EXISTS mcp_access_requests (
    email TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    decided_by TEXT NOT NULL DEFAULT ''
  )`);
}

async function loadGrant(email) {
  const key = normEmail(email);
  if (!key) return null;
  if (!usingPostgres()) return memory.get(key) || null;
  await ensureAccessTable();
  const rows = await query(
    `SELECT email, status, requested_at, notified_at, decided_at, decided_by
     FROM mcp_access_requests WHERE email = $1`,
    [key]
  );
  return rows[0] || null;
}

function rowPublic(row) {
  if (!row) return null;
  return {
    email: row.email,
    status: row.status,
    requestedAt: row.requested_at || row.requestedAt || null,
    notifiedAt: row.notified_at || row.notifiedAt || null,
    decidedAt: row.decided_at || row.decidedAt || null,
    decidedBy: row.decided_by || row.decidedBy || "",
  };
}

export async function mcpAccessAllowed(email) {
  if (envAllowsMcp(email)) return true;
  const grant = await loadGrant(email);
  return String(grant?.status || "") === "approved";
}

export async function mcpAccessState(email) {
  if (envAllowsMcp(email)) return { allowed: true, status: "allowlist" };
  const grant = await loadGrant(email);
  const status = String(grant?.status || "");
  if (status === "approved") return { allowed: true, status };
  if (status === "pending" || status === "denied") return { allowed: false, status };
  return { allowed: false, status: "" };
}

export function mcpRefuseMessage(status) {
  if (status === "pending") return MCP_PENDING_MESSAGE;
  if (status === "denied") return MCP_DENIED_MESSAGE;
  if (status === "requested") return MCP_REQUEST_MESSAGE;
  return MCP_PILOT_MESSAGE;
}

async function saveGrant(row) {
  const email = normEmail(row.email);
  const next = {
    email,
    status: row.status,
    requested_at: row.requested_at || new Date().toISOString(),
    notified_at: row.notified_at || null,
    decided_at: row.decided_at || null,
    decided_by: row.decided_by || "",
  };
  if (!usingPostgres()) {
    memory.set(email, next);
    return next;
  }
  await ensureAccessTable();
  await query(
    `INSERT INTO mcp_access_requests (email, status, requested_at, notified_at, decided_at, decided_by)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6)
     ON CONFLICT (email) DO UPDATE SET
       status = EXCLUDED.status,
       requested_at = COALESCE(mcp_access_requests.requested_at, EXCLUDED.requested_at),
       notified_at = EXCLUDED.notified_at,
       decided_at = EXCLUDED.decided_at,
       decided_by = EXCLUDED.decided_by`,
    [email, next.status, next.requested_at, next.notified_at, next.decided_at, next.decided_by]
  );
  return next;
}

async function notifyAdmin(email) {
  const text = `6 Filter Test: ${normEmail(email)} asked to use the Claude connector. Approve or refuse in Admin → Connector.`;
  try {
    const { postSlackWebhook } = await import("./managerReview.js");
    const url =
      process.env.OPS_ALERT_WEBHOOK_URL ||
      process.env.SLACK_ALERT_WEBHOOK_URL ||
      process.env.SLACK_WEBHOOK_URL ||
      "";
    await postSlackWebhook({ text }, { webhookUrl: url });
  } catch {
    /* notice is best-effort; the request is still stored */
  }
}

/**
 * First try from someone not on the list: store pending and notify the admin (at most once a day).
 */
export async function requestMcpAccess(email) {
  const key = normEmail(email);
  if (!key) return { status: "", created: false, notified: false };
  if (envAllowsMcp(key)) return { status: "allowlist", created: false, notified: false };
  const existing = await loadGrant(key);
  const now = Date.now();
  if (String(existing?.status || "") === "approved") {
    return { status: "approved", created: false, notified: false };
  }
  if (String(existing?.status || "") === "denied") {
    return { status: "denied", created: false, notified: false };
  }
  const lastNote = existing?.notified_at ? new Date(existing.notified_at).getTime() : 0;
  const shouldNotify = !existing || !lastNote || now - lastNote >= NOTIFY_GAP_MS;
  const next = await saveGrant({
    email: key,
    status: "pending",
    requested_at: existing?.requested_at || new Date().toISOString(),
    notified_at: shouldNotify ? new Date().toISOString() : existing?.notified_at || null,
    decided_at: null,
    decided_by: "",
  });
  if (shouldNotify) await notifyAdmin(key);
  return { status: next.status, created: !existing, notified: shouldNotify };
}

export async function listMcpAccessRequests() {
  if (!usingPostgres()) {
    return [...memory.values()].map(rowPublic).sort((a, b) => String(a.email).localeCompare(b.email));
  }
  await ensureAccessTable();
  const rows = await query(
    `SELECT email, status, requested_at, notified_at, decided_at, decided_by
     FROM mcp_access_requests ORDER BY requested_at DESC`
  );
  return rows.map(rowPublic);
}

export async function decideMcpAccess(email, action, decidedBy = "") {
  const key = normEmail(email);
  if (!key) {
    const err = new Error("email is required.");
    err.status = 400;
    throw err;
  }
  const status = String(action || "").trim().toLowerCase() === "deny" ? "denied" : "approved";
  if (status !== "approved" && String(action || "").trim().toLowerCase() !== "deny") {
    const err = new Error("action must be approve or deny.");
    err.status = 400;
    throw err;
  }
  const existing = await loadGrant(key);
  const saved = await saveGrant({
    email: key,
    status,
    requested_at: existing?.requested_at || new Date().toISOString(),
    notified_at: existing?.notified_at || null,
    decided_at: new Date().toISOString(),
    decided_by: String(decidedBy || "").trim().toLowerCase().slice(0, 200),
  });
  return rowPublic(saved);
}

/** Test helper only. */
export function resetMcpAccessMemory() {
  memory.clear();
}
