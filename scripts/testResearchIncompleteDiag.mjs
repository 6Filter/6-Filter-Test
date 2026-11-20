/**
 * Admin research-incomplete diagnostic: counts only, no idea text, no secrets.
 * Classifier unit tests always run. HTTP checks need local TEST_DATABASE_URL.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import {
  classifyCause,
  classifyDoc,
  errorSignals,
  summariseIncomplete,
} from "../lib/researchIncompleteDiag.js";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failed += 1;
}

check("rate limit", classifyCause(["HTTP 429 rate limit"]) === "rate_limit");
check("timeout", classifyCause(["ETIMEDOUT connecting"]) === "timeout");
check("malformed", classifyCause(["parseFailed: not valid json"]) === "malformed_output");
check("guard", classifyCause(["placeholder / junk, not a real answer"]) === "guard_refusal");
check("provider", classifyCause(["upstream 500 from the model host"]) === "provider_error");
check("empty is never started", classifyCause([]) === "never_started");
check("quote with timeout is ignored", errorSignals({
  f4: { quote: "the process timed out in 2019", assessments: { x: { raw: "timeout in copy" } } },
}).length === 0);

const secretBlob = { error: "sk-ant-abcdefghijklmnopqrstuvwxyz012345", researchFailed: true };
check("secrets are redacted before cause class", !/sk-ant-/.test(JSON.stringify(classifyCause(errorSignals(secretBlob)))));

const sealed = { classification: "GO", score: { pct: 80, done: 8, total: 10 }, output: { sealedAt: "2026-01-02T00:00:00.000Z" } };
const EXPECTED = ["F1", "F2", "F3", "F4", "F5"];
const ledger = (failedSteps, extra = {}) => ({
  stepsExpected: EXPECTED,
  stepsDone: EXPECTED.filter((s) => !failedSteps.includes(s)),
  stepsFailed: failedSteps,
  ...extra,
});
const missing = (steps, extra = {}) => ({
  stepsExpected: EXPECTED,
  stepsDone: EXPECTED.filter((s) => !steps.includes(s)),
  stepsFailed: [],
  ...extra,
});

const docs = [
  { researchRunAt: "2026-11-18T18:30:00.000Z", goNoGo: sealed, researchFindings: missing(["F4"], { f4: {} }) },
  { researchRunAt: "2026-11-18T18:30:00.000Z", goNoGo: sealed, researchFindings: ledger(["F4"], { f4: { error: "429 too many requests", researchFailed: true } }) },
  { researchRunAt: "2026-11-19T18:30:00.000Z", goNoGo: sealed, researchFindings: ledger(["F3"], { f3: { error: "deadline exceeded", researchFailed: true } }) },
  { researchRunAt: "2026-11-19T18:30:00.000Z", goNoGo: sealed, researchFindings: ledger(["F2"], { f2: { parseFailed: true, error: "not valid json" } }) },
  { researchRunAt: "2026-11-19T18:30:00.000Z", goNoGo: sealed, researchFindings: ledger(["F1"], { f1: { error: "placeholder, not a real answer", researchFailed: true } }) },
  { researchRunAt: "2026-11-19T18:30:00.000Z", goNoGo: sealed, researchFindings: ledger(["F5"], { f5: { error: "provider 500", researchFailed: true } }) },
  { researchRunAt: "2026-11-19T18:30:00.000Z", goNoGo: sealed, researchFindings: { stepsExpected: ["F1", "F2", "F3", "F4", "F5"], stepsDone: ["F1", "F2", "F3", "F4", "F5"], stepsFailed: [] } },
  { researchFindings: {} },
];

const summary = summariseIncomplete(docs);
check("unfinished count is 6", summary.incomplete === 6, String(summary.incomplete));
check("health incomplete is the missing-step case", summary.healthIncomplete === 1, String(summary.healthIncomplete));
check("failed is 5", summary.failed === 5, String(summary.failed));
check("evaluated is 7", summary.evaluated === 7, String(summary.evaluated));
check("share of evaluated is 6/7", summary.shareOfEvaluated === 6 / 7, String(summary.shareOfEvaluated));
check("byCause never_started", summary.byCause.never_started === 1);
check("byCause rate_limit", summary.byCause.rate_limit === 1);
check("byCause timeout", summary.byCause.timeout === 1);
check("byCause malformed_output", summary.byCause.malformed_output === 1);
check("byCause guard_refusal", summary.byCause.guard_refusal === 1);
check("byCause provider_error", summary.byCause.provider_error === 1);
check("byFilter F4 includes never started", summary.byFilter.F4 >= 1);
check("IST dates present", Object.keys(summary.byDate).some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
check("summary has no idea text keys", !("ideas" in summary) && !("names" in summary) && !("findings" in summary));

const ideaTextDoc = {
  researchRunAt: "2026-11-19T18:30:00.000Z",
  name: "SECRET-SERUM-NAME",
  ideaDescription: "leave-on serum that must never leak",
  researchFindings: ledger(["F4"], { f4: { error: "timeout", quote: "SECRET-SERUM-NAME timed out" } }),
};
const classified = classifyDoc(ideaTextDoc);
check("classifier result has no idea text", !JSON.stringify(classified).includes("SECRET-SERUM-NAME"));

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP HTTP research-incomplete — TEST_DATABASE_URL not set");
  process.exit(failed || (process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0));
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-w3-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "w3-test-session";
process.env.LOGIN_CODE_SECRET = "w3-test-login";
delete process.env.POSTGRES_URL;

const { initDb, createProposition, query, findOrCreateSlackUser, closeDatabase } = await import("../lib/db.js");
const { signSession } = await import("../lib/auth.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
await initDb();

const admin = await findOrCreateSlackUser({ email: "w3-admin@example.com", name: "W3 Admin", role: "ADMIN", externalId: "U_W3A" });
const member = await findOrCreateSlackUser({ email: "w3-member@example.com", name: "W3 Member", role: "BM", externalId: "U_W3M" });
const cookie = (u) => `primus_session=${signSession({ userId: u.id, tokenVersion: Number(u.tokenVersion ?? u.token_version ?? 1) })}`;

async function http(method, url, { body, as } = {}) {
  const raw = body == null ? "" : JSON.stringify(body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method,
    url,
    headers: {
      host: "127.0.0.1",
      "content-type": "application/json",
      ...(as ? { cookie: cookie(as) } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const o = { status: 200, headers: {}, raw: "" };
  const res = {
    get statusCode() { return o.status; },
    set statusCode(v) { o.status = v; },
    setHeader(k, v) { o.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return o.headers[String(k).toLowerCase()]; },
    writeHead(s) { o.status = s; return res; },
    write(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); return true; },
    end(c) { if (c != null) o.raw += Buffer.isBuffer(c) ? c.toString("utf8") : String(c); },
  };
  await handleApiRequest(req, res);
  let json = null;
  try { json = JSON.parse(o.raw || "null"); } catch { /* not json */ }
  return { ...o, json };
}

