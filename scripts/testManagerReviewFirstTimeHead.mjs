/**
 * A business head who has NEVER signed in must still receive the manager-review Slack DM.
 * The platform has to look the person up in Slack by email at request time and store the Slack ID.
 * Real Postgres in a throwaway schema; Slack stubbed. Exits 1 if any check fails.
 */
import os from "node:os"; import path from "node:path";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) { console.log("SKIP first-time head DM: TEST_DATABASE_URL not set"); process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0); }
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) { console.error("Refusing non-local TEST_DATABASE_URL."); process.exit(1); }
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs"); const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url; process.env.PRIMUS_SCHEMA = suite.name; process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `ftd-${process.pid}`);
process.env.REQUIRE_AUTH = "true"; process.env.SESSION_SECRET = "ftd"; process.env.LOGIN_CODE_SECRET = "ftd"; process.env.SLACK_BOT_TOKEN = "xoxb-test"; delete process.env.SLACK_WEBHOOK_URL;
const dms = [];
globalThis.fetch = async (url, opts = {}) => { const u = String(url); const j = (o) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => o });
  const body = typeof opts.body === "string" ? (opts.body.startsWith("{") ? JSON.parse(opts.body) : Object.fromEntries(new URLSearchParams(opts.body))) : {};
  if (u.includes("lookupByEmail")) { const email = new URL(u).searchParams.get("email") || body.email; return j({ ok: true, user: { id: "U_" + String(email).split("@")[0], deleted: false, is_bot: false, profile: { email, real_name: String(email).split("@")[0] } } }); }
  if (u.includes("conversations.open")) return j({ ok: true, channel: { id: "DM_FOR_" + body.users } });
  if (u.includes("chat.postMessage")) { dms.push({ channel: body.channel, text: String(body.text) }); return j({ ok: true }); }
  return j({ ok: false }); };
const db = await import("../lib/db.js"); const { replaceBusinessHeadTeams } = await import("../lib/accessDb.js"); const srv = await import("../lib/managerReviewServer.js");
await db.initDb(); await replaceBusinessHeadTeams([{ email: "bh.pc@cavinkare.com", team: "PC" }]);
let failed = 0; const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
await db.findOrCreateSlackUser({ email: "owner@cavinkare.com", name: "Owner", role: "BM", externalId: "U_OWNER" }); const owner = await db.getUserByEmail("owner@cavinkare.com");
const p = await db.createProposition({ createdByEmail: owner.email, createdByUserId: owner.id, submitterDepartment: "PC", name: "x", category: "Snacks", ideaDescription: "x", submitterName: "Owner" });
await db.updateProposition(p.id, { name: "Pet Biscuits Deluxe", goNoGo: { classification: "WATCH", score: { pct: 72 } } }, { handler: "test", writer: "server" });
const r = await srv.requestManagerReview({ ideaId: p.id, user: owner });
const sent = dms.find((d) => /DM_FOR_U_bh\.pc/.test(d.channel));
check("1 the head of PC, who has never signed in, receives a Slack DM", Boolean(sent), `DMs sent: ${dms.length}`);
check("2 the DM names the idea", Boolean(sent) && /Pet Biscuits Deluxe/.test(sent.text));
check("3 the delivery result says ok for that head", (r.deliveries || [])[0]?.ok === true, JSON.stringify((r.deliveries || [])[0] || null).slice(0, 120));
const head = await db.getUserByEmail("bh.pc@cavinkare.com");
check("4 the head's Slack ID is stored for next time", Boolean(head && (head.externalId || head.external_id)), head ? "user row exists" : "no user row");
await suite.close?.(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS first-time head DM"); process.exit(failed ? 1 : 0);
