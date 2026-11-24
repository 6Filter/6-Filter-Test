import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const form = readFileSync("src/PropositionForm.jsx", "utf8");
const log = readFileSync("src/LogPage.jsx", "utf8");
const badge = readFileSync("src/FieldRoleBadge.jsx", "utf8");
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  ok", n, "-", name); };
check("Filter 4 has one box per point and the web-check suggestion beside it", () => {
  assert.doesNotMatch(form, /not checked yet/);
  assert.match(form, /showWebCheck/);
  assert.match(form, /data-f4-block="web-check"/);
  assert.doesNotMatch(form, /Respond on Medium/);
  assert.match(form, /data-f4-block="your-view"/);
});
check("Punch list 2.5 — cost and margin are on the form, with no Adjust cost and margin button", () => {
  assert.doesNotMatch(form, /data-testid="adjust-cost-margin"/);
  assert.doesNotMatch(form, /Adjust cost and margin/);
});
check("Screened tile no longer prints the GO / NO-GO / WATCH breakdown", () => {
  assert.doesNotMatch(log, /NO-GO\} NO-GO|\} GO · /);
});
check("Required chips are not shown; Optional chips still render", () => {
  assert.match(badge, /role !== "optional"\) return null/);
  assert.match(badge, /field-role-badge/);
});
console.log(`PASS Part 152 (${n} checks)`);
