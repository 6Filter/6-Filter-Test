/**
 * Server-only manager review: BH DMs, events, approve/reject.
 */
import {
  getPropositionById,
  getUserByEmail,
  listUsers,
  query,
  setPropositionManagerReview,
  usingPostgres,
} from "./db.js";
import { normalizeEmail } from "./auth.js";
import { resolveCanonicalTeam } from "./accessDb.js";
import { canAccessIdea } from "./propositionAccess.js";

function isAdminSession(user) {
  return String(user?.role || "").trim() === "ADMIN";
}
import { sendSlackLoginCodeDm } from "./slackAuth.js";
import { alertSlackDown } from "./alerts.js";
import {
  appendManagerReviewEvent,
  ensureManagerReviewEventsSchema,
  listManagerReviewEvents,
  reviewStateFromEvents,
} from "./managerReviewEvents.js";
import {
  buildManagerApproval,
  ideaDeepLink,
  MIN_REVIEW_COMMENT,
  postSlackWebhook,
  slackChannelCopyPayload,
} from "./managerReview.js";
import { hasManagerApproval } from "./filterUnlock.js";

/** Submitter team only — never CK division (e.g. Ambient Dairy). */
function ideaTeam(doc) {
  return String(doc?.submitterDepartment || doc?.submitter_department || "").trim();
}

function classificationOf(doc) {
  return String(doc?.goNoGo?.classification || doc?.classification || "").trim();
}

function scorePctOf(doc) {
  const pct = Number(doc?.goNoGo?.score?.pct);
  return Number.isFinite(pct) ? pct : 0;
}

export async function getBusinessHeadEmailsForTeam(team) {
  const canonical = (await resolveCanonicalTeam(team)) || String(team || "").trim();
  if (!canonical || !usingPostgres()) return [];
  const rows = await query(
    `SELECT DISTINCT lower(email) AS email FROM business_head_teams WHERE team = $1 ORDER BY 1`,
    [canonical]
  );
  return rows.map((r) => normalizeEmail(r.email)).filter(Boolean);
}

export async function listAdminEmails() {
  if (!usingPostgres()) return [];
  const rows = await query(`SELECT lower(email) AS email FROM users WHERE role = 'ADMIN' ORDER BY email`);
  return rows.map((r) => normalizeEmail(r.email)).filter(Boolean);
}

export async function hydrateReviewOnDoc(doc) {
  if (!doc?.id) return doc;
  await ensureManagerReviewEventsSchema();
  const events = usingPostgres() ? await listManagerReviewEvents(doc.id) : [];
  const state = reviewStateFromEvents(events, doc.managerReview, doc.managerApproval);
  const derivedApproval =
    doc.managerApproval ||
    (state.isApproved
      ? {
          comment: state.decision?.comment || "",
          managerName: state.decision?.actor_name || "",
          approvedAt: state.decision?.created_at || null,
        }
      : null);
  return {
    ...doc,
    managerReviewState: state,
    managerReviewEvents: events,
    managerApproval: derivedApproval,
    managerReview: {
      ...(doc.managerReview || {}),
      ...(state.openRequest
        ? {
            requestedAt: state.openRequest.created_at || doc.managerReview?.requestedAt,
            requestedBy: {
              name: state.openRequest.actor_name,
              email: state.openRequest.actor_email,
              ...(doc.managerReview?.requestedBy || {}),
            },
            status: "requested",
          }
        : {}),
      ...(state.isApproved
        ? {
            comment: state.decision?.comment,
            managerName: state.decision?.actor_name,
            approvedAt: state.decision?.created_at,
            status: "approved",
          }
        : {}),
      ...(state.isRejected
        ? {
            rejectReason: state.decision?.comment,
            rejectedAt: state.decision?.created_at,
            status: "rejected",
          }
        : {}),
    },
  };
}

export async function resolveReviewRecipients(doc, requester) {
  const teamRaw = ideaTeam(doc);
  const team = (await resolveCanonicalTeam(teamRaw)) || teamRaw;
  const headEmails = await getBusinessHeadEmailsForTeam(team);
  const requesterEmail = normalizeEmail(requester?.email);

  // WATCH approvals go only to business heads of the idea's submitter team — never ADMIN.
  let reason = "team-heads";
  let emails = headEmails.filter((e) => e && e !== requesterEmail);
  if (!headEmails.length) {
    reason = "no-head";
    emails = [];
  } else if (!emails.length) {
    // Requester is the only mapped head for this team — cannot self-approve.
    reason = "requester-is-sole-head";
    emails = [];
  }

  const users = await listUsers();
  const byEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  const recipients = [];
  for (const email of emails) {
    const u = byEmail.get(normalizeEmail(email));
    // Skip ADMIN accounts even if listed in business_head_teams — BH role is required.
    if (u && String(u.role || "").trim() === "ADMIN") continue;
    recipients.push({
      email: normalizeEmail(email),
      name: u?.name || email,
      team: u?.team || u?.department || team,
      slackUserId: u?.externalId || u?.external_id || u?.slack_user_id || null,
    });
  }
  if (!recipients.length && emails.length) {
    reason = "no-head";
  }
  return { team, reason, recipients, headEmails };
}

