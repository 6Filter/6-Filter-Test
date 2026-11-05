import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const adminSrc = readFileSync(new URL("../lib/adminApi.js", import.meta.url), "utf8");

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

check("Evaluate button on evaluation pending page", () => {
  assert.match(formSrc, /EvaluationPendingPage[\s\S]*output-btn-primary[\s\S]*Evaluate/);
});

check("Recompute without AI (admin) copy", () => {
  assert.match(formSrc, /Recompute without AI \(admin\)/);
});

check("Run missing steps button label removed from EvaluationPendingPage", () => {
  const start = formSrc.indexOf("function EvaluationPendingPage");
  const end = formSrc.indexOf("function GoNoGoResultPage", start);
  assert.ok(start >= 0 && end > start);
  const block = formSrc.slice(start, end);
  assert.doesNotMatch(block, />\s*Run missing steps\s*</);
});

check("handlePropositionRescore requires ADMIN", () => {
  assert.match(adminSrc, /handlePropositionRescore[\s\S]*requireAdminRole/);
});

console.log(`PASS testEvaluateOnlyAiControl (${checks} checks)`);
