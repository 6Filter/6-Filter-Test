import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");

assert.match(dbSrc, /export async function countPropositions\(/);
assert.match(
  dbSrc,
  /Math\.min\(2000, Math\.max\(1, Math\.floor\(Number\(limit\)\)\)\)/,
  "listPropositions ceiling must be 2000"
);
assert.doesNotMatch(dbSrc, /Math\.min\(200, Math\.max\(1, Math\.floor\(Number\(limit\)\)\)\)/);

assert.match(apiSrc, /Math\.min\(2000, Math\.floor\(n\)\)/);
assert.doesNotMatch(apiSrc, /Math\.min\(200, Math\.floor\(n\)\)/);
assert.match(apiSrc, /\[primus\/propositions\] total in table:/);
assert.match(apiSrc, /sendJson\(res, 200, \{ propositions, total \}\)/);

assert.match(appSrc, /fetchPropositionList\(2000\)/);
assert.doesNotMatch(appSrc, /fetchPropositionList\(100\)/);
assert.match(appSrc, /propositionListTotal/);
assert.match(appSrc, /tableTotal=\{propositionListTotal\}/);
assert.match(logSrc, /still stored and are not in this list or its Excel export/);

assert.match(dbSrc, /DELETE FROM propositions RETURNING id/);
assert.match(
  dbSrc,
  /DELETE FROM propositions\s+WHERE research_run_at IS NULL/
);
assert.doesNotMatch(
  dbSrc,
  /DELETE FROM propositions[\s\S]{0,220}LIMIT/,
  "deleteAll / deleteUntouchedDrafts must not inherit the list cap"
);

console.log("Part 81: list cap is 2000; delete-all and untouched-draft cleanup stay unscoped.");
