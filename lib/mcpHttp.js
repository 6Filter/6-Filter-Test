/**
 * Remote MCP on this service.
 * The person's Claude or Cursor account pays for the chat. This server never sees that account.
 * Sign-in is the existing email code. Tools run as that Primus user.
 * Data tools do not call Claude. Screening uses the key an admin already stored for the team.
 * An API key is never accepted as a tool argument.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";
import { handleRequestCode, handleVerifyCode } from "./authApi.js";
import {
  requireUser,
  sessionCookieHeader,
  sessionMaxAgeSeconds,
  signSession,
  verifySession,
} from "./auth.js";
import { getUserById, query, usingPostgres } from "./db.js";
import { resolveBillingApiKey } from "./departmentApiKeys.js";
import { billingTeamName } from "./propositionFields.js";
import { redactSecrets, sendJson } from "./http.js";
import { classificationOf } from "./logStatus.js";
import { handlePropositionById, handlePropositionDraft, handlePropositionsCollection } from "./propositionsApi.js";

const PROTOCOL = "2025-03-26";
const KEY_ARG = /^(api[_-]?key|anthropic([_-]?api)?[_-]?key|secret|password|passphrase|access[_-]?token|slack[_-]?token|token)$/i;

const TOOLS = [
  {
    name: "list_ideas",
    description: "List the ideas this signed-in person is allowed to see. Does not call Claude.",
    inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
  },
  {
    name: "open_idea",
    description: "Open one idea the signed-in person is allowed to see. Does not call Claude.",
    inputSchema: { type: "object", additionalProperties: false, required: ["ideaId"], properties: { ideaId: { type: "string" } } },
  },
  {
    name: "save_draft",
    description: "Save a draft of an idea. Does not score it and does not call Claude.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ideaId"],
      properties: {
        ideaId: { type: "string" },
        name: { type: "string" },
        category: { type: "string" },
        ideaDescription: { type: "string" },
        f1: { type: "object" },
        f2: { type: "object" },
      },
    },
  },
  {
    name: "read_verdict",
    description: "Read the verdict already stored on an idea. Does not start research and does not call Claude.",
    inputSchema: { type: "object", additionalProperties: false, required: ["ideaId"], properties: { ideaId: { type: "string" } } },
  },
  {
    name: "upload_evidence",
    description: "Attach an evidence file to an idea. Does not call Claude.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ideaId", "fileName", "dataBase64"],
      properties: {
        ideaId: { type: "string" },
        fileName: { type: "string" },
        mediaType: { type: "string" },
        dataBase64: { type: "string" },
      },
    },
  },
  {
    name: "screen_idea",
    description: "Start the same screening the website starts. The team key an admin already stored pays for it. Do not pass an API key.",
    inputSchema: { type: "object", additionalProperties: false, required: ["ideaId"], properties: { ideaId: { type: "string" } } },
  },
];

function originOf(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "localhost").split(",")[0].trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}

function pathOf(req) {
  const path = String(req.url || "/").split("?")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function queryOf(req) {
  try {
    return Object.fromEntries(new URL(req.url || "/", "http://localhost").searchParams);
  } catch {
    return {};
  }
}

function readRaw(req) {
  if (req.body != null && typeof req.body !== "object") return Promise.resolve(String(req.body));
  if (typeof req.body === "object" && req.body && !req.readable) return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseForm(text, contentType) {
  const type = String(contentType || "");
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bearer(req) {
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

function withSessionCookie(req, token) {
  if (!token) return;
  const existing = String(req.headers?.cookie || "");
  const next = `primus_session=${encodeURIComponent(token)}`;
  req.headers.cookie = existing ? `${existing}; ${next}` : next;
}

function mockRes() {
  const o = { statusCode: 200, headers: {}, raw: "", body: null };
  const res = {
    o,
    get statusCode() { return o.statusCode; },
    set statusCode(v) { o.statusCode = v; },
    setHeader(k, v) { o.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return o.headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete o.headers[String(k).toLowerCase()]; },
    writeHead(s) { o.statusCode = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) {
      if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c);
      try { o.body = JSON.parse(o.raw); } catch { o.body = o.raw; }
    },
    on() { return res; },
    once() { return res; },
  };
  return res;
}

function mockJsonReq(body, user, headers = {}) {
  const raw = Buffer.from(JSON.stringify(body || {}));
  return Object.assign(Readable.from([raw]), {
    method: "POST",
    url: "/mcp",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1", ...headers },
    query: {},
    user,
    socket: { remoteAddress: "127.0.0.1" },
  });
}

function forbiddenKey(value) {
  if (!value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value)) {
    if (KEY_ARG.test(key)) return key;
    const nested = forbiddenKey(child);
    if (nested) return nested;
  }
  return "";
}

function toolText(payload, isError = false) {
  const text = redactSecrets(typeof payload === "string" ? payload : JSON.stringify(payload));
  return { content: [{ type: "text", text }], isError };
}

function ideaSummary(row) {
  const verdict = classificationOf(row) || row?.goNoGo?.classification || "";
  return {
    id: row?.id || "",
    name: row?.name || "",
    team: row?.submitterDepartment || "",
    owner: row?.createdByEmail || "",
    verdict,
  };
}

function billingTeam(user) {
  const team = billingTeamName(user?.team);
  if (!team || team === "Open" || team === "Master") return "";
  return team;
}

async function ensureOauthStore() {
  if (!usingPostgres()) return;
  await query(`CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    client_id TEXT PRIMARY KEY,
    redirect_uris TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
    code TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS mcp_oauth_refresh (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_version INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`);
}

async function saveClient(client) {
  await ensureOauthStore();
  if (!usingPostgres()) return;
  await query(
    `INSERT INTO mcp_oauth_clients (client_id, redirect_uris) VALUES ($1, $2)
     ON CONFLICT (client_id) DO UPDATE SET redirect_uris = EXCLUDED.redirect_uris`,
    [client.client_id, JSON.stringify(client.redirect_uris)]
  );
}

async function loadClient(clientId) {
  await ensureOauthStore();
  if (!usingPostgres()) return null;
  const rows = await query(`SELECT client_id, redirect_uris FROM mcp_oauth_clients WHERE client_id = $1`, [clientId]);
  if (!rows[0]) return null;
  return { client_id: rows[0].client_id, redirect_uris: JSON.parse(rows[0].redirect_uris) };
}

function isPrivateIp(address) {
  const ip = String(address || "").toLowerCase().replace(/^::ffff:/, "");
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (ip === "::1" || ip === "::") return true;
  return ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd");
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (net.isIP(host)) return !isPrivateIp(host);
    return true;
  } catch {
    return false;
  }
}

const clientMetadataCache = new Map();

async function loadClientMetadata(clientId) {
  if (!isPublicHttpsUrl(clientId)) return null;
  const cached = clientMetadataCache.get(clientId);
  if (cached && cached.exp > Date.now()) return cached.client;
  const host = new URL(clientId).hostname;
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((row) => isPrivateIp(row.address))) return null;
  const response = await fetch(clientId, {
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text || text.length > 65536) return null;
  const doc = JSON.parse(text);
  if (doc?.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
  const redirectUris = doc.redirect_uris.map(String);
  if (!redirectUris.length || redirectUris.some((uri) => !allowedRedirect(uri))) return null;
  const client = { client_id: clientId, redirect_uris: redirectUris };
  clientMetadataCache.set(clientId, { exp: Date.now() + 5 * 60 * 1000, client });
  return client;
}

async function resolveClient(clientId) {
  const id = String(clientId || "");
  if (isPublicHttpsUrl(id)) {
    try {
      return await loadClientMetadata(id);
    } catch {
      return null;
    }
  }
  return loadClient(id);
}

function redirectAllowedFor(client, redirectUri) {
  if (!client?.redirect_uris?.some((uri) => sameRedirect(uri, redirectUri)) || !allowedRedirect(redirectUri)) return false;
  if (!isPublicHttpsUrl(client.client_id)) return true;
  try {
    const redirect = new URL(redirectUri);
    if (redirect.protocol === "http:" && (redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1")) return true;
    return redirect.origin === new URL(client.client_id).origin;
  } catch {
    return false;
  }
}

async function saveCode(code, payload) {
  await ensureOauthStore();
  if (!usingPostgres()) return;
  await query(
    `INSERT INTO mcp_oauth_codes (code, payload, expires_at) VALUES ($1, $2, $3)`,
    [code, JSON.stringify(payload), new Date(payload.exp).toISOString()]
  );
}

async function takeCode(code) {
  await ensureOauthStore();
  if (!usingPostgres()) return null;
  const rows = await query(`DELETE FROM mcp_oauth_codes WHERE code = $1 RETURNING payload, expires_at`, [code]);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
  return JSON.parse(rows[0].payload);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function saveRefresh(token, user) {
  await ensureOauthStore();
  if (!usingPostgres()) return;
  const exp = new Date(Date.now() + sessionMaxAgeSeconds() * 1000).toISOString();
  await query(
    `INSERT INTO mcp_oauth_refresh (token_hash, user_id, token_version, expires_at) VALUES ($1, $2, $3, $4)`,
    [hashToken(token), user.id, Number(user.tokenVersion) || 1, exp]
  );
}

async function takeRefresh(token) {
  await ensureOauthStore();
  if (!usingPostgres()) return null;
  const rows = await query(`DELETE FROM mcp_oauth_refresh WHERE token_hash = $1 RETURNING user_id, token_version, expires_at`, [hashToken(token)]);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
  return { userId: rows[0].user_id, tokenVersion: Number(rows[0].token_version) || 1 };
}

function allowedRedirect(uri) {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

function sameRedirect(registered, actual) {
  if (registered === actual) return true;
  try {
    const left = new URL(registered);
    const right = new URL(actual);
    const loopback = (host) => host === "localhost" || host === "127.0.0.1";
    if (left.protocol === "http:" && right.protocol === "http:" && loopback(left.hostname) && loopback(right.hostname)) {
      return left.pathname === right.pathname && left.search === right.search;
    }
    return false;
  } catch {
    return false;
  }
}

function pkce(verifier, challenge) {
  const digest = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(digest);
  const right = Buffer.from(String(challenge || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signInPage({ action, email, message, showCode, showForm = true, clientHost = "" }) {
  const form = showForm
    ? `<form method="post" action="${escapeHtml(action)}">
  <label>Work email <input name="email" type="email" autocomplete="username" required value="${escapeHtml(email)}"></label>
  ${showCode ? `<label>Code <input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>` : ""}
  <input type="hidden" name="step" value="${showCode ? "code" : "email"}">
  <button type="submit">${showCode ? "Sign in" : "Send code"}</button>
</form>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in</title></head>
<body>
<h1>Sign in</h1>
${clientHost ? `<p>${escapeHtml(clientHost)} is connecting.</p>` : ""}
<p>Use your work email. A code arrives in Slack. There is no API key to enter.</p>
${message ? `<p>${escapeHtml(message)}</p>` : ""}
${form}
</body></html>`;
}

function connectorPage(origin) {
  const address = `${origin}/mcp`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>6 Filter Test connector</title></head>
<body>
<h1>6 Filter Test connector</h1>
<p>This address connects from Claude or Cursor. Opening it in a chat or a browser does not start the connection.</p>
<p>In Claude, open Settings, then Connectors, then Add custom connector, and paste:</p>
<p><code>${escapeHtml(address)}</code></p>
<p>In Cursor, add a custom MCP server with that same address.</p>
<p>Sign in with your work email. A code arrives in Slack. There is no API key to enter.</p>
</body></html>`;
}

function wantsBrowserPage(req) {
  const accept = String(req.headers?.accept || "");
  if (/text\/event-stream/i.test(accept)) return false;
  return /text\/html/i.test(accept);
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(html);
}

function sendOauthJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

async function issueCode(res, req, user) {
  const q = queryOf(req);
  const client = await resolveClient(q.client_id);
  if (!redirectAllowedFor(client, q.redirect_uri)) {
    sendHtml(res, 400, signInPage({ action: req.url, email: "", message: "This sign-in link is not valid.", showCode: false, showForm: false }));
    return;
  }
  if (q.code_challenge_method !== "S256" || !q.code_challenge) {
    sendHtml(res, 400, signInPage({ action: req.url, email: "", message: "Sign-in requires a code challenge.", showCode: false }));
    return;
  }
  const code = randomBytes(32).toString("base64url");
  await saveCode(code, {
    clientId: q.client_id,
    redirectUri: q.redirect_uri,
    challenge: q.code_challenge,
    userId: user.id,
    tokenVersion: Number(user.tokenVersion) || 1,
    exp: Date.now() + 5 * 60 * 1000,
  });
  const back = new URL(q.redirect_uri);
  back.searchParams.set("code", code);
  if (q.state) back.searchParams.set("state", q.state);
  res.statusCode = 302;
  res.setHeader("Location", back.toString());
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

async function handleAuthorize(req, res) {
  const q = queryOf(req);
  const client = await resolveClient(q.client_id);
  const clientHost = isPublicHttpsUrl(q.client_id) ? new URL(q.client_id).host : "";
  if (!redirectAllowedFor(client, q.redirect_uri)) {
    sendHtml(res, 400, signInPage({ action: req.url, email: "", message: "This sign-in link is not valid.", showCode: false, showForm: false }));
    return;
  }
  if (req.method === "GET") {
    const user = await requireUser({ ...req, headers: { ...req.headers } }, mockRes());
    if (user) {
      await issueCode(res, req, user);
      return;
    }
    sendHtml(res, 200, signInPage({ action: req.url, email: "", message: "", showCode: false, clientHost }));
    return;
  }
  if (req.method !== "POST") {
    sendOauthJson(res, 405, { error: "GET or POST only." });
    return;
  }
  const form = parseForm(await readRaw(req), req.headers?.["content-type"]);
  const action = req.url;
  if (form.step === "code") {
    const inner = mockRes();
    await handleVerifyCode(mockJsonReq({ email: form.email, code: form.code }, null, { "x-forwarded-for": req.headers?.["x-forwarded-for"] || "127.0.0.1" }), inner);
    const cookie = String(inner.o.headers["set-cookie"] || "");
    const sessionToken = decodeURIComponent((cookie.match(/primus_session=([^;]+)/) || [])[1] || "");
    if (inner.o.statusCode !== 200 || !sessionToken) {
      sendHtml(res, 401, signInPage({ action, email: form.email || "", message: "Invalid email or code.", showCode: true }));
      return;
    }
    res.setHeader("Set-Cookie", cookie);
    const session = verifySession(sessionToken);
    const user = session?.userId ? await getUserById(session.userId) : null;
    if (!user) {
      sendHtml(res, 401, signInPage({ action, email: form.email || "", message: "Invalid email or code.", showCode: true }));
      return;
    }
    await issueCode(res, req, { id: user.id, tokenVersion: Number(user.tokenVersion) || 1 });
    return;
  }
  const inner = mockRes();
  await handleRequestCode(mockJsonReq({ email: form.email }, null, { "x-forwarded-for": req.headers?.["x-forwarded-for"] || "127.0.0.1" }), inner);
  const message = inner.o.statusCode === 503
    ? "Unable to send a sign-in code right now. Try again later."
    : "If this email can sign in, the code is in Slack.";
  sendHtml(res, 200, signInPage({ action, email: form.email || "", message, showCode: true }));
}

async function handleRegister(req, res) {
  if (req.method !== "POST") {
    sendOauthJson(res, 405, { error: "POST only." });
    return;
  }
  const body = parseForm(await readRaw(req), req.headers?.["content-type"]);
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirects.length || redirects.some((uri) => !allowedRedirect(uri))) {
    sendOauthJson(res, 400, { error: "redirect_uris must be https, or http on localhost." });
    return;
  }
  const client = { client_id: randomBytes(16).toString("hex"), redirect_uris: redirects };
  await saveClient(client);
  sendOauthJson(res, 201, {
    client_id: client.client_id,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}

async function handleToken(req, res) {
  if (req.method !== "POST") {
    sendOauthJson(res, 405, { error: "POST only." });
    return;
  }
  const body = parseForm(await readRaw(req), req.headers?.["content-type"]);
  if (body.grant_type === "refresh_token") {
    const row = await takeRefresh(String(body.refresh_token || ""));
    if (!row) {
      sendOauthJson(res, 400, { error: "invalid_grant" });
      return;
    }
    const user = await getUserById(row.userId);
    if (!user || Number(user.tokenVersion) !== row.tokenVersion) {
      sendOauthJson(res, 400, { error: "invalid_grant" });
      return;
    }
    const access = signSession({ userId: user.id, tokenVersion: Number(user.tokenVersion) || 1 });
    const refresh = randomBytes(32).toString("base64url");
    await saveRefresh(refresh, user);
    sendOauthJson(res, 200, { access_token: access, token_type: "Bearer", expires_in: sessionMaxAgeSeconds(), refresh_token: refresh });
    return;
  }
  if (body.grant_type !== "authorization_code") {
    sendOauthJson(res, 400, { error: "unsupported_grant_type" });
    return;
  }
  const stored = await takeCode(String(body.code || ""));
  const client = stored ? await resolveClient(stored.clientId) : null;
  if (!stored || !client || body.client_id !== stored.clientId || body.redirect_uri !== stored.redirectUri || !redirectAllowedFor(client, body.redirect_uri) || !pkce(body.code_verifier, stored.challenge)) {
    sendOauthJson(res, 400, { error: "invalid_grant" });
    return;
  }
  const user = await getUserById(stored.userId);
  if (!user || (Number(user.tokenVersion) || 1) !== stored.tokenVersion) {
    sendOauthJson(res, 400, { error: "invalid_grant" });
    return;
  }
  const access = signSession({ userId: user.id, tokenVersion: Number(user.tokenVersion) || 1 });
  const refresh = randomBytes(32).toString("base64url");
  await saveRefresh(refresh, user);
  sendOauthJson(res, 200, { access_token: access, token_type: "Bearer", expires_in: sessionMaxAgeSeconds(), refresh_token: refresh });
}

function metadata(req) {
  const origin = originOf(req);
  return {
    resource: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    authorization: {
      issuer: origin,
      authorization_endpoint: `${origin}/mcp/oauth/authorize`,
      token_endpoint: `${origin}/mcp/oauth/token`,
      registration_endpoint: `${origin}/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    },
  };
}

function rpc(res, status, payload, { auth = false, origin = "" } = {}) {
  if (auth) {
    res.setHeader("WWW-Authenticate", `Bearer error="invalid_token", error_description="Sign in required.", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
  }
  sendOauthJson(res, status, payload);
}

async function callTool(user, name, args) {
  const blocked = forbiddenKey(args);
  if (blocked) {
    return toolText({ error: "An API key is not accepted. Sign in with your work email." }, true);
  }
  const ideaId = String(args.ideaId || "").trim();
  if (name === "list_ideas") {
    const inner = mockRes();
    const req = mockJsonReq({}, user);
    req.method = "GET";
    req.url = `/api/propositions?limit=${Number(args.limit) || 100}`;
    await handlePropositionsCollection(req, inner, { sendJson, redactSecrets });
    const rows = Array.isArray(inner.o.body?.propositions) ? inner.o.body.propositions.map(ideaSummary) : [];
    if (inner.o.statusCode !== 200) return toolText({ error: inner.o.body?.error || "Could not list ideas." }, true);
    return toolText({ ideas: rows });
  }
  if (!ideaId) return toolText({ error: "ideaId is required." }, true);
  if (name === "open_idea" || name === "read_verdict") {
    const inner = mockRes();
    const req = mockJsonReq({}, user);
    req.method = "GET";
    req.url = `/api/propositions/${encodeURIComponent(ideaId)}`;
    await handlePropositionById(req, inner, ideaId, { readBody: async () => ({}), sendJson, redactSecrets });
    if (inner.o.statusCode !== 200) return toolText({ error: inner.o.body?.error || "Idea not found." }, true);
    const doc = inner.o.body?.proposition || inner.o.body;
    if (name === "read_verdict") {
      return toolText({
        id: ideaId,
        verdict: classificationOf(doc) || doc?.goNoGo?.classification || "",
        score: doc?.goNoGo?.score?.pct ?? null,
        rationale: doc?.goNoGo?.rationale || "",
      });
    }
    return toolText(ideaSummary(doc));
  }
  if (name === "save_draft") {
    const proposition = {};
    for (const key of ["name", "category", "ideaDescription", "f1", "f2"]) {
      if (args[key] !== undefined) proposition[key] = args[key];
    }
    const inner = mockRes();
    await handlePropositionDraft(mockJsonReq({ proposition }, user), inner, ideaId, {
      readBody: async () => ({ proposition }),
      sendJson,
      redactSecrets,
    });
    if (inner.o.statusCode !== 200) return toolText({ error: inner.o.body?.error || "Draft was not saved." }, true);
    return toolText({ id: ideaId, saved: true });
  }
  if (name === "upload_evidence") {
    const proposition = {
      f1: {
        evidenceSourceFile: {
          name: String(args.fileName || "evidence"),
          mediaType: String(args.mediaType || "application/octet-stream"),
          data: String(args.dataBase64 || ""),
        },
      },
    };
    const inner = mockRes();
    await handlePropositionDraft(mockJsonReq({ proposition }, user), inner, ideaId, {
      readBody: async () => ({ proposition }),
      sendJson,
      redactSecrets,
    });
    if (inner.o.statusCode !== 200) return toolText({ error: inner.o.body?.error || "Evidence was not saved." }, true);
    const file = inner.o.body?.proposition?.f1?.evidenceSourceFile || null;
    const uploaded = Boolean(file?.fileId);
    return toolText(
      uploaded
        ? { id: ideaId, uploaded: true, fileName: file.name || args.fileName }
        : { error: "The file was not stored. Use a PDF, Word, Excel, or CSV." },
      !uploaded
    );
  }
  if (name === "screen_idea") {
    const team = billingTeam(user);
    const screenUser = { ...user, department: team || user.department || "" };
    let billingSource = "";
    try {
      const resolved = await resolveBillingApiKey(team || screenUser.department);
      billingSource = resolved.source;
    } catch (e) {
      return toolText({ error: redactSecrets(e.message), billingSource: "" }, true);
    }
    const opened = mockRes();
    const getReq = mockJsonReq({}, screenUser);
    getReq.method = "GET";
    getReq.url = `/api/propositions/${encodeURIComponent(ideaId)}`;
    await handlePropositionById(getReq, opened, ideaId, { readBody: async () => ({}), sendJson, redactSecrets });
    if (opened.o.statusCode !== 200) return toolText({ error: opened.o.body?.error || "Idea not found.", billingSource }, true);
    const current = opened.o.body?.proposition || opened.o.body || {};
    const inner = mockRes();
    const req = mockJsonReq({}, screenUser);
    req.method = "PUT";
    req.url = `/api/propositions/${encodeURIComponent(ideaId)}`;
    await handlePropositionById(req, inner, ideaId, {
      readBody: async () => ({ forceResearch: true, proposition: current }),
      sendJson,
      redactSecrets,
    });
    const doc = inner.o.body?.proposition || null;
    return toolText({
      id: ideaId,
      started: inner.o.statusCode >= 200 && inner.o.statusCode < 300,
      status: inner.o.statusCode,
      billingSource,
      verdict: doc ? classificationOf(doc) || doc?.goNoGo?.classification || "" : "",
      error: inner.o.statusCode >= 400 ? inner.o.body?.error || "" : "",
    }, inner.o.statusCode >= 400);
  }
  return toolText({ error: "Unknown tool." }, true);
}

async function handleRpc(req, res, user) {
  const text = await readRaw(req);
  let message;
  try {
    message = text ? JSON.parse(text) : null;
  } catch {
    rpc(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    return;
  }
  if (!message || message.jsonrpc !== "2.0" || !message.method) {
    rpc(res, 400, { jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: message?.id ?? null });
    return;
  }
  if (message.id == null) {
    res.statusCode = 202;
    res.end();
    return;
  }
  if (message.method === "initialize") {
    rpc(res, 200, {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "6-filter-test", version: "1.0.0" },
        instructions: "Sign in with your work email. Do not paste an API key. Your Claude account pays for this chat. Screening uses the key an admin stored for your team.",
      },
    });
    return;
  }
  if (message.method === "ping") {
    rpc(res, 200, { jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    rpc(res, 200, { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
    return;
  }
  if (message.method === "tools/call") {
    const name = String(message.params?.name || "");
    const args = message.params?.arguments && typeof message.params.arguments === "object" ? message.params.arguments : {};
    if (!TOOLS.some((tool) => tool.name === name)) {
      rpc(res, 200, { jsonrpc: "2.0", id: message.id, result: toolText({ error: "Unknown tool." }, true) });
      return;
    }
    try {
      const result = await callTool(user, name, args);
      rpc(res, 200, { jsonrpc: "2.0", id: message.id, result });
    } catch (e) {
      rpc(res, 200, { jsonrpc: "2.0", id: message.id, result: toolText({ error: redactSecrets(e.message) }, true) });
    }
    return;
  }
  rpc(res, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
}

export async function handleMcpHttp(req, res) {
  const path = pathOf(req);
  const mcp = path === "/mcp" || path.startsWith("/mcp/") || path.startsWith("/.well-known/oauth-");
  if (!mcp) return false;

  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
    sendOauthJson(res, 200, metadata(req).resource);
    return true;
  }
  if (path === "/.well-known/oauth-authorization-server") {
    sendOauthJson(res, 200, metadata(req).authorization);
    return true;
  }
  if (path === "/mcp/oauth/register") {
    await handleRegister(req, res);
    return true;
  }
  if (path === "/mcp/oauth/authorize") {
    await handleAuthorize(req, res);
    return true;
  }
  if (path === "/mcp/oauth/token") {
    await handleToken(req, res);
    return true;
  }
  if (path !== "/mcp") {
    sendOauthJson(res, 404, { error: "Not found." });
    return true;
  }
  if (req.method === "GET" && wantsBrowserPage(req)) {
    sendHtml(res, 200, connectorPage(originOf(req)));
    return true;
  }

  const token = bearer(req);
  if (token) withSessionCookie(req, token);
  const gate = mockRes();
  const user = await requireUser(req, gate);
  if (!user) {
    rpc(res, 401, { jsonrpc: "2.0", error: { code: -32001, message: "Sign in required." }, id: null }, { auth: true, origin: originOf(req) });
    return true;
  }
  if (req.method === "GET" || req.method === "DELETE") {
    sendOauthJson(res, req.method === "DELETE" ? 204 : 405, req.method === "DELETE" ? "" : { error: "POST JSON-RPC to this address." });
    return true;
  }
  if (req.method !== "POST") {
    sendOauthJson(res, 405, { error: "POST only." });
    return true;
  }
  await handleRpc(req, res, user);
  return true;
}

export function sessionCookieFor(token, req) {
  return sessionCookieHeader(token, req);
}