export function recipientAnnounceLine(recipients, reason, team) {
  if (!recipients.length) {
    if (reason === "requester-is-sole-head") {
      return `Business head: (you are the only head for ${team || "this team"} — map another head before requesting)`;
    }
    return `Business head: (none mapped for ${team || "this team"} — add a business head in Admin)`;
  }
  if (recipients.length === 1) {
    const r = recipients[0];
    return `Business head: ${r.name} (${r.team || team})`;
  }
  return `Business heads: ${recipients.map((r) => `${r.name} (${r.team || team})`).join(", ")}`;
}

async function sendSlackDm(slackUserId, text) {
  const result = await sendSlackLoginCodeDm(slackUserId, text);
  return { ...result, channel: result?.channel || null };
}

async function dmReviewRequest(recipient, { idea, requester, team, score }) {
  const link = ideaDeepLink(idea.id);
  const text = [
    `*Manager review requested*`,
    `Idea: *${idea.name || idea.id}*`,
    `Team: ${team}`,
    `Requester: ${requester?.name || requester?.email || "—"}`,
    `Score: ${Number(score || 0)}%`,
    `Open: ${link}`,
  ].join("\n");
  if (!recipient.slackUserId) {
    return { ok: false, error: "no_slack_user_id", email: recipient.email, name: recipient.name };
  }
  const result = await sendSlackDm(recipient.slackUserId, text);
  return {
    ok: Boolean(result?.ok),
    error: result?.ok ? null : result?.error || "dm_failed",
    email: recipient.email,
    name: recipient.name,
    channel: result?.channel || null,
  };
}

async function optionalChannelCopy({ team, requester, reason }) {
  if (String(process.env.MANAGER_REVIEW_CHANNEL_COPY || "").trim() !== "1") {
    return { posted: false, skipped: true };
  }
  return postSlackWebhook(
    slackChannelCopyPayload({
      team,
      requesterName: requester?.name || requester?.email,
      reason,
    })
  );
}

function isOwner(user, doc) {
  const email = normalizeEmail(user?.email);
  const ownerEmail = normalizeEmail(doc.createdByEmail || doc.created_by_email);
  if (email && ownerEmail && email === ownerEmail) return true;
  return String(user?.id || "") === String(doc.createdByUserId || doc.created_by_user_id || "");
}

export async function previewManagerReviewRecipients({ ideaId, user, teamOverride = "" }) {
  if (!user) {
    const err = new Error("Sign in required.");
    err.status = 401;
    throw err;
  }
  const raw = await getPropositionById(ideaId);
  if (!raw || !(await canAccessIdea(user, raw))) {
    const err = new Error("Idea not found.");
    err.status = 404;
    throw err;
  }
  const doc = await hydrateReviewOnDoc(raw);
  const override = String(teamOverride || "").trim();
  const effective = override ? { ...doc, submitterDepartment: override } : doc;
  const { team, reason, recipients } = await resolveReviewRecipients(effective, user);
  const announce = recipientAnnounceLine(recipients, reason, team);
  return { announce, reason, team, recipients: recipients.map((r) => ({ email: r.email, name: r.name, team: r.team })) };
}

