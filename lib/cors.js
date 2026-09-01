const DEFAULT_ORIGIN = "https://six-filter-test.onrender.com";

export function allowedOrigin() {
  return process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
}

export function applyCors(req, res, methods) {
  const origin = req.headers?.origin;
  if (origin && origin === allowedOrigin()) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
