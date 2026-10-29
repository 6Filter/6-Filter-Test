import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { applyCors } from "./cors.js";
import { sendJson } from "./http.js";
import { checkRateLimit, rateLimitKey } from "./rateLimit.js";
import { getUserById } from "./db.js";
import { OPEN_ACCESS_TEAM, PLATFORM_TEAM_LOCK_ENABLED } from "./departmentAuthConstants.js";

export const USER_ROLES = ["BM", "CMI", "FINANCE", "R&D", "SALES", "PACKAGING", "BH FORUM", "ADMIN"];

const COOKIE = "primus_session";
const DEPT_COOKIE = "primus_dept";

/**
 * Individual Slack-code login. On by default.
 * Set REQUIRE_AUTH=false to park named accounts (local tests / emergency).
 */
export function authRequired() {
  const raw = String(process.env.REQUIRE_AUTH ?? "").trim().toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Default role for first Slack sign-in. */
export const DEFAULT_SIGNIN_ROLE = "BM";
/** @deprecated use DEFAULT_SIGNIN_ROLE */
export const DEFAULT_REGISTER_ROLE = DEFAULT_SIGNIN_ROLE;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function allowedEmailDomains() {
  const raw = String(process.env.ALLOWED_EMAIL_DOMAINS || "cavinkare.com").trim();
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function emailDomainAllowed(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = e.slice(at + 1);
  return allowedEmailDomains().includes(domain);
}

/**
 * First Slack sign-in of a listed email becomes ADMIN while no ADMIN exists.
 * Never commit real addresses — set ADMIN_BOOTSTRAP_EMAILS in the environment only.
 */
export function adminBootstrapEmails() {
  return String(process.env.ADMIN_BOOTSTRAP_EMAILS || "")
    .split(",")
    .map((part) => normalizeEmail(part))
    .filter(Boolean);
}

export function isBootstrapAdminEmail(email) {
  return adminBootstrapEmails().includes(normalizeEmail(email));
}

export function sessionHours() {
  const n = Number(process.env.SESSION_HOURS);
  if (Number.isFinite(n) && n > 0 && n <= 24 * 30) return n;
  return 24;
}

export function sessionMaxAgeSeconds() {
  return Math.round(sessionHours() * 3600);
}

/** Kept for department-password hashing only — not used for sign-in. */
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export const scryptHash = hashPassword;

const DUMMY_HASH = hashPassword("timing-dummy-not-a-real-password");

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || "").split(":");
    const saltToUse = salt || DUMMY_HASH.split(":")[0];
    const check = scryptSync(String(password || ""), saltToUse, 64);
    const expected = Buffer.alloc(check.length);
    let validShape = false;
    if (salt && hash) {
      const parsed = Buffer.from(hash, "hex");
      if (parsed.length === check.length) {
        parsed.copy(expected);
        validShape = true;
      }
    }
    const match = timingSafeEqual(expected, check);
    return validShape && match;
  } catch {
    return false;
  }
}

export const scryptVerify = verifyPassword;

/** True only when a real secret is configured. Never returns the secret. */
export function sessionSecretConfigured() {
  return Boolean(String(process.env.SESSION_SECRET || "").trim());
}

function sessionSecret() {
  const secret = String(process.env.SESSION_SECRET || "").trim();
  if (secret) return secret;
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set — refusing to sign sessions with a default.");
  }
  return "local-dev-only-not-for-production";
}