export async function requestManagerReview({ ideaId, user }) {
  if (!user) {
    const err = new Error("Sign in required.");
    err.status = 401;
    throw err;
  }
  const raw = await getPropositionById(ideaId);
  if (!raw || !(await canAccessIdea(user, raw))) {
    const err = new Error("Idea not found.");
    err.status = 404;
    throw err;
  }

  const doc = await hydrateReviewOnDoc(raw);
  if (classificationOf(doc) !== "WATCH") {
    const err = new Error("Manager review is only for WATCH ideas.");
    err.status = 400;
    throw err;
  }
  if (!isOwner(user, doc) && !isAdminSession(user)) {
    const err = new Error("Only the idea owner or an admin can request manager review.");
    err.status = 403;
    throw err;
  }
  if (doc.managerReviewState?.isOpen) {
    const err = new Error("A manager review request is already open for this idea.");
    err.status = 409;
    throw err;
  }
  if (hasManagerApproval(doc) || doc.managerReviewState?.isApproved) {
    const err = new Error("This idea already has manager approval.");
    err.status = 409;
    throw err;
  }

  const { team, reason, recipients } = await resolveReviewRecipients(doc, user);
  if (!recipients.length) {
    const err = new Error(
      reason === "requester-is-sole-head"
        ? `You are the only business head for ${team || "this team"}. Map another head in Admin before requesting review.`
        : `No business head is mapped for team "${team || ideaTeam(doc) || "—"}". Ask an admin to assign the team head, then try again.`
    );
    err.status = 400;
    err.code = reason === "requester-is-sole-head" ? "SOLE_HEAD" : "NO_TEAM_HEAD";
    throw err;
  }
  const announce = recipientAnnounceLine(recipients, reason, team);
  const waitingForName = recipients.map((r) => r.name).join(", ");
  const score = scorePctOf(doc);

  await appendManagerReviewEvent({
    ideaId: doc.id,
    event: "requested",
    actorEmail: user.email,
    actorName: user.name || user.email,
    detail: {
      team,
      reason,
      waitingForName,
      recipientEmails: recipients.map((r) => r.email),
      announce,
    },
  });

  const deliveries = [];
  for (const recipient of recipients) {
    const delivery = await dmReviewRequest(recipient, { idea: doc, requester: user, team, score });
    deliveries.push(delivery);
    await appendManagerReviewEvent({
      ideaId: doc.id,
      event: "notified",
      actorEmail: user.email,
      actorName: user.name || user.email,
      detail: {
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        ok: delivery.ok,
        error: delivery.error || null,
      },
    });
    if (!delivery.ok) {
      await alertSlackDown({
        context: "manager_review_dm",
        detail: { ideaId: doc.id, recipient: recipient.email, error: delivery.error },
      }).catch(() => {});
    }
  }

  const channel = await optionalChannelCopy({ team, requester: user, reason });

  const review = {
    requestedAt: new Date().toISOString(),
    requestedBy: { id: user.id, name: user.name, email: user.email, role: user.role },
    team,
    reason,
    announce,
    deliveries,
    status: "requested",
  };
  const saved = await setPropositionManagerReview(doc.id, review);

  const unreachable = deliveries.filter((d) => !d.ok);
  return {
    ok: true,
    proposition: await hydrateReviewOnDoc(saved || doc),
    announce,
    reason,
    recipients: recipients.map((r) => ({ email: r.email, name: r.name, team: r.team })),
    deliveries,
    channelPosted: Boolean(channel?.posted),
    unreachable: unreachable.map((d) => ({
      name: d.name,
      email: d.email,
      shareLink: ideaDeepLink(doc.id),
      message: `Could not reach ${d.name}; share this link: ${ideaDeepLink(doc.id)}`,
    })),
    adminFallback: false,
  };
}

async function canDecideReview(user, doc) {
  if (isOwner(user, doc)) return false;
  const requesterEmail = normalizeEmail(
    doc.managerReview?.requestedBy?.email || doc.managerReviewState?.openRequest?.actor_email
  );
  if (requesterEmail && normalizeEmail(user.email) === requesterEmail) return false;
  if (isAdminSession(user)) return true;
  const team = (await resolveCanonicalTeam(ideaTeam(doc))) || ideaTeam(doc);
  const heads = await getBusinessHeadEmailsForTeam(team);
  return heads.includes(normalizeEmail(user.email));
}

