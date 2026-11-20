/**
 * D148–D150. Gzip text answers and set cache headers.
 * The bytes decompress to the same body. Security headers are left as the caller set them.
 */
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";

const gzipCache = new Map();

function endArgs(args) {
  let chunk;
  let encoding;
  let callback;
  if (typeof args[0] === "function") return { callback: args[0] };
  if (args.length > 0) chunk = args[0];
  if (typeof args[1] === "function") callback = args[1];
  else if (typeof args[1] === "string") {
    encoding = args[1];
    if (typeof args[2] === "function") callback = args[2];
  }
  return { chunk, encoding, callback };
}

function toBuffer(chunk, encoding) {
  if (chunk == null || chunk === "") return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  return Buffer.from(chunk, encoding || "utf8");
}

function acceptsGzip(header) {
  for (const part of String(header || "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (name.trim().toLowerCase() !== "gzip") continue;
    const q = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith("q="));
    if (!q) return true;
    const n = Number(q.slice(2));
    return Number.isFinite(n) && n > 0;
  }
  return false;
}

function isTextLike(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  return (
    type === "text/html" ||
    type === "text/css" ||
    type === "text/javascript" ||
    type === "application/javascript" ||
    type === "application/json" ||
    type === "image/svg+xml"
  );
}

function isHashedAsset(urlPath) {
  return /^\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(urlPath);
}

function applyCachePolicy(req, res) {
  const urlPath = String(req.url || "/").split("?")[0];
  if (urlPath === "/api" || urlPath.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    return;
  }
  if (isHashedAsset(urlPath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  const type = String(res.getHeader("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (urlPath === "/" || urlPath.endsWith("/index.html") || type === "text/html") {
    res.setHeader("Cache-Control", "no-cache");
  }
}

function addVary(res) {
  const current = res.getHeader("Vary");
  const values = (Array.isArray(current) ? current : [current])
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === "accept-encoding")) values.push("Accept-Encoding");
  res.setHeader("Vary", values.join(", "));
}

function staticCacheKey(req, body) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") return "";
  const urlPath = String(req.url || "/").split("?")[0];
  if (urlPath === "/api" || urlPath.startsWith("/api/")) return "";
  return `${urlPath}:${createHash("sha256").update(body).digest("hex")}`;
}

export function installHttpPerformance(req, res) {
  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res);
  const chunks = [];
  let settled = false;

  res.write = function write(chunk, encoding, callback) {
    if (settled) return originalWrite(chunk, encoding, callback);
    if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }
    const buf = toBuffer(chunk, encoding);
    if (buf) chunks.push(buf);
    if (typeof callback === "function") callback();
    return true;
  };

  res.end = function end(...args) {
    if (settled) return originalEnd();
    settled = true;
    const { chunk, encoding, callback } = endArgs(args);
    const buf = toBuffer(chunk, encoding);
    if (buf) chunks.push(buf);
    const body = chunks.length === 0 ? Buffer.alloc(0) : chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    applyCachePolicy(req, res);

    const status = res.statusCode || 200;
    const method = String(req.method || "GET").toUpperCase();
    const type = res.getHeader("Content-Type");
    const disposition = String(res.getHeader("Content-Disposition") || "");
    const alreadyEncoded = Boolean(res.getHeader("Content-Encoding"));
    const emptyStatus = status === 204 || status === 304;
    const textLike = isTextLike(type);
    const canConsider =
      method !== "HEAD" && !emptyStatus && !alreadyEncoded && textLike && !/attachment/i.test(disposition);

    if (canConsider) addVary(res);
    if (emptyStatus) return originalEnd(callback);
    if (!canConsider || body.length < 1024 || !acceptsGzip(req.headers["accept-encoding"])) {
      if (chunks.length === 0) return originalEnd(callback);
      return originalEnd(body, callback);
    }

    const cacheKey = staticCacheKey(req, body);
    const send = (zipped) => {
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", String(zipped.length));
      return originalEnd(zipped, callback);
    };
    const cached = cacheKey ? gzipCache.get(cacheKey) : undefined;
    if (cached) return send(cached);
    gzip(body, (err, zipped) => {
      if (err || !zipped) {
        if (chunks.length === 0) return originalEnd(callback);
        return originalEnd(body, callback);
      }
      if (cacheKey) gzipCache.set(cacheKey, zipped);
      send(zipped);
    });
  };
}
