import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { applyCors } from "./cors.js";
import { sendJson } from "./http.js";
import { checkRateLimit } from "./rateLimit.js";
import { getUserById } from "./db.js";

export const USER_ROLES = ["BM", "CMI", "FINANCE", "R&D", "SALES", "PACKAGING", "BH FORUM", "ADMIN"];

const COOKIE = "primus_session";
const MAX_AGE = 60 * 60 * 24 * 14;

/** Login and field-ownership stay in the repo; they are off until REQUIRE_AUTH=true. */
export function authRequired() {
  const raw = String(process.env.REQUIRE_AUTH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (authRequired() && (process.env.RENDER || process.env.NODE_ENV === "production")) {
    throw new Error("SESSION_SECRET is required when REQUIRE_AUTH is on.");
  }
  if (authRequired()) {
    console.warn(
      "[primus/auth] SESSION_SECRET is unset — using a local-only default. Set SESSION_SECRET before deploying."
    );
  }
  return "local-dev-only-not-for-production";
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DUMMY_HASH = hashPassword("timing-dummy-not-a-real-password");

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || "").split(":");
    if (!salt || !hash) {
      verifyPassword(password, DUMMY_HASH);
      return false;
    }
    const check = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== check.length) {
      timingSafeEqual(check, check);
      return false;
    }
    return timingSafeEqual(expected, check);
  } catch {
    return false;
  }
}

function hmac(body) {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

function signaturesMatch(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
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
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${COOKIE}=`)) continue;
    return decodeURIComponent(trimmed.slice(COOKIE.length + 1));
  }
  return null;
}

function cookieSecure(req) {
  if (process.env.RENDER) return true;
  const proto = String(req.headers?.["x-forwarded-proto"] || "");
  return proto.split(",")[0].trim() === "https";
}

export function sessionCookieHeader(token, req, { maxAge = MAX_AGE } = {}) {
  const parts = [`${COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (cookieSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(req) {
  return sessionCookieHeader("", req, { maxAge: 0 });
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
  return { id: user.id, name: user.name, role: user.role, email: user.email };
}

/**
 * CORS + OPTIONS + optional session + optional rate limit.
 * Returns false when the response is already finished.
 */
export async function protectApi(req, res, { methods, auth = true, rateLimit = false } = {}) {
  applyCors(req, res, methods);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (auth && authRequired()) {
    const user = await requireUser(req, res);
    if (!user) return false;
    req.user = user;
  }
  if (rateLimit) {
    const key = req.user?.id || "anon";
    if (!checkRateLimit(key)) {
      sendJson(res, 429, { error: "too many requests, try again in a minute" });
      return false;
    }
  }
  return true;
}

export function publicUser(user) {
  if (!user) return null;
  return { name: user.name, role: user.role };
}