export async function decideManagerReview({ ideaId, user, decision, comment }) {
  if (!user) {
    const err = new Error("Sign in required.");
    err.status = 401;
    throw err;
  }
  const dec = String(decision || "").toLowerCase();
  if (dec !== "approve" && dec !== "reject") {
    const err = new Error("Decision must be approve or reject.");
    err.status = 400;
    throw err;
  }
  const text = String(comment || "").trim();
  if (text.length < MIN_REVIEW_COMMENT) {
    const err = new Error(`Comment must be at least ${MIN_REVIEW_COMMENT} characters.`);
    err.status = 400;
    throw err;
  }

  const raw = await getPropositionById(ideaId);
  if (!raw || !(await canAccessIdea(user, raw))) {
    const err = new Error("Idea not found.");
    err.status = 404;
    throw err;
  }

  const doc = await hydrateReviewOnDoc(raw);
  if (classificationOf(doc) !== "WATCH") {
    const err = new Error("Manager review decisions require a WATCH verdict.");
    err.status = 400;
    throw err;
  }
  if (!doc.managerReviewState?.isOpen) {
    // Already decided — idempotent no-op
    if (doc.managerReviewState?.decision) {
      return {
        ok: true,
        alreadyDecided: true,
        decision: doc.managerReviewState.decision.event,
        proposition: doc,
      };
    }
    const err = new Error("No open manager review request for this idea.");
    err.status = 409;
    throw err;
  }

  if (!(await canDecideReview(user, doc))) {
    const err = new Error("Not allowed to decide this review.");
    err.status = 403;
    throw err;
  }

  // Re-check under race: second click records nothing twice
  const freshEvents = await listManagerReviewEvents(doc.id);
  const freshState = reviewStateFromEvents(freshEvents, doc.managerReview, doc.managerApproval);
  if (!freshState.isOpen) {
    return {
      ok: true,
      alreadyDecided: true,
      decision: freshState.decision?.event,
      proposition: await hydrateReviewOnDoc(doc),
    };
  }

  const eventName = dec === "approve" ? "approved" : "rejected";
  await appendManagerReviewEvent({
    ideaId: doc.id,
    event: eventName,
    actorEmail: user.email,
    actorName: user.name || user.email,
    comment: text,
    detail: { decision: dec },
  });

  let review;
  if (dec === "approve") {
    review = buildManagerApproval(doc.managerReview, { comment: text, user });
  } else {
    review = {
      ...(doc.managerReview || {}),
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectedBy: { name: user.name, email: user.email, role: user.role },
      rejectReason: text,
      // Ensure unlock stays closed
      comment: undefined,
      approvedAt: undefined,
    };
  }
  const saved = await setPropositionManagerReview(doc.id, review);

  const reqEmail = normalizeEmail(
    doc.managerReview?.requestedBy?.email ||
      doc.managerReviewState?.openRequest?.actor_email ||
      doc.createdByEmail ||
      doc.created_by_email
  );
  if (reqEmail) {
    const requester = await getUserByEmail(reqEmail);
    const requesterSlack = requester?.externalId || requester?.external_id || requester?.slack_user_id;
    if (requesterSlack) {
      const verb = dec === "approve" ? "approved" : "rejected";
      const msg = [
        `*Manager review ${verb}*`,
        `Idea: *${doc.name || doc.id}*`,
        `By: ${user.name || user.email}`,
        `Comment: ${text}`,
        `Open: ${ideaDeepLink(doc.id)}`,
      ].join("\n");
      const dm = await sendSlackDm(requesterSlack, msg);
      if (!dm?.ok) {
        await alertSlackDown({
          context: "manager_review_decision_dm",
          detail: { ideaId: doc.id, error: dm?.error },
        }).catch(() => {});
      }
    }
  }

  return {
    ok: true,
    decision: eventName,
    comment: text,
    proposition: await hydrateReviewOnDoc(saved || doc),
  };
}

export async function closeOpenReviewsIfNotWatch(doc) {
  if (!doc?.id) return;
  if (classificationOf(doc) === "WATCH") return;
  const hydrated = await hydrateReviewOnDoc(doc);
  if (!hydrated.managerReviewState?.isOpen) return;
  await appendManagerReviewEvent({
    ideaId: doc.id,
    event: "closed",
    actorName: "system",
    comment: `Closed because verdict is ${classificationOf(doc) || "not WATCH"}.`,
    detail: { classification: classificationOf(doc) },
  });
}

export async function remindPendingReviews({ now = Date.now() } = {}) {
  if (!usingPostgres()) return { reminded: 0 };
  await ensureManagerReviewEventsSchema();
  const cutoff = new Date(now - 72 * 3600 * 1000).toISOString();
  const rows = await query(
    `
    SELECT e.idea_id
    FROM manager_review_events e
    WHERE e.event = 'requested'
      AND e.created_at <= $1::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM manager_review_events x
        WHERE x.idea_id = e.idea_id
          AND x.created_at > e.created_at
          AND x.event IN ('approved','rejected','closed','reminded')
      )
  `,
    [cutoff]
  );

  let reminded = 0;
  for (const row of rows) {
    const doc = await getPropositionById(row.idea_id);
    if (!doc) continue;
    if (classificationOf(doc) !== "WATCH") {
      await closeOpenReviewsIfNotWatch(doc);
      continue;
    }
    const events = await listManagerReviewEvents(doc.id);
    const state = reviewStateFromEvents(events, doc.managerReview, doc.managerApproval);
    if (!state.isOpen) continue;

    const { recipients, team } = await resolveReviewRecipients(doc, {
      email: state.openRequest?.actor_email,
      name: state.openRequest?.actor_name,
    });
    const score = scorePctOf(doc);
    for (const recipient of recipients) {
      if (!recipient.slackUserId) continue;
      const text = [
        `*Reminder: manager review still pending*`,
        `Idea: *${doc.name || doc.id}*`,
        `Team: ${team}`,
        `Score: ${score}%`,
        `Open: ${ideaDeepLink(doc.id)}`,
      ].join("\n");
      await sendSlackDm(recipient.slackUserId, text);
    }
    await appendManagerReviewEvent({
      ideaId: doc.id,
      event: "reminded",
      actorName: "system",
      detail: { afterHours: 72 },
    });
    reminded += 1;
  }
  return { reminded };
}
