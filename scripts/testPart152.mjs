import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const form = readFileSync("src/PropositionForm.jsx", "utf8");
const log = readFileSync("src/LogPage.jsx", "utf8");
const badge = readFileSync("src/FieldRoleBadge.jsx", "utf8");
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  ok", n, "-", name); };
check("no 'not checked yet' placeholder and no empty Web check panel on Filter 4", () => {
  assert.doesNotMatch(form, /not checked yet/);
  assert.match(form, /showWebCheck \? \(/);
  assert.match(form, /\{webRating \? \(/);
});
check("Punch list 2.5 — cost and margin sit behind one Adjust cost and margin button again", () => {
  assert.match(form, /data-testid="adjust-cost-margin"/);
  assert.doesNotMatch(form, /const costAdjustVisible = true;/);
});
check("Screened tile no longer prints the GO / NO-GO / WATCH breakdown", () => {
  assert.doesNotMatch(log, /NO-GO\} NO-GO|\} GO · /);
});
check("Required chips are not shown; Optional chips still render", () => {
  assert.match(badge, /role !== "optional"\) return null/);
  assert.match(badge, /field-role-badge/);
});
console.log(`PASS Part 152 (${n} checks)`);
