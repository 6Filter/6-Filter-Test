/**
 * Every API route is called and the effect is asserted: status, and no idea
 * or secret in an anonymous body. Sign out clears the session cookie.
 * Clean up untouched drafts removes a blank draft and leaves a named idea.
 * File store only. No Claude call.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "surface-effect-session-secret-xxxxxx";
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-surface-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const db = await import("../lib/db.js");
const { signSession } = await import("../lib/auth.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");

await db.initDb();

const admin = await db.createUser({
  name: "Surface Admin",
  email: "surface.admin@cavinkare.com",
  role: "ADMIN",
  team: "CIA",
});
const owner = await db.createUser({
  name: "Surface Owner",
  email: "surface.owner@cavinkare.com",
  role: "BM",
  team: "CIA",
});

const named = await db.createProposition({
  createdByUserId: owner.id,
  createdByEmail: owner.email,
  submitterName: owner.name,
  submitterDepartment: "CIA",
});
await db.updateProposition(
  named.id,
  { name: "Named idea stays", category: "Hair oils", ideaDescription: "This one has a name." },
  { bumpVersion: false }
);
const blank = await db.createProposition({
  createdByUserId: owner.id,
  createdByEmail: owner.email,
  submitterName: owner.name,
  submitterDepartment: "CIA",
});

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
  const handled = await handleApiRequest(req, res);
  assert.equal(handled, true, `${method} ${url} was not an API route`);
  let json = null;
  try {
    json = JSON.parse(o.raw || "null");
  } catch {
    json = null;
  }
  return { status: o.statusCode, json, raw: o.raw, headers: o.headers };
}

function noLeak(raw, label) {
  const text = String(raw || "");
  assert.equal(/sk-ant-|ANTHROPIC_API_KEY|SESSION_SECRET|postgres:\/\//i.test(text), false, `${label} leaked a secret`);
  assert.equal(text.includes("Named idea stays"), false, `${label} leaked a named idea`);
  assert.equal(text.includes("This one has a name."), false, `${label} leaked an idea description`);
}

const id = "does-not-exist";
const protectedRoutes = [
  ["GET", "/api/billing/usage"],
  ["GET", "/api/admin/db-forensics"],
  ["GET", "/api/admin/audit"],
  ["POST", "/api/admin/research-cache/invalidate"],
  ["POST", "/api/admin/syndicated/import"],
  ["GET", "/api/admin/replay"],
  ["GET", "/api/admin/scoring-audit"],
  ["POST", "/api/admin/scoring-rescore"],
  ["GET", "/api/admin/finance-gst-rates"],
  ["GET", "/api/admin/backup/export"],
  ["POST", "/api/admin/mcp/revoke"],
  ["GET", "/api/admin/mcp/audit"],
  ["GET", "/api/admin/mcp/access-requests"],
  ["POST", "/api/auth/set-team"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/division-thresholds"],
  ["PUT", `/api/division-thresholds/${id}`],
  ["GET", "/api/providers"],
  ["POST", "/api/claude"],
  ["POST", "/api/idea-analysis"],
  ["POST", "/api/idea-analysis"],
  ["GET", "/api/ideas"],
  ["GET", "/api/propositions"],
  ["GET", "/api/stats/ideas"],
  ["GET", "/api/propositions/import-template"],
  ["POST", "/api/propositions/import"],
  ["DELETE", "/api/propositions/bulk-delete"],
  ["DELETE", "/api/propositions/cleanup-untouched"],
  ["POST", `/api/propositions/${id}/check`],
  ["POST", `/api/propositions/${id}/go-nogo`],
  ["POST", `/api/propositions/${id}/rescore-from-evidence`],
  ["GET", `/api/propositions/${id}/evidence-file`],
  ["POST", `/api/propositions/${id}/manager-draft`],
  ["POST", `/api/propositions/${id}/auto-fill`],
  ["POST", `/api/propositions/${id}/draft`],
  ["POST", `/api/propositions/${id}/concept-card`],
  ["POST", `/api/propositions/${id}/retry-step`],
  ["POST", `/api/propositions/${id}/refresh-field`],
  ["POST", `/api/propositions/${id}/correct-division`],
  ["POST", `/api/propositions/${id}/request-division-review`],
  ["GET", "/api/admin/division-confirmations"],
  ["POST", `/api/propositions/${id}/reset-margin-floor`],
  ["POST", `/api/propositions/${id}/reassess-f4`],
  ["POST", `/api/propositions/${id}/verify-f4`],
  ["POST", `/api/propositions/${id}/request-manager-review`],
  ["POST", `/api/propositions/${id}/manager-approve`],
  ["POST", `/api/propositions/${id}/manager-reject`],
  ["GET", `/api/propositions/${id}`],
  ["GET", `/api/ideas/${id}/supporting-doc/${id}`],
  ["POST", `/api/ideas/${id}/supporting-doc`],
  ["GET", `/api/ideas/${id}/export`],
  ["POST", `/api/ideas/${id}/escalate`],
  ["POST", `/api/ideas/${id}/record-outcome`],
  ["GET", `/api/ideas/${id}`],
  ["POST", "/api/calibration"],
  ["POST", "/api/category-sizing/run"],
  ["POST", "/api/format-trend/run"],
  ["GET", `/api/category-sizing/export/${id}`],
  ["POST", `/api/category-sizing/${id}/engine/${id}`],
];

const routerSrc = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
const declared = [...routerSrc.matchAll(/url === "(\/api\/[^"]+)"/g)].map((m) => m[1]);
const coveredStatic = new Set(
  protectedRoutes.map(([, url]) => url).concat([
    "/api/health",
    "/api/auth/request-code",
    "/api/auth/verify-code",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/department-auth/unlock",
    "/api/department-auth/me",
    "/api/department-auth/lock",
  ])
);
for (const url of declared) {
  assert.equal(coveredStatic.has(url), true, `route ${url} has no effect test`);
}

for (const [method, url] of protectedRoutes) {
  const res = await api(method, url, { body: method === "GET" ? null : {} });
  assert.equal(res.status, 401, `${method} ${url} anonymous status ${res.status}`);
  assert.match(String(res.json?.error || ""), /Sign in required/i, `${method} ${url}`);
  noLeak(res.raw, `${method} ${url}`);
}

const health = await api("GET", "/api/health");
assert.equal(health.status, 200);
assert.equal(health.json?.ok, true);
assert.equal(health.json?.scoringRuleset, "v5.7");
noLeak(health.raw, "health");

const requestCode = await api("POST", "/api/auth/request-code", { body: {} });
assert.equal(requestCode.status, 503);
noLeak(requestCode.raw, "request-code");

const verifyCode = await api("POST", "/api/auth/verify-code", { body: { email: "a@cavinkare.com", code: "000000" } });
assert.equal(verifyCode.status, 503);
noLeak(verifyCode.raw, "verify-code");

const me = await api("GET", "/api/auth/me");
assert.equal(me.status, 503);
assert.equal(me.json?.user, undefined);
noLeak(me.raw, "me");

const unlock = await api("POST", "/api/department-auth/unlock", { body: {} });
assert.equal(unlock.status, 400);
noLeak(unlock.raw, "department unlock");

const deptMe = await api("GET", "/api/department-auth/me");
assert.equal(deptMe.status, 200);
assert.equal(deptMe.json?.department == null || typeof deptMe.json?.department === "string", true);
noLeak(deptMe.raw, "department me");

const lock = await api("POST", "/api/department-auth/lock", { body: {} });
assert.ok(lock.status === 200 || lock.status === 204, `department lock ${lock.status}`);
noLeak(lock.raw, "department lock");

const missing = await api("GET", "/api/no-such-route");
assert.equal(missing.status, 404);
assert.equal(missing.json?.error, "Not found.");
noLeak(missing.raw, "unknown route");

const signedOut = await api("POST", "/api/auth/logout", { user: owner });
assert.equal(signedOut.status, 200);
assert.equal(signedOut.json?.user, null);
const cleared = String(signedOut.headers["set-cookie"] || "");
assert.match(cleared, /primus_session=/);
assert.match(cleared, /Max-Age=0/);
const afterSignOut = await api("GET", "/api/propositions");
assert.equal(afterSignOut.status, 401);

const cleanup = await api("DELETE", "/api/propositions/cleanup-untouched", { user: admin });
assert.equal(cleanup.status, 200);
assert.equal(Array.isArray(cleanup.json?.ids), true);
assert.equal(cleanup.json.ids.includes(blank.id), true);
assert.equal(cleanup.json.ids.includes(named.id), false);
const namedStill = await api("GET", `/api/propositions/${named.id}`, { user: owner });
assert.equal(namedStill.status, 200);
assert.equal(namedStill.json?.proposition?.name, "Named idea stays");
const blankGone = await api("GET", `/api/propositions/${blank.id}`, { user: admin });
assert.equal(blankGone.status, 404);

console.log(
  `PASS testSurfaceEffects — ${protectedRoutes.length} protected routes refuse anonymously, sign-out clears the cookie, cleanup deletes only the blank draft`
);
