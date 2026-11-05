import { authRequired } from "./auth.js";
import { getPropositionById } from "./db.js";
import { canProceedToProofUpload, hasManagerApproval } from "./filterUnlock.js";
import { canRequestManagerReview } from "./managerReview.js";
import { canAccessIdea } from "./propositionAccess.js";
import {
  decideManagerReview,
  hydrateReviewOnDoc,
  previewManagerReviewRecipients,
  requestManagerReview,
} from "./managerReviewServer.js";
import { assertEvaluatedForWrite } from "./evaluationResponse.js";

export async function handleRequestManagerReview(req, res, id, { readBody, sendJson, redactSecrets: redact }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    if (body?.preview) {
      const preview = await previewManagerReviewRecipients({
        ideaId: id,
        user: req.user,
        teamOverride: body?.team || "",
      });
      sendJson(res, 200, { preview: true, ...preview });
      return;
    }
    const proposition = await getPropositionById(id);
    if (!proposition || !(await canAccessIdea(req.user, proposition))) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    try {
      assertEvaluatedForWrite(proposition);
    } catch (e) {
      if (e?.status === 409) {
        sendJson(res, 409, { error: "Evaluate this idea first", evaluationState: e.evaluationState });
        return;
      }
      throw e;
    }
    if (!canRequestManagerReview(proposition)) {
      const c = proposition.goNoGo?.classification;
      sendJson(res, 400, {
        error:
          c === "NO-GO"
            ? "NO-GO has no manager-review path."
            : c === "GO"
              ? "GO already unlocks proof upload — no manager review needed."
              : hasManagerApproval(proposition)
                ? "A manager has already approved this idea."
                : "Manager review is only available on a WATCH read.",
      });
      return;
    }
    const result = await requestManagerReview({ ideaId: id, user: req.user });
    const notices = [];
    if (result.adminFallback) {
      notices.push("No business head is mapped for this team (or you are the head) — ADMIN was notified.");
    }
    for (const u of result.unreachable || []) {
      notices.push(u.message);
    }
    sendJson(res, 200, {
      proposition: result.proposition,
      announce: result.announce,
      reason: result.reason,
      recipients: result.recipients,
      deliveries: result.deliveries,
      channelPosted: result.channelPosted,
      slackPosted: (result.deliveries || []).some((d) => d.ok),
      slackWarning: notices.length ? notices.join(" ") : null,
      unreachable: result.unreachable,
    });
  } catch (e) {
    const status = Number(e?.status) || 500;
    sendJson(res, status, { error: redact(e.message) });
  }
}

export async function handleManagerApprove(req, res, id, { readBody, sendJson, redactSecrets: redact }) {
  return handleManagerDecide(req, res, id, "approve", { readBody, sendJson, redactSecrets: redact });
}

export async function handleManagerReject(req, res, id, { readBody, sendJson, redactSecrets: redact }) {
  return handleManagerDecide(req, res, id, "reject", { readBody, sendJson, redactSecrets: redact });
}

async function handleManagerDecide(req, res, id, decision, { readBody, sendJson, redactSecrets: redact }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    if (authRequired() && !req.user) {
      sendJson(res, 401, { error: "Sign in required." });
      return;
    }
    const body = typeof readBody === "function" ? (await readBody(req)) || {} : req.body || {};
    const comment = body?.comment ?? body?.reason;
    const result = await decideManagerReview({
      ideaId: id,
      user: req.user,
      decision,
      comment,
    });
    sendJson(res, 200, {
      proposition: result.proposition,
      decision: result.decision,
      alreadyDecided: Boolean(result.alreadyDecided),
      unlocked: canProceedToProofUpload(result.proposition || {}),
    });
  } catch (e) {
    const status = Number(e?.status) || 500;
    sendJson(res, status, { error: redact(e.message) });
  }
}

export async function withHydratedReview(proposition) {
  if (!proposition) return proposition;
  return hydrateReviewOnDoc(proposition);
}
