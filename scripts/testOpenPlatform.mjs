import assert from "node:assert/strict";
import {
  LOG_UNLOCK_DEPARTMENTS,
  PLATFORM_TEAM_LOCK_ENABLED,
} from "../lib/departmentAuthConstants.js";
import {
  SUBMITTER_DEPARTMENTS,
  isCanonicalTeam,
  normalizeNewTeamSelection,
  normalizeSubmitterDepartment,
  coalesceSubmitterDepartment,
  teamIsLegacy,
} from "../lib/propositionFields.js";

assert.equal(PLATFORM_TEAM_LOCK_ENABLED, false);
assert.deepEqual(LOG_UNLOCK_DEPARTMENTS, ["R&D", "NPD", "CIA", "Marketing"]);
assert.equal(SUBMITTER_DEPARTMENTS.length, 18);
assert.ok(SUBMITTER_DEPARTMENTS.includes("Manufacturing and Commodities"));
assert.ok(SUBMITTER_DEPARTMENTS.includes("Sales & Distribution PPD"));
assert.ok(!SUBMITTER_DEPARTMENTS.includes("Marketing - SN"));
assert.ok(!SUBMITTER_DEPARTMENTS.includes("NPD"));
assert.equal(normalizeNewTeamSelection("Packaging Development"), "Packaging Development");
assert.equal(normalizeNewTeamSelection("NPD"), "");
assert.equal(normalizeSubmitterDepartment("NPD"), "NPD");
assert.equal(teamIsLegacy("NPD"), true);
assert.equal(isCanonicalTeam("CIA"), true);
assert.equal(coalesceSubmitterDepartment("", "NPD"), "NPD");
assert.equal(coalesceSubmitterDepartment("Marketing", "NPD"), "NPD");
assert.equal(coalesceSubmitterDepartment("CIA", "NPD"), "CIA");

console.log("PASS open platform — no team lock; 18 submitter teams; legacy preserve");
