import { authRequired } from "./auth.js";
import { getPropositionById, setPropositionManagerReview } from "./db.js";
import { canProceedToProofUpload, hasManagerApproval } from "./filterUnlock.js";
import {
  buildManagerApproval,
  buildManagerReviewRequest,
  canApproveManagerRole,
  canRequestManagerReview,
  postSlackWebhook,
  slackReviewPayload,
} from "./managerReview.js";

export async function handleRequestManagerReview(req, res, id, { sendJson, redactSecrets: redact }) {
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
    const proposition = await getPropositionById(id);
    if (!proposition) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
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
    const review = buildManagerReviewRequest(proposition.managerReview, req.user);
    const saved = await setPropositionManagerReview(id, review);
    const scorePct = saved?.goNoGo?.score?.pct;
    const slack = await postSlackWebhook(slackReviewPayload(saved || proposition, scorePct));
    sendJson(res, 200, {
      proposition: saved,
      slackPosted: slack.posted,
      slackWarning: slack.warning || null,
    });
  } catch (e) {
    sendJson(res, 500, { error: redact(e.message) });
  }
}

export async function handleManagerApprove(req, res, id, { readBody, sendJson, redactSecrets: redact }) {
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
    if (authRequired() && !canApproveManagerRole(req.user?.role)) {
      sendJson(res, 403, { error: "Only a manager (Admin or BH Forum) can approve a WATCH idea." });
      return;
    }
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const comment = body?.comment;
    const proposition = await getPropositionById(id);
    if (!proposition) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }
    const c = String(proposition.goNoGo?.classification || "").trim();
    if (c === "NO-GO") {
      sendJson(res, 400, { error: "NO-GO has no manager override." });
      return;
    }
    if (c !== "WATCH") {
      sendJson(res, 400, { error: "Manager approval is only for a WATCH read." });
      return;
    }
    if (hasManagerApproval(proposition)) {
      sendJson(res, 400, { error: "This idea already has a recorded manager approval." });
      return;
    }
    const review = buildManagerApproval(proposition.managerReview, { comment, user: req.user });
    const saved = await setPropositionManagerReview(id, review);
    sendJson(res, 200, {
      proposition: saved,
      unlocked: canProceedToProofUpload(saved),
    });
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("comment is required")) {
      sendJson(res, 400, { error: msg });
      return;
    }
    sendJson(res, 500, { error: redact(e.message) });
  }
}
