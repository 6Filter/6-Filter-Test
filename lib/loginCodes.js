/**
 * Slack one-time sign-in codes + durable rate limits (Postgres only).
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { trustedClientIp } from "./rateLimit.js";

export const REQUEST_CODE_SAME_MESSAGE =
  "If this email is a CavinKare Slack member, a code has been sent to your Slack.";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Per email per hour — high enough for Send + several Resends; still capped. */
export const RATE_EMAIL_MAX = 10;
export const RATE_IP_MAX = 10;
/** Verify may need enough room to hit the 5-attempt code cap. */
export const RATE_VERIFY_EMAIL_MAX = 20;
export const RATE_VERIFY_IP_MAX = 40;
/** Platform-wide: only counts request-code after Slack lookup succeeds. */
export const RATE_PLATFORM_MAX = 500;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

function loginCodeSecret() {
  const secret = String(process.env.LOGIN_CODE_SECRET || "").trim();
  if (secret) return secret;
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    throw new Error("LOGIN_CODE_SECRET must be set.");
  }
  return "local-dev-login-code-secret-not-for-production";
}

export function hmacLoginCode(code) {
  return createHmac("sha256", loginCodeSecret()).update(String(code)).digest("hex");
}

export function generateLoginCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function codesMatch(provided, storedHmac) {
  try {
    const a = Buffer.from(hmacLoginCode(provided), "hex");
    const b = Buffer.from(String(storedHmac || ""), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function throttleKeyEmail(email) {
  return `login-req:email:${String(email || "").trim().toLowerCase()}`;
}

export function throttleKeyIp(req) {
  return `login-req:ip:${trustedClientIp(req)}`;
}

export function throttleKeyPlatform() {
  return "login-req:platform";
}

export function throttleKeyVerifyEmail(email) {
  return `login-verify:email:${String(email || "").trim().toLowerCase()}`;
}

export function throttleKeyVerifyIp(req) {
  return `login-verify:ip:${trustedClientIp(req)}`;
}

export function slackCodeMessage(code) {
  return (
    `Your 6 Filter Test sign-in code is ${code}. ` +
    `It works for 10 minutes and once only. If you did not ask for it, ignore this message.`
  );
}

/** Delay so success and failure take similar wall time. */
export async function roughlyConstantReplyDelay(startedAt, targetMs = 450) {
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, targetMs - elapsed);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
