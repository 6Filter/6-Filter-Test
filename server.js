/**
 * Production server for Render (and any Node host).
 * Serves the Vite build and the same /api/* handlers used locally.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callAnthropic } from "./lib/callAnthropic.js";
import { readJsonBody, redactSecrets, sendJson } from "./lib/http.js";
import {
  handleIdeaById,
  handleIdeaEscalate,
  handleIdeasCollection,
} from "./lib/ideasApi.js";

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
  const url = req.url?.split("?")[0] || "";

  try {
    if (url === "/api/claude") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }
      const payload = await readJsonBody(req);
      const { userText, system, image } = payload;
      if (!userText || !system) {
        sendJson(res, 400, { error: "userText and system are required." });
        return;
      }
      const { text } = await callAnthropic({ userText, system, image: image || null });
      sendJson(res, 200, { text });
      return;
    }

    if (url === "/api/ideas") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      await handleIdeasCollection(req, res, {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return;
    }

    const escalateMatch = url.match(/^\/api\/ideas\/([^/]+)\/escalate$/);
    if (escalateMatch) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      await handleIdeaEscalate(req, res, decodeURIComponent(escalateMatch[1]), {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return;
    }

    const ideaMatch = url.match(/^\/api\/ideas\/([^/]+)$/);
    if (ideaMatch) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      await handleIdeaById(req, res, decodeURIComponent(ideaMatch[1]), {
        sendJson,
        redactSecrets,
      });
      return;
    }

    await serveStatic(req, res);
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[primus] listening on ${PORT}`);
});
