/**
 * WATCH → manager review helpers. Browser-safe (no DB).
 * NO-GO has no override. Approval unlocks proof the same way GO does.
 */
import { canProceedToProofUpload, hasManagerApproval } from "./filterUnlock.js";
import { redactSecrets } from "./http.js";

export const MANAGER_APPROVE_ROLES = ["ADMIN", "BH FORUM"];

export function canRequestManagerReview(doc = {}) {
  const c = String(doc?.goNoGo?.classification || doc?.classification || "").trim();
  return c === "WATCH" && !hasManagerApproval(doc);
}

export function canApproveManagerRole(role) {
  return MANAGER_APPROVE_ROLES.includes(String(role || "").trim());
}

/** UI helper: signed-in managers, or anyone when no session user is present (auth parked). */
export function viewerCanApproveManagerReview(user) {
  if (!user) return true;
  return canApproveManagerRole(user.role);
}

export function publicAppUrl() {
  const raw = String(process.env.APP_PUBLIC_URL || process.env.ALLOWED_ORIGIN || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://ck-6-filter-test.onrender.com";
}

export function slackReviewPayload(proposition = {}, scorePct, appUrl = publicAppUrl()) {
  const name = String(proposition.name || "Untitled idea").trim() || "Untitled idea";
  const pct = Number.isFinite(Number(scorePct))
    ? Number(scorePct)
    : Number(proposition.goNoGo?.score?.pct);
  const shown = Number.isFinite(pct) ? `${pct}%` : "n/a";
  const id = proposition.id || "";
  return {
    text: `Manager review requested — "${name}" is WATCH (${shown}). Review: ${appUrl}/propositions/${id}`,
  };
}

export async function postSlackWebhook(
  payload,
  { webhookUrl = process.env.SLACK_WEBHOOK_URL, fetchImpl = globalThis.fetch } = {}
) {
  const url = String(webhookUrl || "").trim();
  if (!url) {
    return {
      posted: false,
      warning:
        "SLACK_WEBHOOK_URL is not set — the request is recorded in the app, but Slack was not notified.",
    };
  }
  if (typeof fetchImpl !== "function") {
    return { posted: false, warning: "Slack post is unavailable in this environment." };
  }
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { posted: false, warning: `Slack webhook returned ${res.status}.` };
    }
    return { posted: true };
  } catch (e) {
    return { posted: false, warning: redactSecrets(e.message || "Slack post failed.") };
  }
}

export function buildManagerReviewRequest(existing, user) {
  const prev = existing && typeof existing === "object" ? existing : {};
  return {
    ...prev,
    requestedAt: prev.requestedAt || new Date().toISOString(),
    requestedBy: {
      id: user?.id || null,
      name: user?.name || "",
      role: user?.role || "",
    },
  };
}

export function buildManagerApproval(existing, { comment, user } = {}) {
  const trimmed = String(comment || "").trim();
  if (!trimmed) throw new Error("A comment is required to approve.");
  const prev = existing && typeof existing === "object" ? existing : {};
  return {
    ...prev,
    comment: trimmed,
    managerUserId: user?.id || null,
    managerName: user?.name || user?.email || "",
    managerRole: user?.role || "",
    approvedAt: new Date().toISOString(),
  };
}

export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "just now";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export { canProceedToProofUpload, hasManagerApproval };
