/**
 * Slack sign-in → pick team → create idea → submit (stubbed model) → open output.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const SKIP = "SKIP testSlackLoginToOutput — TEST_DATABASE_URL is not set";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-slack-e2e-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "slack-e2e-session-secret-xxxxxxxx";
process.env.LOGIN_CODE_SECRET = "slack-e2e-login-code-secret";
process.env.ALLOWED_EMAIL_DOMAINS = "cavinkare.com";
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;

const { initDb, getPropositionById, getUserByEmail, updateProposition } = await import("../lib/db.js");
const { handleRequestCode, handleVerifyCode, handleSetTeam } = await import("../lib/authApi.js");
const { replaceLoginCode, clearDurableRateLimits } = await import("../lib/accessDb.js");
const { handlePropositionsCollection, handlePropositionById } = await import("../lib/propositionsApi.js");
const { SIX_FILTERS_FORM, emptyPropositionDoc } = await import("../lib/propositionFields.js");

await initDb();

function mockRes() {
  const out = { statusCode: 0, body: null, headers: {} };
  return {
    out,
    statusCode: 200,
    setHeader(k, v) {
      out.headers[k] = v;
    },
    end(chunk) {
      out.statusCode = this.statusCode;
      if (chunk != null) {
        try {
          out.body = JSON.parse(String(chunk));
        } catch {
          out.body = chunk;
        }
      }
    },
  };
}

const slackFetch = async (url, opts = {}) => {
  const headers = { get: () => null };
  if (String(url).includes("lookupByEmail")) {
    const email = new URL(url).searchParams.get("email");
    return {
      ok: true,
      headers,
      json: async () => ({
        ok: true,
        user: { id: `U_${String(email).split("@")[0].toUpperCase()}`, profile: { real_name: "Flow User", email } },
      }),
    };
  }
  if (String(url).includes("conversations.open")) {
    return { ok: true, headers, json: async () => ({ ok: true, channel: { id: "D1" } }) };
  }
  if (String(url).includes("chat.postMessage")) {
    return { ok: true, headers, json: async () => ({ ok: true }) };
  }
  if (String(url).includes("api.anthropic.com")) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        content: [{ type: "text", text: "{\"status\":\"stub\"}" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      text: async () => JSON.stringify({ content: [{ type: "text", text: "{\"status\":\"stub\"}" }] }),
    };
  }
  return { ok: true, headers, json: async () => ({ ok: false }) };
};
const slack = { fetchImpl: slackFetch, token: "xoxb-test" };

function jsonReq(body, headers = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const listeners = { data: [], end: [] };
  const req = {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1", ...headers },
    on(ev, fn) {
      if (listeners[ev]) listeners[ev].push(fn);
      return req;
    },
  };
  setImmediate(() => {
    for (const fn of listeners.data) fn(raw);
    for (const fn of listeners.end) fn();
  });
  return req;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function sample(field) {
  if (field.type === "checkbox") return true;
  if (field.key === "declaredGap") return 3;
  if (field.key === "netMarginAtScale") return 55;
  if (field.key === "gstRatePct") return 18;
  if (field.key === "mrpInr") return 299;
  if (field.key === "cogsAtScale") return 80;
  if (field.type === "number") return 18;
  if (field.key === "growthRoute") return "penetration";
  if (field.key === "forumVerdict") return "pass";
  if (field.key === "grammage") return "50 ml";
  if (field.key === "benchmark") return "Dove Scalp Serum 100 ml";
  if (field.key === "declaredAttribute") return "hair growth";
  if (field.key === "growthArgument") return "households growing in hair care with CMI numbers";
  if (field.key === "plannedAnnualIncreasePct" || field.type === "price-resilience") return 5;
  if (field.key === "priceResilienceNote" || field.type === "readonly-note") return null;
  if (field.key === "marginElasticity" || field.type === "computed-range") return { minMrpInr: 40, maxMrpInr: 90 };
  if (field.key === "techShiftRisk" || field.type === "computed-risk") {
    return { dimensions: { functionalCoreStability: { risk: "Low" } } };
  }
  if (field.type === "computed") return 12;
  return "field-ok";
}

await clearDurableRateLimits();
const email = "flow.user@cavinkare.com";
const reqRes = mockRes();
await handleRequestCode(jsonReq({ email }), reqRes, { slack });
assert.equal(reqRes.out.statusCode, 200, reqRes.out.body?.error);

const { code } = await replaceLoginCode(email);
const verifyRes = mockRes();
await handleVerifyCode(jsonReq({ email, code }), verifyRes, { slack });
assert.equal(verifyRes.out.statusCode, 200, verifyRes.out.body?.error);
assert.equal(verifyRes.out.body?.user?.email, email);
assert.equal(verifyRes.out.body?.user?.needsTeam, true);

const setCookie = String(verifyRes.out.headers["Set-Cookie"] || verifyRes.out.headers["set-cookie"] || "");
assert.match(setCookie, /primus_session=/);
const cookieHeader = setCookie.split(";")[0];

const teamRes = mockRes();
const teamReq = Object.assign(Readable.from([Buffer.from(JSON.stringify({ team: "R&D" }))]), {
  method: "POST",
  headers: { cookie: cookieHeader, "content-type": "application/json" },
});
await handleSetTeam(teamReq, teamRes);
assert.equal(teamRes.out.statusCode, 200, teamRes.out.body?.error);
assert.equal(teamRes.out.body?.user?.team, "R&D");

const dbUser = await getUserByEmail(email);
const user = { ...dbUser, email, role: dbUser.role || "BM", team: "R&D", department: "Open" };

const createRes = mockRes();
await handlePropositionsCollection(
  { method: "POST", user },
  createRes,
  { sendJson, redactSecrets: (s) => s }
);
assert.equal(createRes.out.statusCode, 201, createRes.out.body?.error);
const createdId = createRes.out.body?.proposition?.id || createRes.out.body?.id;
assert.ok(createdId, "create returns an idea id");

const seeded = emptyPropositionDoc(createdId);
seeded.submitterName = "Flow User";
seeded.submitterDepartment = "R&D";
seeded.name = "Slack flow serum";
seeded.category = "Hair oils";
seeded.ideaDescription = "A leave-in hair growth serum for Indian women with thinning hair.";
for (const spec of SIX_FILTERS_FORM) {
  for (const field of spec.fields) seeded[spec.key][field.key] = sample(field);
}
delete seeded.f4.techShiftRisk;
await updateProposition(createdId, seeded, { handler: "e2e-seed", allowFilterReset: true });

const realFetch = globalThis.fetch;
let stubCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.anthropic.com")) {
    stubCalls += 1;
    return slackFetch(url, options);
  }
  if (typeof realFetch === "function") return realFetch(url, options);
  return slackFetch(url, options);
};

const submitRes = mockRes();
try {
  await handlePropositionById(
    { method: "PUT", user },
    submitRes,
    createdId,
    {
      readBody: async () => ({ proposition: await getPropositionById(createdId) }),
      sendJson,
      redactSecrets: (s) => s,
    }
  );
} finally {
  globalThis.fetch = realFetch;
}
assert.ok(submitRes.out.statusCode === 200 || submitRes.out.statusCode === 422, `submit status ${submitRes.out.statusCode}`);
assert.ok(stubCalls > 0, "submit called the (stubbed) model");

const stored = await getPropositionById(createdId);
assert.ok(stored.researchRunAt || stored.researchFindings, "submit stored research output");

const openRes = mockRes();
await handlePropositionById({ method: "GET", user }, openRes, createdId, {
  sendJson,
  redactSecrets: (s) => s,
});
assert.equal(openRes.out.statusCode, 200, openRes.out.body?.error);
assert.ok(openRes.out.body?.proposition?.id === createdId);

console.log("PASS testSlackLoginToOutput");
await suite.drop?.();
process.exit(0);
