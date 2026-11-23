/**
 * R6: MCP list_ideas / open_idea / read_verdict follow canAccessIdea and show the four titles.
 */
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP testMcpTitles — TEST_DATABASE_URL not set");
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `mcp-titles-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "mcp-titles-session";
process.env.LOGIN_CODE_SECRET = "mcp-titles-login";
process.env.ANTHROPIC_API_KEY = "sk-ant-stub-infra-only";
process.env.SLACK_BOT_TOKEN = "xoxb-stub-local-only";
process.env.MCP_ENABLED = "true";

const slack = { dms: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const target = String(url);
  if (target.includes("slack.com/api/users.lookupByEmail")) {
    const email = new URL(target).searchParams.get("email");
    return new Response(JSON.stringify({ ok: true, user: { id: `U_${email.split("@")[0]}`, profile: { real_name: email, email } } }), { status: 200 });
  }
  if (target.includes("slack.com/api/conversations.open")) {
    const body = JSON.parse(opts.body || "{}");
    return new Response(JSON.stringify({ ok: true, channel: { id: `D_${body.users}` } }), { status: 200 });
  }
  if (target.includes("slack.com/api/chat.postMessage")) {
    slack.dms.push(JSON.parse(opts.body || "{}"));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (target === "https://claude.ai/oauth/mcp-oauth-client-metadata") {
    return new Response(JSON.stringify({
      client_id: target,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, opts);
};

const db = await import("../lib/db.js");
const { handleMcpHttp } = await import("../lib/mcpHttp.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
const auth = await import("../lib/auth.js");
await db.initDb();

function http({ method, url, body, headers = {} }) {
  const raw = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: { host: "127.0.0.1", "x-forwarded-proto": "http", "content-type": typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { statusCode: 200, headers: {}, raw: "" };
  const res = {
    get statusCode() { return o.statusCode; },
    set statusCode(v) { o.statusCode = v; },
    setHeader(k, v) { o.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return o.headers[String(k).toLowerCase()]; },
    writeHead(s) { o.statusCode = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); },
  };
  return handleMcpHttp(req, res).then(() => o);
}

async function connectorToken(email) {
  const registered = await http({ method: "POST", url: "/mcp/oauth/register", body: { redirect_uris: ["http://127.0.0.1/callback"] } });
  const client = JSON.parse(registered.raw);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const start = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1/callback",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "pilot",
    response_type: "code",
  });
  await http({
    method: "POST",
    url: `/mcp/oauth/authorize?${start}`,
    body: `step=email&email=${encodeURIComponent(email)}`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const code = (slack.dms.at(-1)?.text || "").match(/\b(\d{6})\b/)?.[1] || "";
  const signed = await http({
    method: "POST",
    url: `/mcp/oauth/authorize?${start}`,
    body: `step=code&email=${encodeURIComponent(email)}&code=${code}`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const oauthCode = new URL(String(signed.headers.location || "http://127.0.0.1/callback")).searchParams.get("code");
  const tokenRes = await http({
    method: "POST",
    url: "/mcp/oauth/token",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: oauthCode || "",
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1/callback",
      code_verifier: verifier,
    }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  return JSON.parse(tokenRes.raw || "{}");
}

async function rpc(token, message) {
  const o = await http({
    method: "POST",
    url: "/mcp",
    body: message,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  return JSON.parse(o.raw || "null");
}

function parseTool(result) {
  return JSON.parse(result?.result?.content?.[0]?.text || "{}");
}

const admin = await db.findOrCreateSlackUser({ email: "admin.titles@cavinkare.com", name: "Admin Titles", role: "ADMIN", externalId: "U_admin_t" });
const ic = await db.findOrCreateSlackUser({ email: "ic.titles@cavinkare.com", name: "Ic Titles", role: "BM", externalId: "U_ic_t" });
const lead = await db.findOrCreateSlackUser({ email: "lead.titles@cavinkare.com", name: "Lead Titles", role: "BM", externalId: "U_lead_t" });
const head = await db.findOrCreateSlackUser({ email: "head.titles@cavinkare.com", name: "Head Titles", role: "BM", externalId: "U_head_t" });
await db.setUserTeam(ic.id, "R&D", { onlyIfEmpty: true });
await db.setUserTeam(lead.id, "R&D", { onlyIfEmpty: true });
await db.setUserTeam(head.id, "R&D", { onlyIfEmpty: true });
await db.setUserTeam(admin.id, "CIA", { onlyIfEmpty: true });
process.env.MCP_ALLOWED_EMAILS = [admin, ic, lead, head].map((row) => row.email).join(",");

const icIdea = await db.createProposition({ createdByEmail: ic.email, createdByUserId: ic.id, submitterName: "Ic", submitterDepartment: "R&D", name: "Ic idea" });
const otherIdea = await db.createProposition({ createdByEmail: admin.email, createdByUserId: admin.id, submitterName: "Admin", submitterDepartment: "PC", name: "Pc idea" });

const cookie = `primus_session=${auth.signSession({ userId: admin.id, tokenVersion: Number(admin.tokenVersion) || 1 })}`;
async function adminApi(method, url, body) {
  const raw = body == null ? "" : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: { "content-type": "application/json", cookie },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { statusCode: 200, raw: "" };
  const res = {
    get statusCode() { return o.statusCode; },
    set statusCode(v) { o.statusCode = v; },
    setHeader() {},
    getHeader() {},
    writeHead(s) { o.statusCode = s; return res; },
    write(c) { if (c != null) o.raw += String(c); return true; },
    end(c) { if (c != null) o.raw += String(c); },
  };
  await handleApiRequest(req, res);
  return o.statusCode;
}
assert.equal(await adminApi("POST", "/api/admin/users/business-head-teams", { rows: [{ email: head.email, team: "R&D" }] }), 200);
const csv = [
  "email,name,team,org_role,reports_to_email",
  `${head.email},Head Titles,R&D,BUSINESS_HEAD,`,
  `${lead.email},Lead Titles,R&D,TEAM_LEAD,${head.email}`,
  `${ic.email},Ic Titles,R&D,MEMBER,${lead.email}`,
].join("\n");
const preview = await adminApi("POST", "/api/admin/users/roster/preview", { csv });
assert.ok(preview === 200 || preview === 400, `roster preview HTTP ${preview}`);
const applied = await adminApi("POST", "/api/admin/users/roster/apply", { csv, confirm: true });
assert.equal(applied, 200, `roster apply HTTP ${applied}`);

const want = {
  [ic.email]: "Individual contributor",
  [lead.email]: "Team Lead",
  [head.email]: "Business Head",
  [admin.email]: "Admin",
};

for (const [email, title] of Object.entries(want)) {
  const token = (await connectorToken(email)).access_token;
  const listed = parseTool(await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_ideas", arguments: {} } }));
  assert.equal(listed.title, title, `${email} list title`);
  const ids = new Set((listed.ideas || []).map((r) => r.id));
  if (title === "Individual contributor") {
    assert.equal(ids.has(icIdea.id), true);
    assert.equal(ids.has(otherIdea.id), false);
  }
  if (title === "Team Lead") {
    assert.equal(ids.has(icIdea.id), true, "lead must see the report's idea");
    assert.equal(ids.has(otherIdea.id), false);
  }
  if (title === "Business Head") {
    assert.equal(ids.has(icIdea.id), true);
    assert.equal(ids.has(otherIdea.id), false);
  }
  if (title === "Admin") {
    assert.equal(ids.has(icIdea.id) && ids.has(otherIdea.id), true);
  }
  const opened = parseTool(await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "open_idea", arguments: { ideaId: icIdea.id } } }));
  assert.equal(opened.title, title, `${email} open title`);
  const verdict = parseTool(await rpc(token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_verdict", arguments: { ideaId: icIdea.id } } }));
  assert.equal(verdict.title, title, `${email} verdict title`);
}

console.log("PASS testMcpTitles");
await suite.drop().catch(() => {});
