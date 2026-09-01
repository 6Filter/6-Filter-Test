/**
 * Production server for Render (and any Node host).
 * Serves the Vite build and the same /api/* handlers used locally.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./lib/apiRouter.js";
import { redactSecrets, sendJson } from "./lib/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 10000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(DIST, relative);
  if (!resolved.startsWith(DIST)) return null;
  return resolved;
}

async function serveStatic(req, res) {
  const filePath = safeFilePath(req.url);
  if (!filePath) {
    res.statusCode = 400;
    res.end("Bad path");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.end(body);
  } catch {
    try {
      const index = await readFile(path.join(DIST, "index.html"));
      res.setHeader("Content-Type", MIME[".html"]);
      res.end(index);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  }
}

const server = createServer(async (req, res) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (handled) return;
    await serveStatic(req, res);
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[primus] listening on ${PORT}`);
});
