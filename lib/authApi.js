import { readJsonBody, redactSecrets, sendJson } from "./http.js";
import {
  clearSessionCookieHeader,
  publicUser,
  readSessionCookie,
  sessionCookieHeader,
  signSession,
  USER_ROLES,
  verifyPassword,
  verifySession,
} from "./auth.js";
import { getUserByEmail, getUserById } from "./db.js";

export async function handleLogin(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      sendJson(res, 400, { error: "Email and password are required." });
      return;
    }
    const user = await getUserByEmail(email);
    const ok = verifyPassword(password, user?.passwordHash || "");
    if (!user || !ok) {
      sendJson(res, 401, { error: "Email or password is incorrect." });
      return;
    }
    if (!USER_ROLES.includes(user.role)) {
      sendJson(res, 403, { error: "This account has no recognised role." });
      return;
    }
    const token = signSession({ userId: user.id, role: user.role, name: user.name });
    res.setHeader("Set-Cookie", sessionCookieHeader(token, req));
    sendJson(res, 200, { user: publicUser(user) });
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
    const session = verifySession(readSessionCookie(req));
    if (!session?.userId) {
      sendJson(res, 200, { user: null });
      return;
    }
    const user = await getUserById(session.userId);
    sendJson(res, 200, { user: publicUser(user) });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
