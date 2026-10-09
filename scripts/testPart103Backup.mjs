import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { decideExpiryAlarm, dbExpiresInDays, expiryAlarmText } from "../lib/dbExpiry.js";
import { noteDbExpiryAlarm } from "../lib/dbExpiryNotice.js";
import { assertEmptyPropositions, selectExportTables } from "../lib/backupPlan.js";
import { handleHealth } from "../lib/healthApi.js";

const locked = readFileSync(new URL("../lib/lockedConstants.js", import.meta.url), "utf8");
assert.doesNotMatch(locked, /IDEA_STORE_|2026-|expires 25|Oct 2026/);
assert.match(locked, /NOGO_MAX: 60/);
assert.match(locked, /WATCH_MAX: 80/);

const names = ["propositions", "research_cache", "department_passwords", "users", "department_api_keys"];
assert.deepEqual(selectExportTables(names), ["department_api_keys", "department_passwords", "propositions", "users"]);
assert.deepEqual(selectExportTables(names, { excludeSecrets: true }), ["propositions", "users"]);
assert.ok(selectExportTables(names, { includeResearchCache: true }).includes("research_cache"));

assert.throws(() => assertEmptyPropositions(2), /already has rows/);
assert.doesNotThrow(() => assertEmptyPropositions(0));

for (const days of [14, 7, 3, 1]) {
  assert.equal(decideExpiryAlarm({ daysLeft: days, alreadySent: false }), expiryAlarmText(days));
  assert.equal(decideExpiryAlarm({ daysLeft: days, alreadySent: true }), null);
}
assert.equal(decideExpiryAlarm({ daysLeft: 13, alreadySent: false }), null);
assert.match(expiryAlarmText(14), /Primus database expires in 14 days\. Upgrade or migrate\./);

const sent = new Set();
const store = {
  async has(expiresAt, daysLeft) {
    return sent.has(`${expiresAt}|${daysLeft}`);
  },
  async add(expiresAt, daysLeft) {
    sent.add(`${expiresAt}|${daysLeft}`);
  },
};
process.env.DB_EXPIRES_AT = "2026-10-25T04:52:34.053Z";
const now = new Date(Date.parse(process.env.DB_EXPIRES_AT) - 13 * 86400000 - 3600000);
assert.equal(dbExpiresInDays(now), 14);
const first = await noteDbExpiryAlarm(now, store);
const second = await noteDbExpiryAlarm(now, store);
assert.equal(first.alarm, "Primus database expires in 14 days. Upgrade or migrate.");
assert.equal(second.alarm, null);

const healthNow = Date.now();
process.env.DB_EXPIRES_AT = new Date(healthNow + 10 * 86400000).toISOString();
const captured = [];
const res = {
  statusCode: 0,
  setHeader() {},
  end(body) {
    captured.push({ status: this.statusCode, body });
  },
};
await handleHealth({ method: "GET" }, res);
const body = JSON.parse(captured[0].body);
assert.equal(captured[0].status, 200);
assert.equal(body.dbExpiresInDays, dbExpiresInDays(new Date()));
delete process.env.DB_EXPIRES_AT;

const refused = spawnSync(process.execPath, ["scripts/exportAllTables.mjs", "--out", "lib/not-a-backup"], {
  encoding: "utf8",
});
assert.notEqual(refused.status, 0);
assert.match(refused.stderr, /not gitignored/);

console.log("PASS Part 103 export guard and expiry countdown");