const MARKER = "W3-NEVER-LEAK-IDEA-TEXT";
async function seed(findings, runAt, go = sealed) {
  const row = await createProposition({ createdByEmail: admin.email, createdByUserId: admin.id, submitterName: MARKER, submitterDepartment: "R&D" });
  await query(
    `UPDATE propositions
        SET name = $2,
            idea_description = $3,
            research_run_at = $4::timestamptz,
            research_findings_json = $5::jsonb,
            go_nogo_json = $6::jsonb
      WHERE id = $1`,
    [row.id, MARKER, `${MARKER} leave-on serum`, runAt, JSON.stringify(findings), JSON.stringify(go)]
  );
  return row.id;
}

await seed(missing(["F4"], { f4: {} }), "2026-11-18T18:30:00.000Z");
await seed(ledger(["F4"], { f4: { error: "429 too many requests", researchFailed: true } }), "2026-11-18T18:30:00.000Z");
await seed(ledger(["F3"], { f3: { error: "deadline exceeded", researchFailed: true } }), "2026-11-19T18:30:00.000Z");
await seed(ledger(["F2"], { f2: { parseFailed: true, error: "not valid json" } }), "2026-11-19T18:30:00.000Z");
await seed(ledger(["F1"], { f1: { error: "placeholder, not a real answer", researchFailed: true } }), "2026-11-19T18:30:00.000Z");
await seed(ledger(["F5"], { f5: { error: "provider 500 sk-ant-abcdefghijklmnopqrstuvwxyz012345", researchFailed: true } }), "2026-11-19T18:30:00.000Z");
await seed({ stepsExpected: EXPECTED, stepsDone: EXPECTED, stepsFailed: [] }, "2026-11-19T18:30:00.000Z");
const draft = await createProposition({ createdByEmail: admin.email, createdByUserId: admin.id, submitterName: MARKER, submitterDepartment: "R&D" });
await query(`UPDATE propositions SET name = $2, idea_description = $3 WHERE id = $1`, [draft.id, MARKER, `${MARKER} draft`]);

const anon = await http("GET", "/api/admin/research-incomplete");
const bm = await http("GET", "/api/admin/research-incomplete", { as: member });
const ok = await http("GET", "/api/admin/research-incomplete", { as: admin });
const dump = JSON.stringify(ok.json || {});

check("anonymous is 401", anon.status === 401, String(anon.status));
check("member is 403", bm.status === 403, String(bm.status));
check("admin is 200", ok.status === 200, String(ok.status));
check("admin counts unfinished", ok.json?.incomplete === 6, String(ok.json?.incomplete));
check("admin share of evaluated", ok.json?.shareOfEvaluated === 6 / 7, String(ok.json?.shareOfEvaluated));
check("admin byCause keys", ["provider_error", "rate_limit", "timeout", "malformed_output", "guard_refusal", "never_started"].every((k) => k in (ok.json?.byCause || {})));
check("no idea text in body", !dump.includes(MARKER));
check("no secrets in body", !/sk-ant-|sk-proj-|xoxb-|SESSION_SECRET|postgres:postgres/i.test(dump));
check("no findings dump", !dump.includes("stepsExpected") && !dump.includes("leave-on"));

try {
  await closeDatabase?.();
} finally {
  await suite.drop();
}

if (failed) {
  console.error(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("PASS testResearchIncompleteDiag");
