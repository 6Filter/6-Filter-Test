import { readJsonBody, redactSecrets, sendJson } from "./http.js";
import {
  clearSessionCookieHeader,
  authRequired,
  DEFAULT_REGISTER_ROLE,
  hashPassword,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  publicUser,
  readSessionCookie,
  sessionCookieHeader,
  signSession,
  USER_ROLES,
  verifyPassword,
  verifySession,
} from "./auth.js";
import { createUser, getUserByEmail, getUserById } from "./db.js";

export async function handleRegister(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "JSON body is required." });
      return;
    }
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!name) {
      sendJson(res, 400, { error: "Enter your name." });
      return;
    }
    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: "Enter a valid email address — that is your username." });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      sendJson(res, 400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    const user = await createUser({
      name,
      email,
      passwordHash: hashPassword(password),
      role: DEFAULT_REGISTER_ROLE,
      division: "",
    });
    const token = signSession({ userId: user.id, role: user.role, name: user.name });
    res.setHeader("Set-Cookie", sessionCookieHeader(token, req));
    sendJson(res, 201, { user: publicUser(user) });
  } catch (e) {
    if (e?.status === 409) {
      sendJson(res, 409, { error: "An account with this email already exists. Sign in instead." });
      return;
    }
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleLogin(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "JSON body is required." });
      return;
    }
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!email || !password) {
      sendJson(res, 400, { error: "Email and password are required." });
      return;
    }
    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: "Enter a valid email address." });
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
    if (!authRequired()) {
      sendJson(res, 200, { user: null, authRequired: false });
      return;
    }
    const session = verifySession(readSessionCookie(req));
    if (!session?.userId) {
      sendJson(res, 200, { user: null, authRequired: true });
      return;
    }
    const user = await getUserById(session.userId);
    sendJson(res, 200, { user: publicUser(user), authRequired: true });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}
