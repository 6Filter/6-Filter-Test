/**
 * Stats is organisation-wide. Log stays role-filtered.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const SKIP = "SKIP testStatsOrgWide — TEST_DATABASE_URL is not set";
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-stats-org-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "stats-org-session-secret-xxxxxxxx";

const { initDb, createProposition, findOrCreateSlackUser, setUserTeam } = await import("../lib/db.js");
const { handlePropositionsCollection, handleStatsIdeas } = await import("../lib/propositionsApi.js");

await initDb();

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.body = body;
};
const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader() {},
  end(payload) {
    if (payload != null && this.body == null) {
      try {
        this.body = typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch {
        this.body = payload;
      }
    }
  },
});

const ic = await findOrCreateSlackUser({
  email: "ic.stats@cavinkare.com",
  name: "IC Stats",
  role: "BM",
});
await setUserTeam(ic.id, "R&D");
const other = await findOrCreateSlackUser({
  email: "other.stats@cavinkare.com",
  name: "Other Stats",
  role: "BM",
});
await setUserTeam(other.id, "PC");

const mine = await createProposition({
  createdByUserId: ic.id,
  createdByEmail: ic.email,
  submitterDepartment: "R&D",
  submitterName: "IC Stats",
});
const theirs = await createProposition({
  createdByUserId: other.id,
  createdByEmail: other.email,
  submitterDepartment: "PC",
  submitterName: "Other Stats",
});

const icUser = { ...ic, email: ic.email, role: "BM", team: "R&D", department: "Open" };

const logRes = mkRes();
await handlePropositionsCollection(
  { method: "GET", user: icUser, url: "/api/propositions?limit=200" },
  logRes,
  { sendJson, redactSecrets: (s) => s }
);
assert.equal(logRes.statusCode, 200, logRes.body?.error);
const logIds = (logRes.body.propositions || []).map((p) => p.id);
assert.ok(logIds.includes(mine.id), "IC sees own idea on Log");
assert.equal(logIds.includes(theirs.id), false, "IC does not see a teammate's idea on Log");

const statsRes = mkRes();
await handleStatsIdeas(
  { method: "GET", user: icUser, url: "/api/stats/ideas?limit=200" },
  statsRes,
  { sendJson, redactSecrets: (s) => s }
);
assert.equal(statsRes.statusCode, 200, statsRes.body?.error);
assert.equal(statsRes.body.scope, "organisation");
const statsIds = (statsRes.body.propositions || []).map((p) => p.id);
assert.ok(statsIds.includes(mine.id), "Stats includes own idea");
assert.ok(statsIds.includes(theirs.id), "Stats includes another team's idea");
assert.equal(
  statsRes.body.propositions.some((p) => Object.prototype.hasOwnProperty.call(p, "ideaDescription") && p.ideaDescription),
  false,
  "Stats list does not send idea text"
);

console.log("PASS testStatsOrgWide");
await suite.drop?.();
process.exit(0);
