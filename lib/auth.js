import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { applyCors } from "./cors.js";
import { sendJson } from "./http.js";
import { checkRateLimit, rateLimitKey } from "./rateLimit.js";
import { getUserById } from "./db.js";

export const USER_ROLES = ["BM", "CMI", "FINANCE", "R&D", "SALES", "PACKAGING", "BH FORUM", "ADMIN"];

const COOKIE = "primus_session";
const DEPT_COOKIE = "primus_dept";
const MAX_AGE = 60 * 60 * 24 * 14;

/** Login and field-ownership stay in the repo; they are off until REQUIRE_AUTH=true. */
export function authRequired() {
  const raw = String(process.env.REQUIRE_AUTH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

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

export function sessionCookieHeader(token, req, { maxAge = MAX_AGE, cookieName = COOKIE, sameSite = "Lax" } = {}) {
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
  if (!department) return;
  req.user = { ...(req.user || {}), department };
}

export async function requireUser(req, res) {
  const session = verifySession(readSessionCookie(req));
  if (!session?.userId) {
    sendJson(res, 401, { error: "Sign in required." });
    return null;
  }
  const user = await getUserById(session.userId);
  if (!user) {
    sendJson(res, 401, { error: "Sign in required." });
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    division: user.division || "",
  };
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
  return { id: user.id, name: user.name, role: user.role, division: user.division || "" };
}
