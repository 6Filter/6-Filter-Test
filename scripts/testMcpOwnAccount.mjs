/**
 * Remote MCP: each person signs in with their work email.
 * Their Claude account is the chat client. This server never takes an API key.
 * A member sees only the ideas they are allowed to see.
 * Screening is tagged with that team's stored key.
 */
import { createHash, randomBytes } from "node:crypto";
import httpServer from "node:http";
import { Readable } from "node:stream";
import assert from "node:assert/strict";

const { installHttpPerformance } = await import("../lib/httpPerformance.js");
{
  const sent = [];
  const req = { method: "GET", url: "/mcp", headers: { "accept-encoding": "gzip" } };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    write(chunk) { sent.push(Buffer.from(chunk).toString()); return true; },
    end(chunk) { if (chunk) sent.push(Buffer.from(chunk).toString()); },
  };
  installHttpPerformance(req, res);
  res.setHeader("Content-Type", "text/event-stream");
  const chunk = `data: ${"x".repeat(1200)}\n\n`;
  res.write(chunk);
  res.write("data: two\n\n");
  res.end();
  if (sent.join("") !== chunk + "data: two\n\n" || res.getHeader("content-encoding") || res.getHeader("cache-control") !== "no-store") {
    console.error("FAIL an event stream on /mcp was buffered, compressed, or cached");
    process.exit(1);
  }
}

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP MCP: TEST_DATABASE_URL not set");
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
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "mcp-test-session";
process.env.LOGIN_CODE_SECRET = "mcp-test-login";
process.env.DEPARTMENT_KEY_ENCRYPTION_SECRET = "mcp-test-department";
process.env.ANTHROPIC_API_KEY = "sk-ant-stub-infra-only";
process.env.SLACK_BOT_TOKEN = "xoxb-stub-local-only";
process.env.MCP_ENABLED = "true";
const DEPT_KEY = "sk-ant-stub-local-only";

