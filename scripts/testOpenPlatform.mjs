import assert from "node:assert/strict";
import {
  OPEN_ACCESS_TEAM,
  PLATFORM_TEAM_LOCK_ENABLED,
  LOG_UNLOCK_DEPARTMENTS,
  normalizeLogUnlock,
} from "../lib/departmentAuthConstants.js";
import { unlockedDepartmentOf, requireUnlockedDepartment, canViewProposition } from "../lib/propositionAccess.js";
import { SUBMITTER_DEPARTMENTS, normalizeSubmitterDepartment } from "../lib/propositionFields.js";
import { ownershipBanner } from "../lib/fieldOwnership.js";
import { resolveBillingApiKey } from "../lib/departmentApiKeys.js";

assert.equal(PLATFORM_TEAM_LOCK_ENABLED, false, "team password gate is off for now");
assert.equal(unlockedDepartmentOf({}), OPEN_ACCESS_TEAM);
assert.equal(requireUnlockedDepartment(null), OPEN_ACCESS_TEAM);
assert.equal(canViewProposition({}, { id: "x" }), true);
assert.equal(normalizeLogUnlock(OPEN_ACCESS_TEAM), OPEN_ACCESS_TEAM);
assert.deepEqual(LOG_UNLOCK_DEPARTMENTS, ["R&D", "NPD", "CIA", "Marketing"]);
assert.equal(SUBMITTER_DEPARTMENTS.length, 17);
assert.equal(normalizeSubmitterDepartment("Packaging Development"), "Packaging Development");
assert.equal(normalizeSubmitterDepartment("NPD"), "");
assert.match(ownershipBanner(null), /Every filter is open/i);

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-open-platform-test";
const billing = await resolveBillingApiKey(OPEN_ACCESS_TEAM);
assert.equal(billing.source, "ANTHROPIC_API_KEY");
assert.ok(billing.apiKey);

console.log("PASS open platform — no team lock; 17 submitter departments");
