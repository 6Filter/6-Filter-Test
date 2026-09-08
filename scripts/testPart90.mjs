import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPassword } from "../lib/auth.js";
import {
  bootstrapDepartmentPasswordsFromEnv,
  getDepartmentPasswordHash,
  initDb,
  isUsingPostgres,
  upsertDepartmentPasswordHash,
} from "../lib/db.js";
import { verifyDepartmentPassword } from "../lib/departmentAuth.js";
import { applyScopedFilters, filterLogRows } from "../lib/logStatus.js";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /CREATE TABLE IF NOT EXISTS department_passwords/);
assert.match(dbSrc, /password_hash TEXT NOT NULL/);
assert.doesNotMatch(dbSrc, /DROP TABLE\s+propositions/i);
assert.doesNotMatch(dbSrc, /TRUNCATE\s+propositions/i);
assert.match(dbSrc, /usePostgres=\$\{usePostgres\}/);

const authSrc = readFileSync(new URL("../lib/departmentAuth.js", import.meta.url), "utf8");
assert.match(authSrc, /getDepartmentPasswordHash/);
assert.doesNotMatch(authSrc, /DEPT_PASSWORD_HASH_RD/);
assert.doesNotMatch(authSrc, /process\.env/);

const pageSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.doesNotMatch(pageSrc, /localStorage|sessionStorage/);
assert.match(pageSrc, /credentials:\s*"include"/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.doesNotMatch(
  appSrc,
  /localStorage\.(setItem|getItem)\([^)]*(password|department|unlock|primus_dept)/i
);

await initDb();
const hash = hashPassword("part90-rd-secret");
await upsertDepartmentPasswordHash("R&D", hash);
assert.equal(await getDepartmentPasswordHash("R&D"), hash);
assert.equal(await verifyDepartmentPassword("R&D", "part90-rd-secret"), true);
assert.equal(await verifyDepartmentPassword("R&D", "wrong"), false);
assert.equal(await verifyDepartmentPassword("CIA", "part90-rd-secret"), false);

const boot = await bootstrapDepartmentPasswordsFromEnv();
assert.equal(boot.bootstrapped, false, "existing rows must not be wiped by bootstrap");

const rows = [
  { id: "a", submitterDepartment: "R&D", division: "Foods", name: "Pickle", classification: "WATCH" },
  { id: "b", submitterDepartment: "NPD", division: "Snacks", name: "Dal", classification: "GO" },
];
const scoped = applyScopedFilters(rows, { teamFilter: "R&D" });
assert.equal(scoped.length, 1);
assert.equal(scoped[0].division, "Foods");
assert.equal(filterLogRows(rows, { teamFilter: "R&D", status: "ALL" }).length, 1);

console.log(
  `PASS Part 90: department passwords in ${isUsingPostgres() ? "postgres" : "file"} store; propositions migration is additive-only`
);
