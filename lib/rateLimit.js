const buckets = new Map();

export function clearRateLimits() {
  buckets.clear();
}

/**
 * Client IP for rate limits.
 *
 * Render sits behind Cloudflare. A caller can prepend X-Forwarded-For, so the
 * left-most value is not trusted. Prefer CF-Connecting-IP / True-Client-IP,
 * which the edge sets and the client cannot replace. Otherwise use the
 * right-most X-Forwarded-For entry — the address the proxy appended.
 */
export function trustedClientIp(req) {
  const headers = req?.headers || {};
  const header = (name) => {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value || "").split(",")[0].trim();
  };
  const edge = header("cf-connecting-ip") || header("true-client-ip");
  if (edge) return edge;
  const forwarded = String(headers["x-forwarded-for"] || "");
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
