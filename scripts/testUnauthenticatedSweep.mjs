/**
 * Permanent unauthenticated sweep: every /api route plus /mcp.
 * A protected route must not return 200 without a session. Scratch DB only.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

function collectRoutes() {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "apiRouter.js"), "utf8");
  const routes = new Set();
  const norm = (s) => s.replace(/\\\//g, "/").replace(/\(\[\^\/\]\+\)/g, ":id").replace(/\(\.\+\)/g, ":rest").replace(/[\^$]/g, "").replace(/\\\./g, ".");
  for (const m of src.matchAll(/["'`](\/api\/[A-Za-z0-9_\-\/:.]*)["'`]/g)) routes.add(m[1]);
  for (const m of src.matchAll(/\/\^(\\\/api\\\/[^\/\n]*(?:\\\/[^\n]*?)?)\$\//g)) routes.add(norm(m[1]));
  return [...routes].filter((r) => r.length > 5 && !r.includes("[")).sort();
}

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP unauthenticated sweep — TEST_DATABASE_URL not set");
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-sweep-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "sweep-test-session";
process.env.LOGIN_CODE_SECRET = "sweep-test-login";
process.env.MCP_ENABLED = "true";
delete process.env.POSTGRES_URL;

const { initDb, closeDatabase } = await import("../lib/db.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
const { handleMcpHttp } = await import("../lib/mcpHttp.js");
await initDb();

const SAMPLE_ID = randomUUID();
function concrete(route) {
  return route.replace(/:id|:rest|:propositionId|:ideaId/g, SAMPLE_ID).replace(/\/:[A-Za-z]+/g, `/${SAMPLE_ID}`);
}

function methodFor(route) {
  if (/bulk-delete|cleanup-untouched/.test(route)) return "DELETE";
  if (/invalidate|import$|register|token|unlock|lock$|request-code|verify-code|logout|set-team|claude|auto-fill|draft|go-nogo|retry|refresh|rescore|reassess|verify-f4|manager-|record-outcome|escalate|correct-division|request-division|reset-margin|check$/.test(route)) {
    return "POST";
  }
  return "GET";
}

/** Surfaces that are allowed to answer without a website session. */
const ANON_OK = new Set([
  "GET /api/health",
  "POST /api/auth/request-code",
  "POST /api/auth/verify-code",
  "POST /api/auth/logout",
  "GET /api/auth/me",
  "POST /api/department-auth/unlock",
  "GET /api/department-auth/me",
  "POST /api/department-auth/lock",
  "GET /.well-known/oauth-authorization-server",
  "GET /.well-known/oauth-protected-resource",
  "GET /.well-known/oauth-protected-resource/mcp",
  "GET /mcp",
  "POST /mcp/oauth/register",
  "GET /mcp/oauth/authorize",
  "POST /mcp/oauth/token",
]);

async function call(method, url, { headers = {}, body } = {}) {
  const raw = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: { host: "127.0.0.1", "content-type": "application/json", accept: "application/json", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { status: 200, headers: {}, raw: "" };
  const res = {
    get statusCode() { return o.status; },
    set statusCode(v) { o.status = v; },
    setHeader(k, v) { o.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return o.headers[String(k).toLowerCase()]; },
    writeHead(s) { o.status = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); },
  };
  if (url.startsWith("/mcp") || url.startsWith("/.well-known/")) {
    const handled = await handleMcpHttp(req, res);
    if (!handled && !o.raw) o.status = 404;
  } else {
    await handleApiRequest(req, res);
  }
  return o;
}

const mcpRoutes = [
  "/mcp",
  "/mcp/oauth/register",
  "/mcp/oauth/authorize",
  "/mcp/oauth/token",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
];

const apiRoutes = collectRoutes();
const rows = [];
let leaked = 0;
for (const route of [...apiRoutes, ...mcpRoutes]) {
  const method = methodFor(route);
  const url = concrete(route);
  const extra = route === "/mcp" ? { headers: { accept: "text/html" } } : {};
  const r = await call(method, url, extra);
  const key = `${method} ${route}`;
  const allowed = ANON_OK.has(key) || ANON_OK.has(`${method} ${url}`);
  const open = r.status === 200 || r.status === 201;
  const ok = allowed ? true : !open;
  if (!ok) leaked += 1;
  rows.push({ key, status: r.status, allowed, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  anon ${key} → ${r.status}${allowed ? " (public)" : ""}`);
}

const mcpOff = await (async () => {
  process.env.MCP_ENABLED = "false";
  const { handleMcpHttp: again } = await import("../lib/mcpHttp.js");
  const raw = "";
  const req = Object.assign(Readable.from([Buffer.from(raw)]), {
    method: "POST",
    url: "/mcp",
    headers: { host: "127.0.0.1", "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { status: 200, raw: "" };
  const res = {
    get statusCode() { return o.status; },
    set statusCode(v) { o.status = v; },
    setHeader() {},
    getHeader() {},
    writeHead(s) { o.status = s; return res; },
    write() { return true; },
    end(c) { if (c != null) o.raw += String(c); },
  };
  await again(req, res);
  return o.status;
})();
const mcpOffOk = mcpOff === 404;
console.log(`${mcpOffOk ? "PASS" : "FAIL"}  POST /mcp with MCP_ENABLED=false → ${mcpOff} (expect 404)`);
if (!mcpOffOk) leaked += 1;

try {
  await closeDatabase?.();
} finally {
  await suite.drop();
}

console.log(`\nscanned ${rows.length} routes; ${leaked} leaked`);
if (leaked) process.exit(1);
console.log("PASS testUnauthenticatedSweep");
