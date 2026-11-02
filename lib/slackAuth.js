/**
 * Slack Web API helpers for OTP sign-in (lookup by email + DM).
 * Injectable fetch for tests.
 */

/** Slack lookups often exceed 5s under load — short timeouts locked people out of login. */
export const SLACK_FETCH_TIMEOUT_MS = 15000;

export function slackBotToken() {
  return String(process.env.SLACK_BOT_TOKEN || "").trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch with timeout and one retry on timeout / 429 / 5xx (honours Retry-After).
 */
export async function slackFetch(url, options = {}, { fetchImpl = globalThis.fetch } = {}) {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SLACK_FETCH_TIMEOUT_MS);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let res;
  try {
    res = await attempt();
  } catch (e) {
    // Cold Slack / flaky network — one more try before locking the user out.
    await sleep(400);
    try {
      res = await attempt();
    } catch (e2) {
      const err = new Error(e2?.name === "AbortError" ? "slack_timeout" : "slack_unreachable");
      err.code = e2?.name === "AbortError" ? "SLACK_TIMEOUT" : "SLACK_UNREACHABLE";
      throw err;
    }
  }

  if (res.status === 429 || res.status >= 500) {
    const retryAfterRaw = res.headers?.get?.("retry-after") || res.headers?.get?.("Retry-After");
    let waitMs = 1000;
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum >= 0) {
      waitMs = Math.min(10_000, asNum < 100 ? asNum * 1000 : asNum);
    }
    await sleep(waitMs);
    try {
      res = await attempt();
    } catch (e) {
      const err = new Error(e?.name === "AbortError" ? "slack_timeout" : "slack_unreachable");
      err.code = e?.name === "AbortError" ? "SLACK_TIMEOUT" : "SLACK_UNREACHABLE";
      throw err;
    }
  }
  return res;
}

/**
 * @returns {Promise<{ ok: boolean, member?: object, reason?: string, unreachable?: boolean }>}
 */
export async function lookupSlackMemberByEmail(email, { fetchImpl = globalThis.fetch, token = slackBotToken() } = {}) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return { ok: false, reason: "empty" };
  if (!token) return { ok: false, reason: "no-token", unreachable: true };

  try {
    const url = new URL("https://slack.com/api/users.lookupByEmail");
    url.searchParams.set("email", needle);
    const res = await slackFetch(
      url.toString(),
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      { fetchImpl }
    );
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
  } catch {
    return { ok: false, reason: "unreachable", unreachable: true };
  }
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
 * @returns {Promise<{ ok: boolean, error?: string, unreachable?: boolean }>}
 */
export async function sendSlackLoginCodeDm(slackUserId, text, { fetchImpl = globalThis.fetch, token = slackBotToken() } = {}) {
  if (!token) return { ok: false, error: "no-token", unreachable: true };
  if (!slackUserId) return { ok: false, error: "no-user" };

  try {
    const openRes = await slackFetch(
      "https://slack.com/api/conversations.open",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ users: slackUserId }),
      },
      { fetchImpl }
    );
    const openData = await openRes.json().catch(() => ({}));
    const channel = openData?.channel?.id;
    if (!openData?.ok || !channel) {
      return { ok: false, error: openData?.error || "open_failed" };
    }

    const postRes = await slackFetch(
      "https://slack.com/api/chat.postMessage",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ channel, text: String(text || "") }),
      },
      { fetchImpl }
    );
    const postData = await postRes.json().catch(() => ({}));
    if (!postData?.ok) {
      return { ok: false, error: postData?.error || "post_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "unreachable", unreachable: true };
  }
}
