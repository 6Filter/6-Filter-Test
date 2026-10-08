import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

assert.match(dbSrc, /export async function countPropositions\(/);
assert.match(dbSrc, /LIST_PROPOSITIONS_CAP/);
assert.match(
  dbSrc,
  /Math\.min\(LIST_PROPOSITIONS_CAP, Math\.max\(1, Math\.floor\(Number\(limit\)\)\)\)/,
  "listPropositions ceiling must use LIST_PROPOSITIONS_CAP"
);
assert.doesNotMatch(dbSrc, /Math\.min\(200, Math\.max\(1, Math\.floor\(Number\(limit\)\)\)\)/);

assert.match(apiSrc, /LIST_PROPOSITIONS_CAP/);
assert.match(apiSrc, /Math\.min\(LIST_PROPOSITIONS_CAP, Math\.floor\(n\)\)/);
assert.doesNotMatch(apiSrc, /Math\.min\(200, Math\.floor\(n\)\)/);
assert.match(apiSrc, /\[primus\/propositions\] total in table:/);

assert.match(appSrc, /fetchPropositionList\(LIST_PROPOSITIONS_CAP\)/);
assert.doesNotMatch(appSrc, /fetchPropositionList\(100\)/);

assert.match(dbSrc, /DELETE FROM propositions WHERE submitter_department = \$1 RETURNING id/);
assert.match(
  dbSrc,
  /DELETE FROM propositions\s+WHERE research_run_at IS NULL/
);
assert.match(apiSrc, /deleteAllPropositions\(null, "Master"\)/);
assert.match(apiSrc, /canDeleteLogProposition/);
assert.doesNotMatch(
  dbSrc,
  /DELETE FROM propositions[\s\S]{0,220}LIMIT/,
  "deleteAll / deleteUntouchedDrafts must not inherit the list cap"
);

console.log("Part 81: list cap is 2000; Log deletes require Master unlock.");
