/**
 * Credit / billing failure: ordinary users get one line; Admin keeps the detail.
 * Latch is per billing key (sha256 prefix, never the key itself), in memory only,
 * and expires after 60 seconds so a Monday top-up works without a redeploy.
 */
import { createHash } from "node:crypto";

export const CREDIT_EXHAUSTED_USER_COPY =
  "The AI account for 6 Filter Test has run out of credit. Please tell your admin.";

export const DEFAULT_CREDIT_LATCH_TTL_MS = 60_000;

const latches = new Map();
let lastAlertDay = "";

export function creditLatchTtlMs() {
  const n = Number(process.env.CREDIT_LATCH_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_CREDIT_LATCH_TTL_MS;
}

export function creditLatchId(apiKey) {
  return createHash("sha256")
    .update(String(apiKey || ""))
    .digest("hex")
    .slice(0, 16);
}

function prune(id) {
  const until = latches.get(id) || 0;
  if (!until || Date.now() >= until) {
    latches.delete(id);
    return false;
  }
  return true;
}

export function noteCreditExhausted(apiKey) {
  const id = creditLatchId(apiKey);
  latches.set(id, Date.now() + creditLatchTtlMs());
}

export function isCreditLatched(apiKey) {
  return prune(creditLatchId(apiKey));
}

/** @deprecated process-wide name kept so older call sites compile; pass the key. */
export function isPlatformCreditExhausted(apiKey) {
  return isCreditLatched(apiKey);
}

export function creditExhaustedAtMs(apiKey) {
  const until = latches.get(creditLatchId(apiKey)) || 0;
  if (!until) return 0;
  return until - creditLatchTtlMs();
}

export function clearCreditLatch(apiKey) {
  if (apiKey == null) latches.clear();
  else latches.delete(creditLatchId(apiKey));
}

export function resetCreditExhaustedForTests() {
  latches.clear();
  lastAlertDay = "";
}

export function isCreditExhaustedError(error) {
  return Boolean(error && error.code === "BILLING_CREDIT_EXHAUSTED");
}

export function creditMessageForViewer(isAdmin, adminDetail) {
  if (isAdmin && adminDetail) return String(adminDetail);
  return CREDIT_EXHAUSTED_USER_COPY;
}

/** One Slack post per UTC day when a webhook is set. Never includes secrets. */
export async function maybeAlertCreditExhausted(detail = "") {
  const day = new Date().toISOString().slice(0, 10);
  if (lastAlertDay === day) return false;
  const url = String(process.env.OPS_ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || "").trim();
  if (!url || !/^https:\/\//i.test(url)) return false;
  lastAlertDay = day;
  const text = `6 Filter Test: the AI account has run out of credit. Ordinary users see a short message. Admin: ${String(
    detail || ""
  )
    .replace(/sk-ant-[A-Za-z0-9\-_]+/g, "[redacted]")
    .slice(0, 180)}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return true;
  } catch {
    return false;
  }
}
