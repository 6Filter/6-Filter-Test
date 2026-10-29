/**
 * Adversarial checks for Slack one-time-code sign-in, run against a REAL Postgres in a throwaway schema.
 * Slack is stubbed. Every check must PASS before the login build is deployed.
 * Needs TEST_DATABASE_URL (local Postgres only). Exits 1 if any check fails.
 */
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) { console.log("SKIP adversarial Slack login: TEST_DATABASE_URL not set"); process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0); }
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) { console.error("Refusing non-local TEST_DATABASE_URL."); process.exit(1); }
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
delete process.env.TRUST_CLOUDFLARE;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url; process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `adv-slack-${process.pid}`);
process.env.REQUIRE_AUTH = "true"; process.env.SESSION_SECRET = "adv-session-secret";
process.env.LOGIN_CODE_SECRET = "adv-login-code-secret"; process.env.ALLOWED_EMAIL_DOMAINS = "cavinkare.com";
const db = await import("../lib/db.js");
const { handleRequestCode, handleVerifyCode, handleMe } = await import("../lib/authApi.js");
const { clearDurableRateLimits, replaceBusinessHeadTeams } = await import("../lib/accessDb.js");
const { canAccessIdea } = await import("../lib/propositionAccess.js");
const { signSession } = await import("../lib/auth.js");
await db.initDb();

