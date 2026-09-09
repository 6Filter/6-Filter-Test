import assert from "node:assert/strict";
import { hashPassword } from "../lib/auth.js";
import {
  isMasterUnlock,
  LOG_MASTER_UNLOCK,
  LOG_UNLOCK_OPTIONS,
  matchesUnlockedDepartment,
  verifyDepartmentPassword,
} from "../lib/departmentAuth.js";
import { canRunDepartmentWipe, canViewProposition } from "../lib/propositionAccess.js";
import { initDb, upsertDepartmentPasswordHash } from "../lib/db.js";

const rd = { id: "1", submitterDepartment: "R&D", division: "Foods", name: "Pickle" };
const npd = { id: "2", submitterDepartment: "NPD", division: "Snacks", name: "Dal" };

assert.ok(LOG_UNLOCK_OPTIONS.includes(LOG_MASTER_UNLOCK));
assert.equal(isMasterUnlock(LOG_MASTER_UNLOCK), true);
assert.equal(matchesUnlockedDepartment(rd, LOG_MASTER_UNLOCK), true);
assert.equal(matchesUnlockedDepartment(npd, LOG_MASTER_UNLOCK), true);
assert.equal(canViewProposition({ department: LOG_MASTER_UNLOCK }, rd), true);
assert.equal(canViewProposition({ department: LOG_MASTER_UNLOCK }, npd), true);
assert.equal(canRunDepartmentWipe({ department: LOG_MASTER_UNLOCK }), false);
assert.equal(canRunDepartmentWipe({ department: "R&D" }), true);

await initDb();
await upsertDepartmentPasswordHash(LOG_MASTER_UNLOCK, hashPassword("Iwillnottellthepassword"));
assert.equal(await verifyDepartmentPassword(LOG_MASTER_UNLOCK, "Iwillnottellthepassword"), true);
assert.equal(await verifyDepartmentPassword(LOG_MASTER_UNLOCK, "wrong"), false);

console.log("PASS Master unlock: sees all teams, wipe blocked, password verifies");
