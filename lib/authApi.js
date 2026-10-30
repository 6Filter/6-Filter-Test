import { readJsonBody, redactSecrets, sendJson } from "./http.js";
import {
  clearSessionCookieHeader,
  authRequired,
  DEFAULT_SIGNIN_ROLE,
  emailDomainAllowed,
  isBootstrapAdminEmail,
  isValidEmail,
  normalizeEmail,
  publicUser,
  readSessionCookie,
  sessionCookieHeader,
  sessionMaxAgeSeconds,
  signSession,
  USER_ROLES,
  verifySession,
} from "./auth.js";
import {
  findOrCreateSlackUser,
  getUserByEmail,
  getUserById,
  maybeBootstrapAdmin,
  setUserTeam,
  syncBusinessHeadRole,
  touchUserSignIn,
  usingPostgres,
} from "./db.js";
import {
  REQUEST_CODE_SAME_MESSAGE,
  MAX_CODE_ATTEMPTS,
  RATE_EMAIL_MAX,
  RATE_IP_MAX,
  RATE_PLATFORM_MAX,
  RATE_VERIFY_EMAIL_MAX,
  RATE_VERIFY_IP_MAX,
  codesMatch,
  roughlyConstantReplyDelay,
  slackCodeMessage,
  throttleKeyEmail,
  throttleKeyIp,
  throttleKeyPlatform,
  throttleKeyVerifyEmail,
  throttleKeyVerifyIp,
} from "./loginCodes.js";
import {
  attemptLoginCode,
  cancelLoginCode,
  checkDurableRateLimit,
  consumeLoginCodeById,
  deleteLoginCodeById,
  getLoginCodeRow,
  maybeAlertSlackDown,
  replaceLoginCode,
  writeUserAudit,
} from "./accessDb.js";
import { lookupSlackMemberByEmail, sendSlackLoginCodeDm, slackDisplayName } from "./slackAuth.js";
import { isCanonicalTeam, normalizeNewTeamSelection } from "./propositionFields.js";
import { postSlackWebhook } from "./managerReview.js";

async function sameRequestCodeReply(res, startedAt) {
  await roughlyConstantReplyDelay(startedAt);
  sendJson(res, 200, { ok: true, message: REQUEST_CODE_SAME_MESSAGE });
}

