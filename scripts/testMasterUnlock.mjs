import assert from "node:assert/strict";
import { hashPassword } from "../lib/auth.js";
import {
  isMasterUnlock,
  LOG_MASTER_UNLOCK,
  LOG_UNLOCK_OPTIONS,
  matchesUnlockedDepartment,
  verifyDepartmentPassword,
} from "../lib/departmentAuth.js";
import {
  canDeleteLogProposition,
  canRunDepartmentWipe,
  canViewProposition,
} from "../lib/propositionAccess.js";
import { initDb, upsertDepartmentPasswordHash } from "../lib/db.js";
import { readFileSync } from "node:fs";

const rd = { id: "1", submitterDepartment: "R&D", division: "Foods", name: "Pickle" };
const npd = { id: "2", submitterDepartment: "NPD", division: "Snacks", name: "Dal" };

assert.ok(LOG_UNLOCK_OPTIONS.includes(LOG_MASTER_UNLOCK));
assert.equal(isMasterUnlock(LOG_MASTER_UNLOCK), true);
assert.equal(matchesUnlockedDepartment(rd, LOG_MASTER_UNLOCK), true);
assert.equal(matchesUnlockedDepartment(npd, LOG_MASTER_UNLOCK), true);
assert.equal(canViewProposition({ department: LOG_MASTER_UNLOCK }, rd), true);
assert.equal(canViewProposition({ department: LOG_MASTER_UNLOCK }, npd), true);
assert.equal(canDeleteLogProposition({ department: LOG_MASTER_UNLOCK }), true);
assert.equal(canDeleteLogProposition({ department: "R&D" }), false);
assert.equal(canRunDepartmentWipe({ department: "R&D" }), false);
assert.equal(canRunDepartmentWipe({ department: LOG_MASTER_UNLOCK }), false);

const pageSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(pageSrc, /allowDelete/);
assert.match(pageSrc, /ADMIN or Master can delete|canDeleteRow/);
assert.match(pageSrc, /masterView \|\|/);
assert.match(pageSrc, /canDeleteRow/);
assert.match(pageSrc, /role \|\| ""\)\.trim\(\) === "ADMIN"/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /canDeleteLogProposition/);

assert.equal(canDeleteLogProposition({ role: "ADMIN", email: "tanmay.v@cavinkare.com" }), true);

await initDb();
await upsertDepartmentPasswordHash(LOG_MASTER_UNLOCK, hashPassword("Iwillnottellthepassword"));
assert.equal(await verifyDepartmentPassword(LOG_MASTER_UNLOCK, "Iwillnottellthepassword"), true);
assert.equal(await verifyDepartmentPassword(LOG_MASTER_UNLOCK, "wrong"), false);

console.log("PASS Master unlock: sees all teams; only Master may delete");
