/**
 * Ops alerts (Slack-down, backup lag). Never log secrets.
 */
import { postSlackWebhook } from "./managerReview.js";

const lastSent = new Map();

function alertWebhookUrl() {
  return String(
    process.env.OPS_ALERT_WEBHOOK_URL ||
      process.env.SLACK_ALERT_WEBHOOK_URL ||
      process.env.SLACK_WEBHOOK_URL ||
      ""
  ).trim();
}

/**
 * Raise a Slack-down style ops alert at most once per context per hour (unless force).
 */
export async function alertSlackDown({ context = "slack", detail = {}, force = false } = {}) {
  const key = `slack-down:${context}`;
  const now = Date.now();
  const prev = lastSent.get(key) || 0;
  if (!force && now - prev < 3600_000) {
    return { sent: false, skipped: "throttled" };
  }
  const url = alertWebhookUrl();
  if (!url) return { sent: false, skipped: "no-webhook" };
  const safeDetail = { ...detail };
  delete safeDetail.token;
  delete safeDetail.code;
  const text = `Primus alert: Slack delivery failed (${context}). ${JSON.stringify(safeDetail).slice(0, 400)}`;
  const result = await postSlackWebhook({ text }, { webhookUrl: url });
  if (result.posted) lastSent.set(key, now);
  return { sent: Boolean(result.posted), warning: result.warning || null };
}

/**
 * At most one backup-lag alert per calendar day (UTC).
 */
export async function alertBackupLag({ lastBackupAt = null, hours = 36 } = {}) {
  const key = "backup-lag";
  const day = new Date().toISOString().slice(0, 10);
  const prev = lastSent.get(key);
  if (prev === day) return { sent: false, skipped: "already-today" };
  const url = alertWebhookUrl();
  if (!url) return { sent: false, skipped: "no-webhook" };
  const when = lastBackupAt ? new Date(lastBackupAt).toISOString() : "never";
  const text = `Primus alert: no encrypted backup export for ${hours}+ hours (lastBackupAt=${when}).`;
  const result = await postSlackWebhook({ text }, { webhookUrl: url });
  if (result.posted) lastSent.set(key, day);
  return { sent: Boolean(result.posted), warning: result.warning || null };
}
