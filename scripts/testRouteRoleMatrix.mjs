/**
 * Route × role matrix (no Anthropic). File store only.
 * ADMIN may open any idea and any /api/admin route. A BM may open only their own idea
 * and is refused on admin routes. No session is 401 on data routes.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "role-matrix-session-secret-xxxxxxxx";
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-role-matrix-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const db = await import("../lib/db.js");
const { signSession } = await import("../lib/auth.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");

await db.initDb();

const admin = await db.createUser({
  name: "Admin User",
  email: "admin.role@cavinkare.com",
  role: "ADMIN",
  team: "R&D",
});
const owner = await db.createUser({
  name: "Owner Bm",
  email: "owner.role@cavinkare.com",
  role: "BM",
  team: "R&D",
});
const other = await db.createUser({
  name: "Other Bm",
  email: "other.role@cavinkare.com",
  role: "BM",
  team: "CC",
});

const mine = await db.createProposition({
  createdByUserId: owner.id,
  createdByEmail: owner.email,
  submitterName: owner.name,
  submitterDepartment: "R&D",
});
await db.updateProposition(mine.id, { name: "Owner idea", category: "Hair oils", ideaDescription: "Own row." }, { bumpVersion: false });

const theirs = await db.createProposition({
  createdByUserId: other.id,
  createdByEmail: other.email,
  submitterName: other.name,
  submitterDepartment: "CC",
});
await db.updateProposition(theirs.id, { name: "Other idea", category: "Soaps", ideaDescription: "Other row." }, { bumpVersion: false });

function cookieFor(user) {
  return `primus_session=${signSession({ userId: user.id, tokenVersion: Number(user.tokenVersion) || 1 })}`;
}

async function api(method, url, { user = null, body = null } = {}) {
  const raw = body == null ? "" : JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (user) headers.cookie = cookieFor(user);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { statusCode: 200, headers: {}, raw: "" };
  const res = {
    get statusCode() {
      return o.statusCode;
    },
    set statusCode(v) {
      o.statusCode = v;
    },
    setHeader(k, v) {
      o.headers[String(k).toLowerCase()] = v;
    },
    getHeader(k) {
      return o.headers[String(k).toLowerCase()];
    },
    writeHead(s) {
      o.statusCode = s;
      return res;
    },
    write(c) {
      if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c);
      return true;
    },
    end(c) {
      if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c);
    },
  };
  await handleApiRequest(req, res);
  let json = null;
  try {
    json = JSON.parse(o.raw || "null");
  } catch {
    /* ignore */
  }
  return { status: o.statusCode, json };
}

const ADMIN_GET = [
  "/api/admin/db-forensics",
  "/api/admin/audit",
  "/api/admin/replay",
  "/api/admin/scoring-audit",
  "/api/admin/finance-gst-rates",
  "/api/admin/mcp/audit",
  "/api/admin/users",
];
const ADMIN_POST = ["/api/admin/research-cache/invalidate", "/api/admin/scoring-rescore"];

let checks = 0;
function check(name, ok) {
  assert.ok(ok, name);
  checks += 1;
}

for (const url of ADMIN_GET) {
  const anon = await api("GET", url);
  check(`${url} with no session is 401`, anon.status === 401);
  const bm = await api("GET", url, { user: owner });
  check(`${url} as BM is refused`, bm.status === 403 || bm.status === 404);
  const adm = await api("GET", url, { user: admin });
  check(`${url} as ADMIN is not a BM-style refuse`, adm.status !== 401 && adm.status !== 403 && adm.status !== 404);
}

for (const url of ADMIN_POST) {
  const anon = await api("POST", url, { body: {} });
  check(`${url} with no session is 401`, anon.status === 401);
  const bm = await api("POST", url, { user: owner, body: {} });
  check(`${url} as BM is 403`, bm.status === 403);
}

const cleanupAnon = await api("DELETE", "/api/propositions/cleanup-untouched");
check("cleanup-untouched with no session is 401", cleanupAnon.status === 401);
const cleanupBm = await api("DELETE", "/api/propositions/cleanup-untouched", { user: owner });
check("cleanup-untouched as BM is 403", cleanupBm.status === 403);

const health = await api("GET", "/api/health");
check("health stays open without a session", health.status === 200 && health.json?.ok === true);

const own = await api("GET", `/api/propositions/${mine.id}`, { user: owner });
check("BM can open their own idea", own.status === 200 && own.json?.proposition?.id === mine.id);

const hidden = await api("GET", `/api/propositions/${theirs.id}`, { user: owner });
check("BM cannot open another team's idea", hidden.status === 404);

const adminSees = await api("GET", `/api/propositions/${theirs.id}`, { user: admin });
check("ADMIN can open another team's idea", adminSees.status === 200 && adminSees.json?.proposition?.id === theirs.id);

const otherOwn = await api("GET", `/api/propositions/${theirs.id}`, { user: other });
check("the other BM can open their own idea", otherOwn.status === 200);

console.log(`testRouteRoleMatrix: ${checks} checks passed`);
