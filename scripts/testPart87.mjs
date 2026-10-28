import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPassword } from "../lib/auth.js";
import { canViewProposition } from "../lib/propositionAccess.js";
import { matchesUnlockedDepartment, verifyDepartmentPassword } from "../lib/departmentAuth.js";
import { PLATFORM_TEAM_LOCK_ENABLED } from "../lib/departmentAuthConstants.js";
import { initDb, upsertDepartmentPasswordHash } from "../lib/db.js";

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
assert.equal(matchesUnlockedDepartment(npdSnacks, "R&D"), true, "every unlocked team sees every stored idea");
assert.equal(
  matchesUnlockedDepartment(
    { ...npdSnacks, createdAt: "2026-10-02T04:00:00.000Z" },
    "CIA"
  ),
  true,
  "ideas from any month show on every team's Log"
);

assert.equal(canViewProposition({ department: "R&D" }, rdFoods), true);
assert.equal(canViewProposition({ department: "R&D" }, npdSnacks), true);
assert.equal(
  canViewProposition({ department: "NPD" }, { id: "draft", submitterDepartment: "" }),
  true,
  "unlocked team must see unassigned drafts so Submit can persist a verdict"
);
assert.equal(matchesUnlockedDepartment({ submitterDepartment: "" }, "NPD"), true);
assert.equal(canViewProposition({ role: "ADMIN" }, npdSnacks), true);
assert.equal(canViewProposition({ department: "Master" }, rdFoods), true);
assert.equal(canViewProposition({ department: "Master" }, npdSnacks), true);
assert.equal(
  canViewProposition(null, rdFoods),
  !PLATFORM_TEAM_LOCK_ENABLED,
  PLATFORM_TEAM_LOCK_ENABLED
    ? "Part 93: platform requires team unlock"
    : "open platform: no team unlock required"
);

await initDb();
await upsertDepartmentPasswordHash("R&D", hashPassword("correct-horse"));
assert.equal(await verifyDepartmentPassword("R&D", "correct-horse"), true);
assert.equal(await verifyDepartmentPassword("R&D", "wrong-password"), false);
assert.equal(await verifyDepartmentPassword("CIA", "correct-horse"), false);

const pageSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(pageSrc, /log-lock-screen/);
assert.match(pageSrc, /\/api\/department-auth\/unlock/);
assert.match(pageSrc, /Unlock with your department password/);
assert.match(pageSrc, /departmentAuthConstants\.js/);
assert.doesNotMatch(
  pageSrc,
  /from ["']\.\.\/lib\/departmentAuth\.js["']/,
  "LogPage must not import departmentAuth.js (pulls node:crypto via auth.js)"
);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /submitterDepartment: department/);
assert.match(apiSrc, /deleteAllPropositions\(null, "Master"\)/);
assert.match(apiSrc, /deleteUntouchedDrafts\(null, actor\)/);
assert.match(apiSrc, /canDeleteLogProposition/);
assert.match(apiSrc, /departmentUnlockRequired/);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /submitter_department = \$1/);
assert.doesNotMatch(
  dbSrc,
  /DELETE FROM propositions WHERE division = \$1 OR created_by_department/
);

const authSrc = readFileSync(new URL("../lib/departmentAuth.js", import.meta.url), "utf8");
assert.doesNotMatch(authSrc, /password\s*[:=]\s*["'][^"']+["']/i);
assert.match(authSrc, /getDepartmentPasswordHash/);

const cookieSrc = readFileSync(new URL("../lib/auth.js", import.meta.url), "utf8");
assert.match(cookieSrc, /primus_dept/);
assert.match(cookieSrc, /maxAge: null/);

console.log("PASS Part 87: department password unlocks submitter team, not CK division; deletes stay scoped");
