/**
 * Display titles are labels only. Stored roles stay BM / BH FORUM / ADMIN / CMI / …
 */
import assert from "node:assert/strict";
import { assignedLogView, displayTitle, storedRoleLabel, DISPLAY_TITLES } from "../lib/displayTitle.js";
import { ownerLabel, usuallyProvidedByHint } from "../lib/fieldOwnership.js";

assert.deepEqual([...DISPLAY_TITLES], ["Admin", "Business Head", "Team Lead", "Individual contributor"]);
assert.equal(displayTitle({ role: "ADMIN" }), "Admin");
assert.equal(displayTitle({ role: "BH FORUM" }), "Business Head");
assert.equal(displayTitle({ role: "BM", orgRole: "TEAM_LEAD" }), "Team Lead");
assert.equal(displayTitle({ role: "BM", orgRole: "BUSINESS_HEAD" }), "Business Head");
assert.equal(displayTitle({ role: "BM" }), "Individual contributor");
assert.equal(assignedLogView({ role: "BM" }), "mine");
assert.equal(assignedLogView({ role: "BM", orgRole: "TEAM_LEAD", title: "Team Lead" }), "team");
assert.equal(assignedLogView({ role: "BH FORUM" }), "all");
assert.equal(assignedLogView({ role: "ADMIN" }), "all");
assert.equal(displayTitle({ role: "BM" }, { mappedBusinessHead: true }), "Business Head");
assert.equal(displayTitle({ role: "CMI" }), "Individual contributor");
assert.equal(storedRoleLabel("ADMIN"), "Admin");
assert.equal(storedRoleLabel("BH FORUM"), "Business Head");
assert.equal(storedRoleLabel("BM"), "Individual contributor");
assert.equal(storedRoleLabel("CMI"), "CMI");
assert.equal(storedRoleLabel("FINANCE"), "FINANCE");
assert.equal(storedRoleLabel("R&D"), "R&D");
assert.equal(storedRoleLabel("SALES"), "SALES");
assert.equal(storedRoleLabel("PACKAGING"), "PACKAGING");
assert.equal(ownerLabel("name"), "Individual contributor");
assert.match(usuallyProvidedByHint("benchmark"), /Individual contributor \/ CMI/);
assert.doesNotMatch(ownerLabel("name"), /\bBM\b/);
assert.doesNotMatch(ownerLabel("forumVerdict"), /BH FORUM/);
console.log("PASS testDisplayTitle");
