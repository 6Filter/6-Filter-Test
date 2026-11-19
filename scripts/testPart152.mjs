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
check("no Adjust cost and margin button; cost and margin always visible", () => {
  assert.doesNotMatch(form, /data-testid="adjust-cost-margin"/);
  assert.doesNotMatch(form, />\s*Adjust cost and margin\s*</);
  assert.match(form, /const costAdjustVisible = true;/);
});
check("Screened tile no longer prints the GO / NO-GO / WATCH breakdown", () => {
  assert.doesNotMatch(log, /NO-GO\} NO-GO|\} GO · /);
});
check("Required badge is not rendered", () => {
  assert.match(badge, /if \(role === "required"\) return null;/);
});
console.log(`PASS Part 152 (${n} checks)`);
