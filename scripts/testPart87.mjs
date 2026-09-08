import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPassword } from "../lib/auth.js";
import { canViewProposition } from "../lib/propositionAccess.js";
import { matchesUnlockedDepartment, verifyDepartmentPassword } from "../lib/departmentAuth.js";

const rdFoods = {
  id: "1",
  name: "Low sodium Pickle variants",
  division: "Foods",
  submitterDepartment: "R&D",
};
const npdSnacks = {
  id: "2",
  name: "Crispy Garlic Dal Topper",
  division: "Snacks",
  submitterDepartment: "NPD",
};

assert.equal(matchesUnlockedDepartment(rdFoods, "R&D"), true, "R&D unlock is submitter team, not Foods division");
assert.equal(matchesUnlockedDepartment(rdFoods, "Foods"), false);
assert.equal(matchesUnlockedDepartment(npdSnacks, "R&D"), false);

assert.equal(canViewProposition({ department: "R&D" }, rdFoods), true);
assert.equal(canViewProposition({ department: "R&D" }, npdSnacks), false);
assert.equal(canViewProposition({ role: "ADMIN" }, npdSnacks), true);
assert.equal(canViewProposition(null, rdFoods), true, "form create/edit stays open without a Log unlock");

process.env.DEPT_PASSWORD_HASH_RD = hashPassword("correct-horse");
assert.equal(verifyDepartmentPassword("R&D", "correct-horse"), true);
assert.equal(verifyDepartmentPassword("R&D", "wrong-password"), false);
assert.equal(verifyDepartmentPassword("CIA", "correct-horse"), false);
delete process.env.DEPT_PASSWORD_HASH_RD;

const pageSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(pageSrc, /log-lock-screen/);
assert.match(pageSrc, /\/api\/department-auth\/unlock/);
assert.match(pageSrc, /Unlock with your department password/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /deleteAllPropositions\(unlockedDepartment\)/);
assert.match(apiSrc, /deleteUntouchedDrafts\(unlockedDepartment\)/);
assert.match(apiSrc, /departmentUnlockRequired/);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /submitter_department = \$1/);
assert.doesNotMatch(
  dbSrc,
  /DELETE FROM propositions WHERE division = \$1 OR created_by_department/
);

const authSrc = readFileSync(new URL("../lib/departmentAuth.js", import.meta.url), "utf8");
assert.doesNotMatch(authSrc, /password\s*[:=]\s*["'][^"']+["']/i);
assert.match(authSrc, /DEPT_PASSWORD_HASH_RD/);

const cookieSrc = readFileSync(new URL("../lib/auth.js", import.meta.url), "utf8");
assert.match(cookieSrc, /primus_dept/);
assert.match(cookieSrc, /maxAge: null/);

console.log("PASS Part 87: department password unlocks submitter team, not CK division; deletes stay scoped");
