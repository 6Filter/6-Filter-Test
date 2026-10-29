const buckets = new Map();

export function clearRateLimits() {
  buckets.clear();
}

/**
 * Client IP for rate limits.
 *
 * Do not trust cf-connecting-ip / true-client-ip unless TRUST_CLOUDFLARE=1
 * (any client can set those headers). Otherwise use the right-most
 * X-Forwarded-For entry — the address Render's proxy appends.
 */
export function trustedClientIp(req) {
  const headers = req?.headers || {};
  const header = (name) => {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value || "").split(",")[0].trim();
  };
  const trustCf = String(process.env.TRUST_CLOUDFLARE || "").trim() === "1";
  if (trustCf) {
    const edge = header("cf-connecting-ip") || header("true-client-ip");
    if (edge) return edge;
  }
  const forwarded = String(headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "");
  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length) return parts[parts.length - 1];
  return String(req?.socket?.remoteAddress || "unknown").trim() || "unknown";
}

export function rateLimitKey(req, bucket = "default") {
  return `${trustedClientIp(req)}:${bucket}`;
}

export function checkRateLimit(key, { max = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= max;
}
