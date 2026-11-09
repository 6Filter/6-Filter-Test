/**
 * Baseline browser headers. Styles stay 'unsafe-inline' because the app
 * injects its CSS from a JavaScript string.
 *
 * The Vite dev server injects the React refresh preamble as an inline module.
 * That exception is dev-only. Production (server.js) keeps script-src 'self'.
 */
export function applySecurityHeaders(res, { dev = false } = {}) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
}
