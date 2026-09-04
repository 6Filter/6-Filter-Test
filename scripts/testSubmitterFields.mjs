import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROPOSITION_TOP_FIELDS,
  hasSubmitterIdentity,
  mergeProposition,
  normalizeSubmitterDepartment,
} from "../lib/propositionFields.js";
import { researchHashFor } from "../lib/researchCache.js";

assert.equal(PROPOSITION_TOP_FIELDS[0].key, "submitterName");
assert.equal(PROPOSITION_TOP_FIELDS[1].key, "submitterDepartment");
assert.deepEqual(
  PROPOSITION_TOP_FIELDS[1].options.filter((o) => o.v).map((o) => o.v),
  ["R&D", "NPD", "CIA", "Marketing"]
);

assert.equal(normalizeSubmitterDepartment("Marketing"), "Marketing");
assert.equal(normalizeSubmitterDepartment("finance"), "");
assert.equal(hasSubmitterIdentity({ submitterName: "Asha", submitterDepartment: "NPD" }), true);
assert.equal(hasSubmitterIdentity({ submitterName: "Asha", submitterDepartment: "Sales" }), false);
assert.equal(hasSubmitterIdentity({ submitterName: "", submitterDepartment: "CIA" }), false);

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

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /hasSubmitterIdentity/);
assert.match(formSrc, /Enter your name and select your department before Submit/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /hasSubmitterIdentity\(payload\)/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /h\.submitterName/);
assert.match(appSrc, /h\.submitterDepartment/);
assert.match(appSrc, /formatLogDate\(h\.updatedAt \|\| h\.createdAt\)/);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /submitter_name/);
assert.match(dbSrc, /submitter_department/);
assert.doesNotMatch(dbSrc, /fingerprintResearchInput/);

console.log("PASS submitter name and department are required, logged, and off the research path");
