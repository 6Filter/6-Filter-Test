/**
 * Baseline browser headers. Styles stay 'unsafe-inline' because the app
 * injects its CSS from a JavaScript string.
 */
export function applySecurityHeaders(res) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Vite's React plugin injects an inline preamble. Production and Render
  // stay script-src 'self'. Local `npm run dev` allows that one inline script
  // so the form actually mounts.
  const devServer = !process.env.RENDER && process.env.NODE_ENV !== "production";
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      devServer ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
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