let dms = [];
const slackFetch = async (url, opts = {}) => {
  const u = String(url);
  const headers = { get: () => null };
  if (u.includes("lookupByEmail")) { const email = new URL(u).searchParams.get("email"); return { ok: true, headers, json: async () => ({ ok: true, user: { id: "U_" + email.split("@")[0], profile: { real_name: email.split("@")[0], email } } }) }; }
  if (u.includes("conversations.open")) return { ok: true, headers, json: async () => ({ ok: true, channel: { id: "D1" } }) };
  if (u.includes("chat.postMessage")) { dms.push(JSON.parse(opts.body).text); return { ok: true, headers, json: async () => ({ ok: true }) }; }
  return { ok: true, headers, json: async () => ({ ok: false }) };
};
const slack = { fetchImpl: slackFetch, token: "xoxb-test" };
const mkReq = (body, headers = {}) => Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: { "content-type": "application/json", ...headers } });
const mkRes = () => { const o = { statusCode: 0, headers: {}, body: null }; return { o, set statusCode(v) { o.statusCode = v; }, get statusCode() { return o.statusCode; }, setHeader(k, v) { o.headers[k] = v; }, end(c) { try { o.body = JSON.parse(c); } catch { o.body = c; } } }; };
const IP = (n) => ({ "cf-connecting-ip": `203.0.113.${n}`, "x-forwarded-for": `203.0.113.${n}` });
const reqCode = async (email, hdr = IP(50)) => { const res = mkRes(); await handleRequestCode(mkReq({ email }, hdr), res, { slack }); return res.o; };
const verify = async (email, code, hdr = IP(50)) => { const res = mkRes(); await handleVerifyCode(mkReq({ email, code }, hdr), res, { slack }); return res.o; };
const codeFromDm = () => (dms[dms.length - 1].match(/code is (\d{6})/) || [])[1];

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`); if (!ok) failed++; };

// A. happy path and single use
dms = []; await clearDurableRateLimits();
await reqCode("alice@cavinkare.com"); const code = codeFromDm();
const v = await verify("alice@cavinkare.com", code);
const cookie = (v.headers["Set-Cookie"] || "").split(";")[0];
check("A sign-in works with the Slack code", v.statusCode === 200 && cookie.startsWith("primus_session="));
check("A the same code cannot be used twice", (await verify("alice@cavinkare.com", code)).statusCode === 401);

// B. rate limit holds under concurrency
dms = []; await clearDurableRateLimits();
await Promise.all(Array.from({ length: 30 }, () => reqCode("victim@cavinkare.com")));
check("B 30 parallel requests for one email send at most 3 DMs", dms.length <= 3, `sent ${dms.length}`);

// C. IP limit cannot be dodged by a spoofed header
dms = []; await clearDurableRateLimits();
for (let i = 0; i < 15; i++) await reqCode(`spoof${i}@cavinkare.com`, { "cf-connecting-ip": `198.51.100.${100 + i}`, "x-forwarded-for": "198.51.100.7" });
check("C a client-set cf-connecting-ip cannot bypass the per-IP limit (max 10)", dms.length <= 10, `sent ${dms.length}`);

// D. attempt cap holds under parallel guessing (correct code is dispatched LAST, after 149 wrong ones)
let accepted = 0;
for (let t = 0; t < 6; t++) {
  dms = []; await clearDurableRateLimits();
  const em = `target${t}@cavinkare.com`; await reqCode(em, IP(t + 1)); const real = codeFromDm();
  const guesses = Array.from({ length: 149 }, (_, i) => String((Number(real) + 1 + i) % 1000000).padStart(6, "0")); guesses.push(real);
  const results = await Promise.all(guesses.map((g) => verify(em, g, IP(t + 1))));
  if (results.some((x) => x.statusCode === 200)) accepted++;
}
check("D the 5-attempt cap holds under 150 parallel guesses", accepted === 0, `accepted in ${accepted}/6 trials`);

// E. a business head who signs in for the first time AFTER the import sees the team's ideas
await replaceBusinessHeadTeams([{ email: "head@cavinkare.com", team: "CC" }]);
const prop = await db.createProposition({ createdByEmail: "member@cavinkare.com", submitterDepartment: "CC" });
dms = []; await clearDurableRateLimits();
await reqCode("head@cavinkare.com", IP(200)); await verify("head@cavinkare.com", codeFromDm(), IP(200));
const head = await db.getUserByEmail("head@cavinkare.com"); const full = await db.getPropositionById(prop.id);
check("E a first-time business head can open an idea of their team", await canAccessIdea({ ...head }, full), `role=${head.role}`);

// F. server-side session expiry
const expired = signSession({ userId: head.id, tokenVersion: Number(head.tokenVersion) || 1, iat: 1, exp: Math.floor(Date.now() / 1000) - 60 });
const meRes = mkRes(); await handleMe({ method: "GET", headers: { cookie: `primus_session=${expired}` } }, meRes);
check("F an expired session token is refused by the server", meRes.o.body?.user == null, `status ${meRes.o.statusCode}`);

// G/H. other endpoints enforce the same visibility rule
const sendJson = (res, s, b) => { res.o.statusCode = s; res.o.body = b; };
const { handlePropositionReassessF4 } = await import("../lib/filters/reassessTechShift.js");
const other = { id: "u2", email: "other@cavinkare.com", role: "R&D", status: "active" };
{ const res = mkRes(); const rq = mkReq({}); rq.user = other;
  await handlePropositionReassessF4(rq, res, prop.id, { readBody: async () => ({}), sendJson, redactSecrets: (s) => s });
  check("G reassess-f4 refuses an unrelated user on someone else's idea", [403, 404].includes(res.o.statusCode), `status ${res.o.statusCode}`); }
const { handleIdeaById, handleIdeasCollection } = await import("../lib/ideasApi.js");
const saved = await db.saveIdea({ idea: "CONFIDENTIAL concept text", result: { phase1: 1 } });
{ const res = mkRes(); const rq = { method: "GET", headers: {}, query: {} }; rq.user = other;
  await handleIdeaById(rq, res, saved.id, { sendJson, redactSecrets: (s) => s });
  check("H legacy /api/ideas/:id does not show someone else's idea", ![200].includes(res.o.statusCode) || !JSON.stringify(res.o.body).includes("CONFIDENTIAL"), `status ${res.o.statusCode}`);
  const res2 = mkRes(); const rq2 = { method: "GET", headers: {}, query: {}, url: "/api/ideas" }; rq2.user = other;
  await handleIdeasCollection(rq2, res2, { readBody: async () => ({}), sendJson, redactSecrets: (s) => s });
  check("H legacy /api/ideas list is empty for an unrelated user", (res2.o.body?.ideas?.length || 0) === 0, `count ${res2.o.body?.ideas?.length}`); }

await suite.close?.();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS adversarial Slack login");
process.exit(failed ? 1 : 0);
