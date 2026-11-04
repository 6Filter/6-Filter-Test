import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROPOSITION_TOP_FIELDS,
  SUBMITTER_DEPARTMENTS,
  hasSubmitterIdentity,
  mergeProposition,
  normalizeNewTeamSelection,
  normalizeSubmitterDepartment,
  coalesceSubmitterDepartment,
  teamIsLegacy,
} from "../lib/propositionFields.js";
import { researchHashFor } from "../lib/researchCache.js";

assert.equal(PROPOSITION_TOP_FIELDS[0].key, "submitterName");
assert.equal(PROPOSITION_TOP_FIELDS[1].key, "submitterDepartment");
assert.deepEqual(
  PROPOSITION_TOP_FIELDS[1].options.filter((o) => o.v).map((o) => o.v),
  [...SUBMITTER_DEPARTMENTS]
);
assert.equal(SUBMITTER_DEPARTMENTS.length, 18);

assert.equal(normalizeSubmitterDepartment("NPD"), "NPD");
assert.equal(teamIsLegacy("NPD"), true);
assert.equal(normalizeNewTeamSelection("NPD"), "");
assert.equal(normalizeNewTeamSelection("CIA"), "CIA");
assert.equal(hasSubmitterIdentity({ submitterName: "Asha", submitterDepartment: "R&D" }), true);
assert.equal(hasSubmitterIdentity({ submitterName: "Asha", submitterDepartment: "NPD" }), true);
assert.equal(hasSubmitterIdentity({ submitterName: "Asha", submitterDepartment: "" }), false);
assert.equal(hasSubmitterIdentity({ submitterName: "", submitterDepartment: "CIA" }), false);
assert.equal(coalesceSubmitterDepartment("", "NPD"), "NPD");
assert.equal(coalesceSubmitterDepartment("CIA", "NPD"), "CIA");

const base = {
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "menthol stick in the pack",
  f1: { declaredAttribute: "cooling", benchmark: "Indulekha" },
};
assert.equal(
  researchHashFor(base),
  researchHashFor({ ...base, submitterName: "Asha", submitterDepartment: "R&D" }),
  "submitter identity must not change the research cache"
);

const merged = mergeProposition({
  submitterName: "  Asha  ",
  submitterDepartment: "CIA",
  name: "Oil",
});
assert.equal(merged.submitterName, "Asha");
assert.equal(merged.submitterDepartment, "CIA");
assert.equal(merged.teamIsLegacy, false);

const legacyMerged = mergeProposition({ submitterName: "Asha", submitterDepartment: "NPD" });
assert.equal(legacyMerged.submitterDepartment, "NPD");
assert.equal(legacyMerged.teamIsLegacy, true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /hasSubmitterIdentity/);
// Part 124: creator picks the idea team on the form (no longer a locked "From your account" box).
assert.match(formSrc, /SUBMITTER_DEPARTMENTS/);
assert.match(formSrc, /Ask the admin to change it|Reviewed by/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /hasSubmitterIdentity\(payload\)/);
assert.match(apiSrc, /canAccessIdea/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /rowPerson/);
assert.match(logSrc, /rowTeam/);
assert.match(logSrc, /SUBMITTER_DEPARTMENTS/);
assert.match(logSrc, /Legacy team/);
assert.match(appSrc, /LogPage/);
// Part 129 — ADMIN Settings mounts AdminUsersPage for scoring re-score.
assert.match(appSrc, /AdminUsersPage/);
assert.doesNotMatch(appSrc, /setView\("admin"\)/);

const loginSrc = readFileSync(new URL("../src/LoginScreen.jsx", import.meta.url), "utf8");
assert.doesNotMatch(loginSrc, /password/i);
assert.doesNotMatch(loginSrc, /Create an account/);
assert.match(loginSrc, /Send code/);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /submitter_name/);
assert.match(dbSrc, /submitter_department/);
assert.match(dbSrc, /created_by_email/);
assert.match(dbSrc, /coalesceSubmitterDepartment/);
assert.doesNotMatch(dbSrc, /fingerprintResearchInput/);

console.log("PASS submitter teams (18), legacy preserve, Slack login UI, canAccessIdea wired");
