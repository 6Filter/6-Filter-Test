/**
 * Part 156 — /api/health names the database service (azure, render, neon, supabase, aws, local) without
 * revealing the host, user or password. 6 checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyDatabaseProvider, currentDatabaseProvider, DB_PROVIDERS } from "../lib/dbProvider.js";

let n = 0;
function check(name, fn) {
  fn();
  n += 1;
  console.log(`  ok ${n} — ${name}`);
}
const url = (host, extra = "") => `postgres://appuser:s3cretPW@${host}:5432/primus${extra}`;

check("names Azure for flexible-server, private-link and Cosmos for PostgreSQL hosts", () => {
  assert.equal(classifyDatabaseProvider(url("cavinkare-primus.postgres.database.azure.com", "?sslmode=require")), "azure");
  assert.equal(classifyDatabaseProvider(url("cavinkare-primus.privatelink.postgres.database.azure.com")), "azure");
  assert.equal(classifyDatabaseProvider(url("c-primus.abc123.postgres.cosmos.azure.com")), "azure");
  assert.equal(classifyDatabaseProvider("postgresql://u:p@Cavinkare-Primus.POSTGRES.DATABASE.AZURE.COM/db"), "azure", "host case does not matter");
});

check("names Render for the external host and for the private-network dpg- host", () => {
  assert.equal(classifyDatabaseProvider(url("dpg-dbtca9rbc2fs73doghpg-a.oregon-postgres.render.com")), "render");
  assert.equal(classifyDatabaseProvider(url("dpg-dbtca9rbc2fs73doghpg-a")), "render");
});

check("names Neon, Supabase, AWS and a local database", () => {
  assert.equal(classifyDatabaseProvider(url("ep-cool-1234.ap-southeast-1.aws.neon.tech")), "neon");
  assert.equal(classifyDatabaseProvider(url("db.abcdefgh.supabase.co")), "supabase");
  assert.equal(classifyDatabaseProvider(url("aws-0-ap-south-1.pooler.supabase.com")), "supabase");
  assert.equal(classifyDatabaseProvider(url("primus.c9x.ap-south-1.rds.amazonaws.com")), "aws");
  assert.equal(classifyDatabaseProvider(url("localhost")), "local");
  assert.equal(classifyDatabaseProvider(url("127.0.0.1")), "local");
});

check("look-alike hosts and look-alike user names or paths are not taken for a provider", () => {
  const fakes = [
    url("postgres.database.azure.com.evil.example"),
    url("evilpostgres.database.azure.com"),
    url("postgres.database.azure.com"), // no server name in front
    url("azure.com"),
    url("dpg-dbtca9rbc2fs73doghpg-a.evil.example"),
    url("dpg-abc-a.extra"),
    url("render.com.evil.example"),
    url("notneon.tech"),
    "postgres://postgres.database.azure.com:x@evil.example/db",
    "postgres://u:p@evil.example/postgres.database.azure.com",
    "postgres://u:p@evil.example/db?host=x.postgres.database.azure.com",
    "https://x.postgres.database.azure.com/db",
  ];
  for (const fake of fakes) assert.equal(classifyDatabaseProvider(fake), "other", fake.replace(/:[^:@/]*@/, ":***@"));
  assert.equal(classifyDatabaseProvider(""), "none");
  assert.equal(classifyDatabaseProvider(undefined), "none");
  assert.equal(classifyDatabaseProvider("not a url"), "other");
});

check("the answer is one fixed word: it never contains the host, the user or the password", () => {
  const secretHost = "uniquehostname9876.postgres.database.azure.com";
  const env = { DATABASE_URL: `postgres://secretuser1234:topsecretpw5678@${secretHost}:5432/db?sslmode=require` };
  const got = currentDatabaseProvider(env);
  assert.ok(DB_PROVIDERS.includes(got));
  for (const leak of ["uniquehostname9876", "secretuser1234", "topsecretpw5678", "5432", "sslmode"]) {
    assert.ok(!got.includes(leak), `leaks ${leak}`);
    assert.ok(!JSON.stringify({ dbProvider: got }).includes(leak), `json leaks ${leak}`);
  }
  assert.equal(got, "azure");
  assert.equal(currentDatabaseProvider({ POSTGRES_URL: url("db.abcdefgh.supabase.co") }), "supabase", "falls back to POSTGRES_URL like lib/db.js");
  assert.equal(currentDatabaseProvider({}), "none");
});

check("/api/health returns dbProvider in both the healthy and the unavailable answer, and only the name", () => {
  const src = readFileSync(new URL("../lib/healthApi.js", import.meta.url), "utf8");
  assert.match(src, /import \{ currentDatabaseProvider \} from "\.\/dbProvider\.js"/);
  assert.equal((src.match(/dbProvider: currentDatabaseProvider\(\)/g) || []).length, 2, "healthy and unavailable");
  assert.doesNotMatch(src, /DATABASE_URL/, "health never reads the raw connection string itself");
  assert.doesNotMatch(src, /hostname|new URL\(/, "health never parses a host");
  const mod = readFileSync(new URL("../lib/dbProvider.js", import.meta.url), "utf8");
  assert.doesNotMatch(mod, /console\.|return url\b|return text\b|return raw\b/, "the module returns names only");
});

console.log(`PASS testDbProvider (${n} checks)`);
