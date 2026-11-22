/**
 * Credit / billing failure: ordinary users get one line; Admin keeps the detail.
 * A process-wide latch stops later AI calls in the same screening so we do not
 * wait through every remaining step.
 */
export const CREDIT_EXHAUSTED_USER_COPY =
  "The AI account for 6 Filter Test has run out of credit. Please tell your admin.";

let exhausted = false;
let exhaustedAtMs = 0;
let lastAlertDay = "";

export function noteCreditExhausted() {
  exhausted = true;
  exhaustedAtMs = Date.now();
}

export function isPlatformCreditExhausted() {
  return exhausted;
}

export function creditExhaustedAtMs() {
  return exhaustedAtMs;
}

export function resetCreditExhaustedForTests() {
  exhausted = false;
  exhaustedAtMs = 0;
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
