/**
 * Baseline browser headers. Styles stay 'unsafe-inline' because the app
 * injects its CSS from a JavaScript string.
 *
 * Vite local (`viteDev: true`) must allow the React-plugin inline preamble
 * and the HMR websocket — otherwise localhost shows a blank purple page.
 */
export function applySecurityHeaders(res, { viteDev = false } = {}) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const scriptSrc = viteDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const connectSrc = viteDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
}
