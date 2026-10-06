const DEFAULT_ORIGIN = "https://ck-6-filter-test.onrender.com";

export function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedOrigin() {
  return allowedOrigins()[0] || DEFAULT_ORIGIN;
}

export function applyCors(req, res, methods) {
  const origin = req.headers?.origin;
  if (!origin || !allowedOrigins().includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}