const slack = { dms: [] };
const anthropic = [];
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
    const body = JSON.parse(opts.body || "{}");
    slack.dms.push(body);
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
  if (target.includes("api.anthropic.com")) {
    anthropic.push(String(opts.headers?.["x-api-key"] || ""));
    return new Response(JSON.stringify({ content: [{ type: "text", text: "{\"reconciliation\":{\"status\":\"INSUFFICIENT\"}}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }
  return realFetch(url, opts);
};

const db = await import("../lib/db.js");
const { signSession } = await import("../lib/auth.js");
const { encryptApiKey, resolveBillingApiKey } = await import("../lib/departmentApiKeys.js");
const { SUBMITTER_DEPARTMENTS, billingTeamName } = await import("../lib/propositionFields.js");
const { unlockedDepartmentOf } = await import("../lib/propositionAccess.js");
const { handleMcpHttp } = await import("../lib/mcpHttp.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
await db.initDb();
await db.upsertDepartmentApiKeyCiphertext("CIA", encryptApiKey(DEPT_KEY));

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
  if (!ok) failed += 1;
};

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

function apiCall({ method, url, body, cookie }) {
  const raw = body == null ? "" : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: {
      host: "127.0.0.1",
      "content-type": "application/json",
      ...(cookie ? { cookie: `primus_session=${encodeURIComponent(cookie)}` } : {}),
    },
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
  return handleApiRequest(req, res).then(() => o);
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
  return { status: o.statusCode, json: JSON.parse(o.raw || "null"), raw: o.raw };
}

const admin = await db.findOrCreateSlackUser({ email: "admin.mcp@cavinkare.com", name: "Admin Mcp", role: "ADMIN", externalId: "U_admin" });
await db.setUserTeam(admin.id, "CIA", { onlyIfEmpty: true });
const member = await db.findOrCreateSlackUser({ email: "member.mcp@cavinkare.com", name: "Member Mcp", role: "BM", externalId: "U_member" });
await db.setUserTeam(member.id, "CIA", { onlyIfEmpty: true });
const adminRow = await db.getUserByEmail("admin.mcp@cavinkare.com");
const memberRow = await db.getUserByEmail("member.mcp@cavinkare.com");
const adminToken = signSession({ userId: adminRow.id, tokenVersion: Number(adminRow.tokenVersion) || 1 });

const memberIdea = await db.createProposition({ createdByEmail: memberRow.email, createdByUserId: memberRow.id, submitterName: "Member Mcp", submitterDepartment: "CIA" });
const otherIdea = await db.createProposition({ createdByEmail: adminRow.email, createdByUserId: adminRow.id, submitterName: "Admin Mcp", submitterDepartment: "R&D" });

const registered = await http({
  method: "POST",
  url: "/mcp/oauth/register",
  body: { redirect_uris: ["http://127.0.0.1/callback"] },
});
const client = JSON.parse(registered.raw);
const page = await http({ method: "GET", url: `/mcp/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent("http://127.0.0.1/callback")}&code_challenge=abc&code_challenge_method=S256&state=s` });
check("the sign-in page asks for a work email and has no key field", page.statusCode === 200 && /name="email"/.test(page.raw) && !/name="(api[_-]?key|password|token)"/i.test(page.raw));
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
  body: `step=email&email=${encodeURIComponent(memberRow.email)}`,
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
const code = (slack.dms.at(-1)?.text || "").match(/\b(\d{6})\b/)?.[1] || "";
const signed = await http({
  method: "POST",
  url: `/mcp/oauth/authorize?${start}`,
  body: `step=code&email=${encodeURIComponent(memberRow.email)}&code=${code}`,
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
const location = String(signed.headers.location || "");
const oauthCode = new URL(location || "http://127.0.0.1/callback").searchParams.get("code");
check("email-code sign-in returns to the client with a code", signed.statusCode === 302 && Boolean(oauthCode) && location.includes("state=pilot"), `HTTP ${signed.statusCode}`);
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
const tokenJson = JSON.parse(tokenRes.raw || "{}");
check("the connector stores a Primus session and no API key", tokenRes.statusCode === 200 && typeof tokenJson.access_token === "string" && !("api_key" in tokenJson));
check("an MCP access token lasts at most one hour", tokenJson.expires_in > 0 && tokenJson.expires_in <= 3600);

const memberToken = tokenJson.access_token;
const listed = await rpc(memberToken, { jsonrpc: "2.0", id: 1, method: "tools/list" });
const names = (listed.json?.result?.tools || []).map((tool) => tool.name);
check("the tools are list, open, and verdict", names.join(",") === "list_ideas,open_idea,read_verdict");
const schemas = JSON.stringify(listed.json?.result?.tools || []);
check("no tool asks for an API key", !/api[_-]?key|password|secret/i.test(schemas));

const memberList = await rpc(memberToken, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_ideas", arguments: {} } });
const memberIdeas = JSON.parse(memberList.json.result.content[0].text).ideas;
check("the member sees their own idea and not the other team's idea", memberIdeas.some((row) => row.id === memberIdea.id) && !memberIdeas.some((row) => row.id === otherIdea.id), memberIdeas.map((row) => row.team).join(","));
const adminMcp = await connectorToken(adminRow.email);
const adminList = await rpc(adminMcp.access_token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_ideas", arguments: {} } });
const adminIdeas = JSON.parse(adminList.json.result.content[0].text).ideas;
check("the admin sees both ideas", adminIdeas.some((row) => row.id === memberIdea.id) && adminIdeas.some((row) => row.id === otherIdea.id));

const before = anthropic.length;
const rejected = await rpc(memberToken, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "open_idea", arguments: { ideaId: memberIdea.id, apiKey: DEPT_KEY } } });
const rejectedText = rejected.json.result.content[0].text;
check("a key typed into the tool is refused", rejected.json.result.isError === true && /not accepted/i.test(rejectedText) && !rejectedText.includes(DEPT_KEY) && anthropic.length === before);
for (const name of ["save_draft", "upload_evidence", "screen_idea"]) {
  const stopped = await rpc(memberToken, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name, arguments: { ideaId: memberIdea.id } } });
  check(`${name} is turned off`, stopped.json.result.isError === true && /turned off/i.test(stopped.json.result.content[0].text) && anthropic.length === before);
}
const verdict = await rpc(memberToken, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_verdict", arguments: { ideaId: memberIdea.id } } });
const opened = await rpc(memberToken, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "open_idea", arguments: { ideaId: memberIdea.id } } });
check("open and verdict do not call Claude", anthropic.length === before && verdict.json.result.isError !== true && opened.json.result.isError !== true);
const openedBody = JSON.parse(opened.json.result.content[0].text);
check("open labels the text as untrusted and returns no file", openedBody.untrusted === true && /untrusted/i.test(openedBody.label) && !openedBody.f1 && !openedBody.dataBase64 && !openedBody.evidenceSourceFile);
const hiddenOpen = await rpc(memberToken, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "open_idea", arguments: { ideaId: otherIdea.id } } });
const hiddenVerdict = await rpc(memberToken, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "read_verdict", arguments: { ideaId: otherIdea.id } } });
check("a member cannot open or read another team's idea", hiddenOpen.json.result.isError === true && hiddenVerdict.json.result.isError === true);
const beforeCount = memberIdeas.length;
await db.createProposition({ createdByEmail: adminRow.email, createdByUserId: adminRow.id, submitterName: "Admin Mcp", submitterDepartment: "Sales & Distribution FMCG" });
const listedAgain = await rpc(memberToken, { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "list_ideas", arguments: {} } });
const again = JSON.parse(listedAgain.json.result.content[0].text).ideas;
check("ideas the member cannot see do not change the list", again.length === beforeCount && again.every((row) => row.id !== otherIdea.id));

