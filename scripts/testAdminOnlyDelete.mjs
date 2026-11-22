/**
 * Delete and untouched-draft cleanup are stored ADMIN only.
 * A Team Lead (stored BM) and other non-ADMIN roles cannot delete.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canDeleteLogProposition } from "../lib/propositionAccess.js";

assert.equal(canDeleteLogProposition({ role: "ADMIN" }), true);
assert.equal(canDeleteLogProposition({ role: "BM" }), false, "Team Lead / BM cannot delete");
assert.equal(canDeleteLogProposition({ role: "BH FORUM" }), false);
assert.equal(canDeleteLogProposition({ role: "CMI" }), false);
assert.equal(canDeleteLogProposition({ role: "FINANCE" }), false);
assert.equal(canDeleteLogProposition({ role: "R&D" }), false);
assert.equal(canDeleteLogProposition({ role: "SALES" }), false);
assert.equal(canDeleteLogProposition({ role: "PACKAGING" }), false);
assert.equal(canDeleteLogProposition({ role: "TEAM_LEAD" }), false);
assert.equal(canDeleteLogProposition({}), false);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /canDeleteLogProposition/);
assert.doesNotMatch(
  apiSrc,
  /Only ADMIN or BM can clean up|Only BM or ADMIN can delete|role !== "ADMIN" && role !== "BM"/,
  "API must not keep a BM delete/cleanup gate"
);
assert.match(apiSrc, /Only ADMIN can delete a proposition/);
assert.match(apiSrc, /Only ADMIN can clean up untouched drafts/);

const accessSrc = readFileSync(new URL("../lib/propositionAccess.js", import.meta.url), "utf8");
assert.match(accessSrc, /canDeleteLogProposition[\s\S]*?===\s*"ADMIN"/);

console.log("PASS testAdminOnlyDelete — delete and cleanup are ADMIN only");
