/**
 * Route-by-role access matrix, including /mcp.
 * Roles: anonymous, BM (member), BH FORUM (manager approve), ADMIN.
 * Team password gate is currently off, so member±unlock collapses to BM with open access.
 * There is no OWNER role — ADMIN is the owner account.
 * Scratch DB only. Prints a compact matrix; fails if a cell violates the expected band.
 */
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP access matrix — TEST_DATABASE_URL not set");
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-matrix-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "matrix-test-session";
process.env.LOGIN_CODE_SECRET = "matrix-test-login";
process.env.MCP_ENABLED = "true";
delete process.env.POSTGRES_URL;

const { initDb, findOrCreateSlackUser, closeDatabase } = await import("../lib/db.js");
const { signSession } = await import("../lib/auth.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
const { handleMcpHttp } = await import("../lib/mcpHttp.js");
await initDb();

const users = {
  anonymous: null,
  member: await findOrCreateSlackUser({ email: "matrix-bm@example.com", name: "Matrix BM", role: "BM", externalId: "U_MX_BM" }),
  manager: await findOrCreateSlackUser({ email: "matrix-bh@example.com", name: "Matrix BH", role: "BH FORUM", externalId: "U_MX_BH" }),
  admin: await findOrCreateSlackUser({ email: "matrix-admin@example.com", name: "Matrix Admin", role: "ADMIN", externalId: "U_MX_AD" }),
};

function cookieFor(u) {
  if (!u) return "";
  return `primus_session=${signSession({ userId: u.id, tokenVersion: Number(u.tokenVersion ?? u.token_version ?? 1) })}`;
}

async function call(method, url, role, { headers = {}, body } = {}) {
  const raw = body == null ? "" : JSON.stringify(body);
  const cookie = cookieFor(users[role]);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: {
      host: "127.0.0.1",
      "content-type": "application/json",
      accept: headers.accept || "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { status: 200, raw: "" };
  const res = {
    get statusCode() { return o.status; },
    set statusCode(v) { o.status = v; },
    setHeader() {},
    getHeader() {},
    writeHead(s) { o.status = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); },
  };
  if (url.startsWith("/mcp") || url.startsWith("/.well-known/")) await handleMcpHttp(req, res);
  else await handleApiRequest(req, res);
  return o.status;
}

/** Expected: open (2xx), auth (401), forbid (403 or 404 hide), other listed statuses. */
const PROBES = [
  { method: "GET", url: "/api/health", expect: { anonymous: "open", member: "open", manager: "open", admin: "open" } },
  { method: "GET", url: "/api/auth/me", expect: { anonymous: "open", member: "open", manager: "open", admin: "open" } },
  { method: "GET", url: "/api/propositions", expect: { anonymous: "auth", member: "open", manager: "open", admin: "open" } },
  { method: "GET", url: "/api/admin/users", expect: { anonymous: "auth", member: "forbid", manager: "forbid", admin: "open" } },
  { method: "GET", url: "/api/admin/research-incomplete", optional: true, expect: { anonymous: "auth", member: "forbid", manager: "forbid", admin: "open" } },
  { method: "GET", url: "/api/admin/mcp/audit", expect: { anonymous: "auth", member: "forbid", manager: "forbid", admin: "open" } },
  { method: "GET", url: "/api/admin/db-forensics", expect: { anonymous: "auth", member: "forbid", manager: "forbid", admin: "open" } },
  { method: "GET", url: "/api/admin/backup/export", expect: { anonymous: "auth", member: "forbid", manager: "forbid", admin: [200, 429, 503] } },
  { method: "POST", url: "/mcp", expect: { anonymous: "auth", member: "auth", manager: "auth", admin: "auth" } },
  { method: "GET", url: "/mcp", headers: { accept: "text/html" }, expect: { anonymous: "open", member: "open", manager: "open", admin: "open" } },
  { method: "GET", url: "/.well-known/oauth-authorization-server", expect: { anonymous: "open", member: "open", manager: "open", admin: "open" } },
  { method: "POST", url: "/mcp/oauth/register", body: { redirect_uris: ["http://127.0.0.1/callback"] }, expect: { anonymous: "open", member: "open", manager: "open", admin: "open" } },
];

function band(status) {
  if (status >= 200 && status < 300) return "open";
  if (status === 401) return "auth";
  if (status === 403 || status === 404) return "forbid";
  return String(status);
}

function matches(expected, status) {
  if (Array.isArray(expected)) return expected.includes(status);
  return band(status) === expected;
}

const roles = ["anonymous", "member", "manager", "admin"];
let failed = 0;
const table = [];
console.log("role key: anonymous | member=BM | manager=BH FORUM | admin=ADMIN");
console.log("team lock: PLATFORM_TEAM_LOCK_ENABLED=false (member unlock not in force)");
console.log("");
console.log(`${"probe".padEnd(48)} ${roles.map((r) => r.padEnd(10)).join(" ")}`);
for (const probe of PROBES) {
  if (probe.optional) {
    const present = await call(probe.method, probe.url, "admin", { headers: probe.headers, body: probe.body });
    if (present === 404) {
      console.log(`${`${probe.method} ${probe.url}`.padEnd(48)} skipped (not on this tree)`);
      continue;
    }
  }
  const cells = [];
  for (const role of roles) {
    const status = await call(probe.method, probe.url, role, { headers: probe.headers, body: probe.body });
    const ok = matches(probe.expect[role], status);
    if (!ok) failed += 1;
    cells.push(`${ok ? "" : "!"}${status}`);
    table.push({ probe: `${probe.method} ${probe.url}`, role, status, ok });
  }
  console.log(`${`${probe.method} ${probe.url}`.padEnd(48)} ${cells.map((c) => c.padEnd(10)).join(" ")}`);
}

try {
  await closeDatabase?.();
} finally {
  await suite.drop();
}

if (failed) {
  console.error(`\n${failed} matrix cell(s) off`);
  process.exit(1);
}
console.log("\nPASS testAccessMatrix");
