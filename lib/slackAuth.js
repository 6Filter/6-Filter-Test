/**
 * Slack Web API helpers for OTP sign-in (lookup by email + DM).
 * Injectable fetch for tests.
 */

export function slackBotToken() {
  return String(process.env.SLACK_BOT_TOKEN || "").trim();
}

/**
 * @returns {Promise<{ ok: boolean, member?: object, reason?: string }>}
 */
export async function lookupSlackMemberByEmail(email, { fetchImpl = globalThis.fetch, token = slackBotToken() } = {}) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return { ok: false, reason: "empty" };
  if (!token) return { ok: false, reason: "no-token" };

  const url = new URL("https://slack.com/api/users.lookupByEmail");
  url.searchParams.set("email", needle);
  const res = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok || !data.user) {
    return { ok: false, reason: data?.error || "not_found" };
  }
  const user = data.user;
  if (user.deleted) return { ok: false, reason: "deactivated" };
  if (user.is_bot || user.id === "USLACKBOT") return { ok: false, reason: "bot" };
  if (user.is_restricted || user.is_ultra_restricted) return { ok: false, reason: "guest" };
  if (user.is_stranger) return { ok: false, reason: "guest" };
  return { ok: true, member: user };
}

export function slackDisplayName(member) {
  const profile = member?.profile || {};
  return (
    String(profile.real_name || profile.display_name || member?.name || "").trim() ||
    String(profile.email || "").trim() ||
    "Colleague"
  );
}

/**
 * Open a DM and post the sign-in code.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendSlackLoginCodeDm(slackUserId, text, { fetchImpl = globalThis.fetch, token = slackBotToken() } = {}) {
  if (!token) return { ok: false, error: "no-token" };
  if (!slackUserId) return { ok: false, error: "no-user" };

  const openRes = await fetchImpl("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: slackUserId }),
  });
  const openData = await openRes.json().catch(() => ({}));
  const channel = openData?.channel?.id;
  if (!openData?.ok || !channel) {
    return { ok: false, error: openData?.error || "open_failed" };
  }

  const postRes = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text: String(text || "") }),
  });
  const postData = await postRes.json().catch(() => ({}));
  if (!postData?.ok) {
    return { ok: false, error: postData?.error || "post_failed" };
  }
  return { ok: true };
}