function hmac(body) {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

function signaturesMatch(a, b) {
  const left = createHmac("sha256", "primus-signature").update(String(a || "")).digest();
  const right = createHmac("sha256", "primus-signature").update(String(b || "")).digest();
  return timingSafeEqual(left, right);
}

export function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifySession(token) {
  if (!token) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  if (!signaturesMatch(sig, hmac(body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

export function readSessionCookie(req) {
  return readNamedCookie(req, COOKIE);
}

export function readDepartmentCookie(req) {
  return readNamedCookie(req, DEPT_COOKIE);
}

function readNamedCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}

function cookieSecure(req) {
  if (process.env.RENDER) return true;
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  return proto.split(",")[0].trim() === "https";
}

export function sessionCookieHeader(token, req, { maxAge = sessionMaxAgeSeconds(), cookieName = COOKIE, sameSite = "Lax" } = {}) {
  const parts = [`${cookieName}=${token}`, "HttpOnly", `SameSite=${sameSite}`, "Path=/"];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (cookieSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

/** Browser-session cookie — no Max-Age, gone when the browser session ends. */
export function departmentSessionCookieHeader(token, req) {
  return sessionCookieHeader(token, req, { maxAge: null, cookieName: DEPT_COOKIE, sameSite: "Strict" });
}

export function clearSessionCookieHeader(req) {
  return sessionCookieHeader("", req, { maxAge: 0 });
}

export function clearDepartmentCookieHeader(req) {
  return sessionCookieHeader("", req, { maxAge: 0, cookieName: DEPT_COOKIE, sameSite: "Strict" });
}

export function attachDepartmentUnlock(req) {
  const session = verifySession(readDepartmentCookie(req));
  const department = String(session?.department || "").trim();
  if (department) {
    req.user = { ...(req.user || {}), department };
    return;
  }
  if (!PLATFORM_TEAM_LOCK_ENABLED) {
    req.user = { ...(req.user || {}), department: OPEN_ACCESS_TEAM };
  }
}

function attachUserFields(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    division: user.division || "",
    team: user.team || "",
    status: user.status || "active",
    tokenVersion: Number(user.tokenVersion) || 1,
    needsTeam: !String(user.team || "").trim(),
    lastSignInAt: user.lastSignInAt || null,
  };
}

export async function requireUser(req, res) {
  const session = verifySession(readSessionCookie(req));
  if (!session?.userId) {
    sendJson(res, 401, { error: "Sign in required." });
    return null;
  }
  let user;
  try {
    user = await getUserById(session.userId);
  } catch (e) {
    if (e?.code === "DB_UNAVAILABLE" || e?.status === 503) {
      sendJson(res, 503, { error: "Database unavailable." });
      return null;
    }
    throw e;
  }
  if (!user) {
    sendJson(res, 401, { error: "Sign in required." });
    return null;
  }
  if (String(user.status || "active") === "disabled") {
    sendJson(res, 401, { error: "This account is disabled." });
    return null;
  }
  const sessionVersion = Number(session.tokenVersion ?? session.token_version);
  const userVersion = Number(user.tokenVersion) || 1;
  if (Number.isFinite(sessionVersion) && sessionVersion !== userVersion) {
    sendJson(res, 401, { error: "Sign in required." });
    return null;
  }
  return attachUserFields(user);
}

/**
 * CORS + OPTIONS + optional session + optional rate limit.
 * Returns false when the response is already finished.
 */
export async function protectApi(req, res, { methods, auth = true, optionalSession = false, rateLimit = false } = {}) {
  applyCors(req, res, methods);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (!optionalSession && auth && authRequired()) {
    const user = await requireUser(req, res);
    if (!user) return false;
    req.user = user;
  }
  attachDepartmentUnlock(req);
  if (rateLimit) {
    const opts = rateLimit === true ? {} : rateLimit;
    const key = rateLimitKey(req, opts.bucket || "default");
    if (!checkRateLimit(key, opts)) {
      sendJson(res, 429, { error: "too many requests, try again in a minute" });
      return false;
    }
  }
  return true;
}

export function publicUser(user) {
  if (!user) return null;
  const team = user.team || "";
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    role: user.role,
    division: user.division || "",
    team,
    status: user.status || "active",
    needsTeam: !String(team).trim(),
    lastSignInAt: user.lastSignInAt || null,
  };
}