const loop = await http({ method: "POST", url: "/mcp/oauth/register", body: { redirect_uris: ["http://localhost/callback", "https://claude.ai/api/mcp/auth_callback"] } });
const loopClient = JSON.parse(loop.raw);
const loopAuth = await http({
  method: "GET",
  url: `/mcp/oauth/authorize?client_id=${loopClient.client_id}&redirect_uri=${encodeURIComponent("http://localhost:4477/callback")}&code_challenge=abc&code_challenge_method=S256&state=loop`,
  headers: { cookie: `primus_session=${encodeURIComponent(adminToken)}` },
});
check("Claude's loopback callback is accepted", loopAuth.statusCode === 302 && String(loopAuth.headers.location || "").startsWith("http://localhost:4477/callback"));
const visit = await http({ method: "GET", url: "/mcp", headers: { accept: "text/html,application/xhtml+xml" } });
const plain = await http({ method: "GET", url: "/mcp/", headers: { accept: "*/*" } });
const discovered = await http({ method: "GET", url: "/.well-known/oauth-authorization-server" });
const discoveredJson = JSON.parse(discovered.raw || "{}");
const claudeId = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const claudeAuth = await http({
  method: "GET",
  url: `/mcp/oauth/authorize?client_id=${encodeURIComponent(claudeId)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=abc&code_challenge_method=S256&state=claude`,
  headers: { cookie: `primus_session=${encodeURIComponent(adminToken)}` },
});
const claudeBad = await http({
  method: "GET",
  url: `/mcp/oauth/authorize?client_id=${encodeURIComponent(claudeId)}&redirect_uri=${encodeURIComponent("https://evil.example/callback")}&code_challenge=abc&code_challenge_method=S256&state=claude`,
  headers: { cookie: `primus_session=${encodeURIComponent(adminToken)}` },
});
check("opening the connector address in a browser explains how to add it", visit.statusCode === 200 && /Connectors/.test(visit.raw) && /\/mcp/.test(visit.raw) && !/POST JSON-RPC/.test(visit.raw));
check("a connector probe is asked to sign in", plain.statusCode === 401 && /oauth-protected-resource/.test(String(plain.headers["www-authenticate"] || "")));
check("Claude's published identity can sign in", discoveredJson.client_id_metadata_document_supported === true && claudeAuth.statusCode === 302 && String(claudeAuth.headers.location || "").startsWith("https://claude.ai/api/mcp/auth_callback"));
check("a published identity cannot redirect elsewhere", claudeBad.statusCode === 400 && !claudeBad.headers.location);
const stream = await http({ method: "GET", url: "/mcp", headers: { accept: "text/event-stream" } });
check("a streaming client keeps the connector response", stream.statusCode === 401);
const anon = await http({ method: "POST", url: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
check("a connector without a session is sent to sign in", anon.statusCode === 401 && /oauth-protected-resource/.test(String(anon.headers["www-authenticate"] || "")));
check("all 18 default teams are billing teams", SUBMITTER_DEPARTMENTS.every((team) => billingTeamName(team) === team && unlockedDepartmentOf({ department: team }) === team));
await db.upsertDepartmentApiKeyCiphertext("Pets Division", encryptApiKey(DEPT_KEY));
const pets = await resolveBillingApiKey("Pets Division");
const sn = await resolveBillingApiKey("SN");
check("a default team with a stored key is billed to that team", pets.source === "department_api_keys:Pets Division" && pets.apiKey === DEPT_KEY && sn.source === "ANTHROPIC_API_KEY");
const hostileForms = [
  ["javascript:", ["javascript:alert(1)"]],
  ["plain http", ["http://evil.example/cb"]],
  ["foreign https", ["https://evil.example/steal"]],
  ["host suffix", ["https://claude.ai.evil.example/cb"]],
  ["userinfo", ["https://claude.ai@evil.example/cb"]],
  ["mixed", ["https://claude.ai/api/mcp/auth_callback", "https://evil.example/steal"]],
  ["password in address", ["https://user:pass@claude.ai/cb"]],
  ["localhost lookalike", ["http://127.0.0.1.evil.example/cb"]],
];
const hostileStatuses = [];
for (const [, uris] of hostileForms) {
  const response = await http({ method: "POST", url: "/mcp/oauth/register", body: { redirect_uris: uris } });
  hostileStatuses.push(response.statusCode);
}
const allowed = await http({ method: "POST", url: "/mcp/oauth/register", body: { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } });
check("registration refuses all eight hostile redirect forms and still accepts Claude", hostileStatuses.every((status) => status === 400) && allowed.statusCode === 201, hostileStatuses.join(","));
let metadataHits = 0;
const metadataServer = httpServer.createServer((req, res) => { metadataHits += 1; res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
await new Promise((resolve) => metadataServer.listen(0, "127.0.0.1", resolve));
const metadataUrl = `http://127.0.0.1:${metadataServer.address().port}/client`;
const lookedUp = [];
const priorFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const target = String(url);
  if (target.startsWith("http://127.0.0.1") || target.startsWith("https://evil.example")) lookedUp.push(target);
  return priorFetch(url, opts);
};
await http({ method: "GET", url: `/mcp/oauth/authorize?client_id=${encodeURIComponent(metadataUrl)}&redirect_uri=${encodeURIComponent("http://127.0.0.1/callback")}&code_challenge=abc&code_challenge_method=S256` });
await http({ method: "GET", url: `/mcp/oauth/authorize?client_id=${encodeURIComponent("https://evil.example/oauth/client")}&redirect_uri=${encodeURIComponent("https://evil.example/cb")}&code_challenge=abc&code_challenge_method=S256` });
globalThis.fetch = priorFetch;
metadataServer.close();
check("a client id URL is not fetched", metadataHits === 0 && lookedUp.length === 0, `hits ${metadataHits}; fetches ${lookedUp.length}`);
const websiteOnMcp = await rpc(adminToken, { jsonrpc: "2.0", id: 12, method: "tools/list" });
const listApi = await apiCall({ method: "GET", url: "/api/propositions", cookie: memberToken });
const createApi = await apiCall({ method: "POST", url: "/api/propositions", cookie: memberToken, body: { name: "nope" } });
const adminApi = await apiCall({ method: "GET", url: "/api/admin/users", cookie: memberToken });
check("an MCP token is refused on the website API and a website session is refused on MCP", websiteOnMcp.status === 401 && [listApi.statusCode, createApi.statusCode, adminApi.statusCode].every((status) => status === 401 || status === 403), `${websiteOnMcp.status}/${listApi.statusCode}/${createApi.statusCode}/${adminApi.statusCode}`);
const audit = await apiCall({ method: "GET", url: "/api/admin/mcp/audit", cookie: adminToken });
const auditJson = JSON.parse(audit.raw || "{}");
const auditText = JSON.stringify(auditJson);
check("an admin can read the tool audit and it holds no token", audit.statusCode === 200 && auditJson.retentionDays === 90 && auditJson.records.some((row) => row.tool_name === "list_ideas" && row.user_id === memberRow.id) && !auditText.includes(memberToken) && !auditText.includes(tokenJson.refresh_token));
const memberAudit = await apiCall({ method: "GET", url: "/api/admin/mcp/audit", cookie: memberToken });
check("a member cannot read the tool audit", memberAudit.statusCode === 401 || memberAudit.statusCode === 403);
const versionBefore = Number((await db.getUserById(memberRow.id)).tokenVersion) || 1;
const refreshed = await http({
  method: "POST",
  url: "/mcp/oauth/token",
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenJson.refresh_token }).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
const refreshedJson = JSON.parse(refreshed.raw || "{}");
const replay = await http({
  method: "POST",
  url: "/mcp/oauth/token",
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenJson.refresh_token }).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.20" },
});
const chained = await http({
  method: "POST",
  url: "/mcp/oauth/token",
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshedJson.refresh_token || "missing" }).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.21" },
});
const versionAfter = Number((await db.getUserById(memberRow.id)).tokenVersion) || 1;
check("a reused refresh token revokes the chain and signs the user out", refreshed.statusCode === 200 && replay.statusCode === 400 && chained.statusCode === 400 && versionAfter > versionBefore);
const revoke = await apiCall({ method: "POST", url: "/api/admin/mcp/revoke", cookie: adminToken, body: { userId: adminRow.id } });
const afterRevoke = await rpc(adminMcp.access_token, { jsonrpc: "2.0", id: 13, method: "tools/list" });
check("an admin can revoke MCP tokens", revoke.statusCode === 200 && afterRevoke.status === 401);
const limited = [];
for (let i = 0; i < 12; i += 1) {
  const burst = await http({
    method: "POST",
    url: "/mcp/oauth/token",
    body: "grant_type=authorization_code&code=bogus",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.50" },
  });
  limited.push(burst.statusCode);
}
check("the token endpoint rate-limits repeated failures", limited.filter((status) => status === 429).length >= 1 && limited[0] === 400, limited.join(","));
process.env.MCP_ALLOWED_EMAILS = ` ${adminRow.email.toUpperCase()} , pilot.two@cavinkare.com`;
const dmsBefore = slack.dms.length;
const pilotStart = new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: "http://127.0.0.1/callback",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: "pilot",
  response_type: "code",
});
const pilotRefused = await http({
  method: "POST",
  url: `/mcp/oauth/authorize?${pilotStart}`,
  body: `step=email&email=${encodeURIComponent(memberRow.email)}`,
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
check("a pilot list refuses an unlisted email with a clear message and sends no code", pilotRefused.statusCode === 403 && /limited pilot/.test(pilotRefused.raw) && slack.dms.length === dmsBefore);
const unlisted = await connectorToken(memberRow.email);
check("an unlisted email cannot obtain a connector token", !unlisted.access_token);
const pilotListed = await connectorToken(adminRow.email);
const listedTools = pilotListed.access_token ? await rpc(pilotListed.access_token, { jsonrpc: "2.0", id: 14, method: "tools/list" }) : { status: 0 };
check("a listed email can obtain a connector token", Boolean(pilotListed.access_token) && listedTools.status === 200);
const refusedAudit = await apiCall({ method: "GET", url: "/api/admin/mcp/audit", cookie: signSession({ userId: adminRow.id, tokenVersion: Number((await db.getUserById(adminRow.id)).tokenVersion) || 1 }) });
check("a refused pilot sign-in is audited", JSON.parse(refusedAudit.raw || "{}").records?.some((row) => row.tool_name === "sign_in_refused" && row.email === memberRow.email));
process.env.MCP_ALLOWED_EMAILS = "pilot.two@cavinkare.com";
const removedCall = await rpc(pilotListed.access_token, { jsonrpc: "2.0", id: 15, method: "tools/list" });
const removedRefresh = await http({
  method: "POST",
  url: "/mcp/oauth/token",
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: pilotListed.refresh_token || "missing" }).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.60" },
});
process.env.MCP_ALLOWED_EMAILS = adminRow.email;
const restoredCall = await rpc(pilotListed.access_token, { jsonrpc: "2.0", id: 16, method: "tools/list" });
check("removing an email revokes that person's existing connector tokens on their next call", removedCall.status === 401 && removedRefresh.statusCode === 400 && restoredCall.status === 401);
delete process.env.MCP_ALLOWED_EMAILS;

process.env.MCP_ENABLED = "false";
const off = await http({ method: "POST", url: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
delete process.env.MCP_ENABLED;
const unset = await http({ method: "POST", url: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
check("the connector is off unless MCP_ENABLED is true", off.statusCode === 404 && unset.statusCode === 404);

globalThis.fetch = realFetch;
await suite.drop?.();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS MCP own account");
process.exit(failed ? 1 : 0);
