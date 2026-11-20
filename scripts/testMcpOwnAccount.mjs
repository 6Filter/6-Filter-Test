/**
 * Remote MCP: each person signs in with their work email.
 * Their Claude account is the chat client. This server never takes an API key.
 * A member sees only the ideas they are allowed to see.
 * Screening is tagged with that team's stored key.
 */
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import assert from "node:assert/strict";

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

const page = await http({ method: "GET", url: "/mcp/oauth/authorize?client_id=x&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&code_challenge=abc&code_challenge_method=S256&state=s" });
check("the sign-in page asks for a work email and has no key field", page.statusCode === 200 && /name="email"/.test(page.raw) && !/name="(api[_-]?key|password|token)"/i.test(page.raw));

const registered = await http({
  method: "POST",
  url: "/mcp/oauth/register",
  body: { redirect_uris: ["http://127.0.0.1/callback"] },
});
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

const memberToken = tokenJson.access_token;
const listed = await rpc(memberToken, { jsonrpc: "2.0", id: 1, method: "tools/list" });
const names = (listed.json?.result?.tools || []).map((tool) => tool.name);
check("the tools are list, open, save, verdict, evidence, and screen", names.join(",") === "list_ideas,open_idea,save_draft,read_verdict,upload_evidence,screen_idea");
const schemas = JSON.stringify(listed.json?.result?.tools || []);
check("no tool asks for an API key", !/api[_-]?key|password|secret/i.test(schemas));

const memberList = await rpc(memberToken, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_ideas", arguments: {} } });
const memberIdeas = JSON.parse(memberList.json.result.content[0].text).ideas;
check("the member sees their own idea and not the other team's idea", memberIdeas.some((row) => row.id === memberIdea.id) && !memberIdeas.some((row) => row.id === otherIdea.id), memberIdeas.map((row) => row.team).join(","));
const adminList = await rpc(adminToken, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_ideas", arguments: {} } });
const adminIdeas = JSON.parse(adminList.json.result.content[0].text).ideas;
check("the admin sees both ideas", adminIdeas.some((row) => row.id === memberIdea.id) && adminIdeas.some((row) => row.id === otherIdea.id));

const before = anthropic.length;
const rejected = await rpc(memberToken, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "screen_idea", arguments: { ideaId: memberIdea.id, apiKey: DEPT_KEY } } });
const rejectedText = rejected.json.result.content[0].text;
check("a key typed into the tool is refused", rejected.json.result.isError === true && /not accepted/i.test(rejectedText) && !rejectedText.includes(DEPT_KEY) && anthropic.length === before);

await rpc(memberToken, {
  jsonrpc: "2.0",
  id: 5,
  method: "tools/call",
  params: {
    name: "save_draft",
    arguments: {
      ideaId: memberIdea.id,
      name: "Hair growth serum",
      category: "Serum",
      ideaDescription: "Leave-on serum that supports visible hair growth",
      f1: { declaredAttribute: "Hair growth", benchmark: "Dove Scalp Serum 100 ml", declaredGap: 3, gapDerivation: "panel", parityExceptions: "No fragrance", growthRoute: "frequency", growthArgument: "growing" },
      f2: { grammage: "100 ml", gstRatePct: 18, mrpInr: 295, cogsAtScale: 100, netMarginAtScale: 60 },
    },
  },
});
const screened = await rpc(memberToken, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "screen_idea", arguments: { ideaId: memberIdea.id } } });
const screenBody = JSON.parse(screened.json.result.content[0].text);
check("screening is tagged with the team's stored key", screenBody.billingSource === "department_api_keys:CIA" && !screened.raw.includes(DEPT_KEY) && !screened.raw.includes("sk-ant-stub-infra-only"), screenBody.billingSource);
check("the screening call used that team key", anthropic.length > before && anthropic.every((key) => key === DEPT_KEY));
const callsAfterScreen = anthropic.length;
const verdict = await rpc(memberToken, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_verdict", arguments: { ideaId: memberIdea.id } } });
const opened = await rpc(memberToken, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "open_idea", arguments: { ideaId: memberIdea.id } } });
const uploaded = await rpc(memberToken, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "upload_evidence", arguments: { ideaId: memberIdea.id, fileName: "note.csv", mediaType: "text/csv", dataBase64: Buffer.from("column,value\nlab,1").toString("base64") } } });
const uploadBody = JSON.parse(uploaded.json.result.content[0].text);
check("open, verdict, and evidence do not call Claude", anthropic.length === callsAfterScreen && verdict.json.result.isError !== true && opened.json.result.isError !== true && uploadBody.uploaded === true);

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
check("opening the connector address in a browser explains how to add it", visit.statusCode === 200 && /Connectors/.test(visit.raw) && /\/mcp/.test(visit.raw) && !/POST JSON-RPC/.test(visit.raw));
check("a plain open of the address explains the connector", plain.statusCode === 200 && /Add custom connector/.test(plain.raw));
const stream = await http({ method: "GET", url: "/mcp", headers: { accept: "text/event-stream" } });
check("a streaming client keeps the connector response", stream.statusCode === 401);
const anon = await http({ method: "POST", url: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
check("a connector without a session is sent to sign in", anon.statusCode === 401 && /oauth-protected-resource/.test(String(anon.headers["www-authenticate"] || "")));
check("all 18 default teams are billing teams", SUBMITTER_DEPARTMENTS.every((team) => billingTeamName(team) === team && unlockedDepartmentOf({ department: team }) === team));
await db.upsertDepartmentApiKeyCiphertext("Pets Division", encryptApiKey(DEPT_KEY));
const pets = await resolveBillingApiKey("Pets Division");
const sn = await resolveBillingApiKey("SN");
check("a default team with a stored key is billed to that team", pets.source === "department_api_keys:Pets Division" && pets.apiKey === DEPT_KEY && sn.source === "ANTHROPIC_API_KEY");

globalThis.fetch = realFetch;
await suite.drop?.();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS MCP own account");
process.exit(failed ? 1 : 0);