export async function handleRequestCode(req, res, { slack = {} } = {}) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  const startedAt = Date.now();
  try {
    if (!usingPostgres()) {
      sendJson(res, 503, { error: "Database unavailable." });
      return;
    }
    const body = await readJsonBody(req);
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email) || !emailDomainAllowed(email)) {
      await sameRequestCodeReply(res, startedAt);
      return;
    }

    const okEmail = await checkDurableRateLimit(throttleKeyEmail(email), { max: RATE_EMAIL_MAX });
    const okIp = await checkDurableRateLimit(throttleKeyIp(req), { max: RATE_IP_MAX });
    if (!okIp) {
      await sameRequestCodeReply(res, startedAt);
      return;
    }
    // After the hourly email cap, allow Resend only once an active code is ≥55s old
    // (matches the UI cooldown) so a burst cannot mint extra DMs.
    let allowSend = okEmail;
    if (!okEmail) {
      const existing = await getLoginCodeRow(email);
      const expiresAt = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0;
      const createdAt = existing?.created_at ? new Date(existing.created_at).getTime() : 0;
      const activeAged =
        existing &&
        expiresAt > Date.now() &&
        Number(existing.attempts || 0) < MAX_CODE_ATTEMPTS &&
        createdAt > 0 &&
        Date.now() - createdAt >= 55_000;
      if (activeAged) {
        allowSend = await checkDurableRateLimit(`login-resend:email:${email}`, {
          max: RATE_EMAIL_MAX,
        });
      }
    }
    if (!allowSend) {
      await sameRequestCodeReply(res, startedAt);
      return;
    }

    // Slack outage and non-members get the same reply — never leak membership.
    const lookup = await lookupSlackMemberByEmail(email, {
      fetchImpl: slack.fetchImpl,
      token: slack.token,
    });
    if (!lookup.ok) {
      await sameRequestCodeReply(res, startedAt);
      return;
    }

    // Platform-wide only counts emails that passed Slack lookup.
    const okPlat = await checkDurableRateLimit(throttleKeyPlatform(), { max: RATE_PLATFORM_MAX });
    if (!okPlat) {
      await sameRequestCodeReply(res, startedAt);
      return;
    }

    const { code } = await replaceLoginCode(email);
    const dm = await sendSlackLoginCodeDm(lookup.member.id, slackCodeMessage(code), {
      fetchImpl: slack.fetchImpl,
      token: slack.token,
    });
    if (!dm.ok) {
      await cancelLoginCode(email);
      await maybeAlertSlackDown(
        "6 Filter Test: Slack sign-in DM failed. Check SLACK_BOT_TOKEN.",
        { postSlackWebhook }
      );
      await roughlyConstantReplyDelay(startedAt);
      sendJson(res, 503, { error: "Unable to send a sign-in code right now. Try again later." });
      return;
    }

    await sameRequestCodeReply(res, startedAt);
  } catch (e) {
    if (e?.status === 503 || e?.code === "DB_UNAVAILABLE") {
      sendJson(res, 503, { error: "Database unavailable." });
      return;
    }
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleVerifyCode(req, res, { slack = {} } = {}) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    if (!usingPostgres()) {
      sendJson(res, 503, { error: "Database unavailable." });
      return;
    }
    const body = await readJsonBody(req);
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6);
    if (!isValidEmail(email) || code.length !== 6) {
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }

    const okEmail = await checkDurableRateLimit(throttleKeyVerifyEmail(email), { max: RATE_VERIFY_EMAIL_MAX });
    const okIp = await checkDurableRateLimit(throttleKeyVerifyIp(req), { max: RATE_VERIFY_IP_MAX });
    if (!okEmail || !okIp) {
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }

    // Count the attempt before comparing (atomic).
    const row = await attemptLoginCode(email);
    if (!row) {
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }

    const match = codesMatch(code, row.code_hmac);
    if (!match) {
      if (Number(row.attempts) >= MAX_CODE_ATTEMPTS) {
        await deleteLoginCodeById(row.id);
      }
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }

    const consumed = await consumeLoginCodeById(row.id);
    if (!consumed) {
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }

    // When Slack is reachable, refuse deactivated / guest / bot.
    // When Slack is unreachable, accept the code (issued minutes earlier). See docs/ACCESS.md.
    const lookup = await lookupSlackMemberByEmail(email, {
      fetchImpl: slack.fetchImpl,
      token: slack.token,
    });
    if (!lookup.unreachable && !lookup.ok) {
      sendJson(res, 401, { error: "Invalid email or code." });
      return;
    }
    const name = lookup.ok ? slackDisplayName(lookup.member) : email.split("@")[0];
    const externalId = lookup.ok ? String(lookup.member.id || "") : "";

    let user = await getUserByEmail(email);
    if (!user) {
      user = await findOrCreateSlackUser({
        email,
        name,
        role: DEFAULT_SIGNIN_ROLE,
        externalId,
      });
    } else if (String(user.status || "") === "disabled") {
      sendJson(res, 401, { error: "This account is disabled." });
      return;
    }
    user = (await maybeBootstrapAdmin(user, { eligible: isBootstrapAdminEmail(email) })) || user;
    user = (await syncBusinessHeadRole(user)) || user;
    if (!USER_ROLES.includes(user.role)) {
      sendJson(res, 403, { error: "This account has no recognised role." });
      return;
    }

    user = (await touchUserSignIn(user.id)) || user;
    const tokenVersion = Number(user.tokenVersion) || 1;
    const token = signSession({ userId: user.id, tokenVersion });
    res.setHeader(
      "Set-Cookie",
      sessionCookieHeader(token, req, { maxAge: sessionMaxAgeSeconds() })
    );
    sendJson(res, 200, { user: publicUser(user) });
  } catch (e) {
    if (e?.status === 503 || e?.code === "DB_UNAVAILABLE") {
      sendJson(res, 503, { error: "Database unavailable." });
      return;
    }
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleSetTeam(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const session = verifySession(readSessionCookie(req));
    if (!session?.userId || !Number.isFinite(Number(session.tokenVersion ?? session.token_version))) {
      sendJson(res, 401, { error: "Sign in required." });
      return;
    }
    const user = await getUserById(session.userId);
    if (!user || String(user.status) === "disabled") {
      sendJson(res, 401, { error: "Sign in required." });
      return;
    }
    if (String(user.team || "").trim()) {
      sendJson(res, 403, { error: "Your team is already set. Only an ADMIN can change it." });
      return;
    }
    const body = await readJsonBody(req);
    const team = normalizeNewTeamSelection(body?.team);
    if (!isCanonicalTeam(team)) {
      sendJson(res, 400, { error: "Choose one of the listed teams." });
      return;
    }
    const updated = await setUserTeam(user.id, team, { onlyIfEmpty: true });
    await writeUserAudit({
      actorUserId: user.id,
      action: "set-own-team",
      targetUserId: user.id,
      targetEmail: user.email,
      detail: { team },
    });
    sendJson(res, 200, { user: publicUser(updated) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleLogout(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  res.setHeader("Set-Cookie", clearSessionCookieHeader(req));
  sendJson(res, 200, { user: null });
}

export async function handleMe(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only." });
    return;
  }
  try {
    if (!authRequired()) {
      sendJson(res, 200, { user: null, authRequired: false });
      return;
    }
    if (!usingPostgres()) {
      sendJson(res, 503, { error: "Database unavailable.", authRequired: true });
      return;
    }
    const session = verifySession(readSessionCookie(req));
    if (!session?.userId || !Number.isFinite(Number(session.tokenVersion ?? session.token_version))) {
      sendJson(res, 200, { user: null, authRequired: true });
      return;
    }
    let user = await getUserById(session.userId);
    if (!user || String(user.status) === "disabled") {
      sendJson(res, 200, { user: null, authRequired: true });
      return;
    }
    const sessionVersion = Number(session.tokenVersion ?? session.token_version);
    const userVersion = Number(user.tokenVersion) || 1;
    if (sessionVersion !== userVersion) {
      sendJson(res, 200, { user: null, authRequired: true });
      return;
    }
    user = (await syncBusinessHeadRole(user)) || user;
    sendJson(res, 200, { user: publicUser(user), authRequired: true });
  } catch (e) {
    if (e?.status === 503 || e?.code === "DB_UNAVAILABLE") {
      sendJson(res, 503, { error: "Database unavailable.", authRequired: true });
      return;
    }
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

/** @deprecated removed — kept so accidental imports fail loudly at runtime if called */
export async function handleRegister(_req, res) {
  sendJson(res, 410, { error: "Registration is closed. Sign in with your Slack code." });
}

export async function handleLogin(_req, res) {
  sendJson(res, 410, { error: "Password sign-in is closed. Use your Slack code." });
}
