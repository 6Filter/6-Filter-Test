/**
 * WATCH → manager review helpers. Browser-safe (no DB).
 * NO-GO has no override. Approval unlocks proof the same way GO does.
 */
import { canProceedToProofUpload, hasManagerApproval } from "./filterUnlock.js";
import { redactSecrets } from "./http.js";

export const MANAGER_APPROVE_ROLES = ["ADMIN", "BH FORUM"];
export const MIN_REVIEW_COMMENT = 10;

export function canRequestManagerReview(doc = {}) {
  const c = String(doc?.goNoGo?.classification || doc?.classification || "").trim();
  if (c !== "WATCH" || hasManagerApproval(doc)) return false;
  const state = doc?.managerReviewState;
  if (state?.isOpen) return false;
  if (state?.isApproved) return false;
  const review = doc?.managerReview || {};
  if (review.status === "rejected") return true;
  if (review.requestedAt && review.status !== "rejected" && !review.approvedAt && !hasManagerApproval(doc)) {
    // Open legacy request still pending.
    if (!state) return false;
  }
  // After rejection the owner can request again.
  return true;
}

export function canApproveManagerRole(role) {
  return MANAGER_APPROVE_ROLES.includes(String(role || "").trim());
}

/** UI helper — server still enforces team/ownership rules. */
export function viewerCanApproveManagerReview(user, doc = {}) {
  if (!user) return false;
  if (!canApproveManagerRole(user.role)) return false;
  const ownerEmail = String(doc?.createdByEmail || doc?.created_by_email || "").trim().toLowerCase();
  const email = String(user.email || "").trim().toLowerCase();
  if (ownerEmail && email && ownerEmail === email) return false;
  const state = doc?.managerReviewState;
  if (state && !state.isOpen) return false;
  return true;
}

export function viewerCanDecideManagerReview(user, doc = {}) {
  return viewerCanApproveManagerReview(user, doc) && Boolean(doc?.managerReviewState?.isOpen || doc?.managerReview?.requestedAt);
}

export function publicAppUrl() {
  const raw = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || process.env.ALLOWED_ORIGIN || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://ck-6-filter-test.onrender.com";
}

export function ideaDeepLinkPath(ideaId) {
  return `/propositions/${encodeURIComponent(String(ideaId || ""))}`;
}

export function ideaDeepLink(ideaId, appUrl = publicAppUrl()) {
  return `${String(appUrl || "").replace(/\/$/, "")}${ideaDeepLinkPath(ideaId)}`;
}

/** Legacy channel payload — used only when MANAGER_REVIEW_CHANNEL_COPY=1 (no idea name). */
export function slackChannelCopyPayload({ team, requesterName, reason } = {}) {
  return {
    text: `Manager review requested for a ${team || "team"} idea by ${requesterName || "someone"}${reason ? ` (${reason})` : ""}.`,
  };
}

/** @deprecated Prefer DMs; kept for older tests that still call the webhook helper. */
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
  { webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.MANAGER_REVIEW_WEBHOOK_URL, fetchImpl = globalThis.fetch } = {}
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
      email: user?.email || "",
      role: user?.role || "",
    },
    status: "requested",
  };
}

export function buildManagerApproval(existing, { comment, user } = {}) {
  const trimmed = String(comment || "").trim();
  if (!trimmed) throw new Error("A comment is required to approve.");
  if (trimmed.length < MIN_REVIEW_COMMENT) {
    throw new Error(`Comment must be at least ${MIN_REVIEW_COMMENT} characters.`);
  }
  const prev = existing && typeof existing === "object" ? existing : {};
  return {
    ...prev,
    comment: trimmed,
    managerUserId: user?.id || null,
    managerName: user?.name || user?.email || "",
    managerEmail: user?.email || "",
    managerRole: user?.role || "",
    approvedAt: new Date().toISOString(),
    status: "approved",
  };
}

/**
 * Derive display state from hydrated doc (events optional) + legacy JSON.
 */
export function reviewDisplayState(doc = {}, { now = Date.now() } = {}) {
  const state = doc?.managerReviewState;
  if (state?.statusKey) {
    return formatReviewLogLabel(state, { now });
  }
  if (hasManagerApproval(doc)) {
    const who = doc.managerApproval?.managerName || doc.managerReview?.managerName || "manager";
    const when = doc.managerApproval?.approvedAt || doc.managerReview?.approvedAt || "";
    const date = when ? new Date(when).toISOString().slice(0, 10) : "";
    return {
      label: `Approved by ${who}${date ? `, ${date}` : ""}`,
      statusKey: "approved",
      comment: doc.managerApproval?.comment || doc.managerReview?.comment || "",
    };
  }
  const review = doc.managerReview || {};
  if (review.status === "rejected") {
    const who = review.rejectedBy?.name || "manager";
    const when = review.rejectedAt || "";
    const date = when ? new Date(when).toISOString().slice(0, 10) : "";
    return {
      label: `Rejected by ${who}${date ? `, ${date}` : ""}`,
      statusKey: "rejected",
      comment: review.rejectReason || "",
    };
  }
  if (review.requestedAt) {
    const t = new Date(review.requestedAt).getTime();
    const days = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
    const waitingFor = review.announce?.match(/Business head:\s*([^(]+)/i)?.[1]?.trim()
      || review.waitingForName
      || "review";
    return {
      label: `Requested (waiting for ${waitingFor}, ${days}d)`,
      statusKey: "waiting",
      days,
    };
  }
  return { label: "—", statusKey: "none" };
}

export function formatReviewLogLabel(state, { now = Date.now() } = {}) {
  if (!state || state.statusKey === "none") return { label: "—", statusKey: "none" };
  if (state.statusKey === "waiting") {
    let waitingFor = "review";
    try {
      const raw = state.openRequest?.detail_json;
      const d = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (d?.waitingForName) waitingFor = d.waitingForName;
    } catch {
      /* ignore */
    }
    const t = new Date(state.openRequest?.created_at || state.openRequest?.createdAt || 0).getTime();
    const days = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
    return {
      label: `Requested (waiting for ${waitingFor}, ${days}d)`,
      statusKey: "waiting",
      days,
      comment: "",
    };
  }
  const when = state.decision?.created_at || state.decision?.createdAt || "";
  const date = when ? new Date(when).toISOString().slice(0, 10) : "";
  const who = state.decision?.actor_name || state.decision?.actor_email || "manager";
  if (state.statusKey === "approved") {
    return {
      label: `Approved by ${who}${date ? `, ${date}` : ""}`,
      statusKey: "approved",
      comment: state.decision?.comment || "",
    };
  }
  return {
    label: `Rejected by ${who}${date ? `, ${date}` : ""}`,
    statusKey: "rejected",
    comment: state.decision?.comment || "",
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
