/**
 * Screenings in flight: process-local counter plus a DB fallback that never
 * returns idea text. Does not need live Postgres.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  beginScreeningInFlight,
  countScreeningsInFlight,
  endScreeningInFlight,
  IN_FLIGHT_TTL_MINUTES,
  processLocalScreeningsInFlight,
  resetScreeningsInFlightForTests,
  withScreeningInFlight,
} from "../lib/screeningsInFlight.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(name, fn) {
  fn();
  n += 1;
  console.log(`  ok ${n} — ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  n += 1;
  console.log(`  ok ${n} — ${name}`);
}

resetScreeningsInFlightForTests();

check("process-local starts at zero and tracks begin/end", () => {
  assert.equal(processLocalScreeningsInFlight(), 0);
  beginScreeningInFlight();
  beginScreeningInFlight();
  assert.equal(processLocalScreeningsInFlight(), 2);
  endScreeningInFlight();
  assert.equal(processLocalScreeningsInFlight(), 1);
  endScreeningInFlight();
  assert.equal(processLocalScreeningsInFlight(), 0);
  endScreeningInFlight();
  assert.equal(processLocalScreeningsInFlight(), 0, "never goes negative");
});

await checkAsync("withScreeningInFlight counts while the run is open and clears after", async () => {
  resetScreeningsInFlightForTests();
  const fileDb = { isUsingPostgres: () => false };
  let seen = -1;
  const out = await withScreeningInFlight(async () => {
    seen = await countScreeningsInFlight({ db: fileDb });
    return "done";
  }, { db: fileDb });
  assert.equal(out, "done");
  assert.equal(seen, 1);
  assert.equal(processLocalScreeningsInFlight(), 0);
});

await checkAsync("overlapping runs add, and a thrown run still decrements", async () => {
  resetScreeningsInFlightForTests();
  const fileDb = { isUsingPostgres: () => false };
  let inner = 0;
  const a = withScreeningInFlight(async () => {
    await withScreeningInFlight(async () => {
      inner = processLocalScreeningsInFlight();
    }, { db: fileDb });
  }, { db: fileDb });
  await a;
  assert.equal(inner, 2);
  await assert.rejects(
    () => withScreeningInFlight(async () => {
      throw new Error("research failed");
    }, { db: fileDb }),
    /research failed/
  );
  assert.equal(processLocalScreeningsInFlight(), 0);
});

await checkAsync("DB fallback is COUNT(*) of opaque tokens, never idea text, and max() wins", async () => {
  resetScreeningsInFlightForTests();
  const sqls = [];
  const db = {
    isUsingPostgres: () => true,
    initDb: async () => {},
    query: async (sql, params) => {
      sqls.push({ sql, params });
      if (/COUNT\(\*\)/.test(sql)) return [{ n: 3 }];
      return [];
    },
  };
  assert.equal(await countScreeningsInFlight({ db }), 3);
  beginScreeningInFlight();
  beginScreeningInFlight();
  beginScreeningInFlight();
  beginScreeningInFlight();
  assert.equal(await countScreeningsInFlight({ db }), 4, "process-local 4 beats db 3");
  endScreeningInFlight();
  endScreeningInFlight();
  endScreeningInFlight();
  endScreeningInFlight();

  const countSql = sqls.find((row) => /COUNT\(\*\)/.test(row.sql));
  assert.ok(countSql, "issues a COUNT query");
  assert.match(countSql.sql, /research_inflight/);
  assert.equal(countSql.params[0], IN_FLIGHT_TTL_MINUTES);
  for (const row of sqls) {
    assert.doesNotMatch(row.sql, /payload|idea|email|fingerprint|name/i);
  }
});

await checkAsync("DB insert/delete use the token table only; a down DB still returns the process count", async () => {
  resetScreeningsInFlightForTests();
  const sqls = [];
  const db = {
    isUsingPostgres: () => true,
    initDb: async () => {},
    query: async (sql) => {
      sqls.push(sql);
      if (/COUNT\(\*\)/.test(sql)) return [{ n: 1 }];
      return [];
    },
  };
  await withScreeningInFlight(async () => "ok", { db });
  assert.ok(sqls.some((sql) => /INSERT INTO research_inflight/.test(sql)));
  assert.ok(sqls.some((sql) => /DELETE FROM research_inflight/.test(sql)));
  assert.ok(sqls.every((sql) => !/payload|idea_description|email/i.test(sql)));

  const broken = {
    isUsingPostgres: () => true,
    initDb: async () => {
      throw new Error("db down");
    },
    query: async () => {
      throw new Error("db down");
    },
  };
  beginScreeningInFlight();
  assert.equal(await countScreeningsInFlight({ db: broken }), 1);
  endScreeningInFlight();
});

check("GET /api/health exposes screeningsInFlight on healthy and unavailable answers", () => {
  const health = readFileSync(path.join(root, "lib", "healthApi.js"), "utf8");
  assert.equal(
    (health.match(/screeningsInFlight:/g) || []).length,
    2,
    "healthy and unavailable"
  );
  assert.match(health, /countScreeningsInFlight\(\)/);
  assert.match(health, /processLocalScreeningsInFlight\(\)/);
  assert.doesNotMatch(health, /ideaDescription|createdByEmail|researchFindings/);
  const firstPass = readFileSync(path.join(root, "lib", "propositionAiFirstPass.js"), "utf8");
  assert.match(firstPass, /withScreeningInFlight\(\(\) => runPropositionResearchBody\(opts\)\)/);
  const dbSrc = readFileSync(path.join(root, "lib", "db.js"), "utf8");
  assert.match(dbSrc, /CREATE TABLE IF NOT EXISTS research_inflight/);
  assert.match(dbSrc, /id TEXT PRIMARY KEY/);
  assert.doesNotMatch(
    dbSrc.slice(dbSrc.indexOf("research_inflight"), dbSrc.indexOf("research_inflight") + 400),
    /idea|email|payload/i
  );
  const mod = readFileSync(path.join(root, "lib", "screeningsInFlight.js"), "utf8");
  const sql = [...mod.matchAll(/`([^`]+)`/g)].map((m) => m[1]).join("\n");
  assert.match(sql, /SELECT COUNT\(\*\)::int AS n FROM research_inflight/);
  assert.doesNotMatch(sql, /payload|email|ideaDescription|fingerprint/);
});

const sample = { ok: true, screeningsInFlight: 0 };
assert.equal(Object.keys(sample).includes("screeningsInFlight"), true);
assert.equal(typeof sample.screeningsInFlight, "number");
assert.doesNotMatch(JSON.stringify(sample), /"idea"|"email"|"payload"/);

resetScreeningsInFlightForTests();
console.log(`PASS testScreeningsInFlight (${n} checks)`);
