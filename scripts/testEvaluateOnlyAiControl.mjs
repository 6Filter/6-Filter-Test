import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const adminSrc = readFileSync(new URL("../lib/adminApi.js", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");

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

check("Evaluate from pending skips the native confirm and sends confirmMissingSteps", () => {
  assert.match(formSrc, /fromPending: true, skipConfirm: true/);
  assert.match(
    formSrc,
    /if \(repairing && !fromPending && !window\.confirm\(missingStepsCostPreview/
  );
  assert.match(formSrc, /confirmMissingSteps: repairing \|\| fromPending/);
});

check("Pending Evaluate shows save/research errors", () => {
  const start = formSrc.indexOf("function EvaluationPendingPage");
  const end = formSrc.indexOf("function GoNoGoResultPage", start);
  const block = formSrc.slice(start, end);
  assert.match(block, /data-testid="evaluate-error"/);
});

check("priceEvents retry maps to Filter 3, not Filter 2", () => {
  assert.match(formSrc, /if \(s === "priceEvents"\) return "f3"/);
  assert.match(formSrc, /if \(s === "cogsGst"\) return "f2"/);
});

check("Submit/Evaluate wait long enough for Filter 3", () => {
  assert.match(appSrc, /PROPOSITION_SAVE_TIMEOUT_MS = 600000/);
  assert.match(appSrc, /needsConfirm: Boolean\(data\.needsConfirm\)/);
  assert.match(
    appSrc,
    /Research is still running on the server\. Wait a minute, then click Evaluate again to seal the score\./
  );
});

check("retry-step seals when research completes", () => {
  assert.match(
    apiSrc,
    /handlePropositionRetryStep[\s\S]*withAdvisory\(saved, \{\s*attachGate: true/
  );
});

check("handlePropositionRescore requires ADMIN", () => {
  assert.match(adminSrc, /handlePropositionRescore[\s\S]*requireAdminRole/);
});

console.log(`PASS testEvaluateOnlyAiControl (${checks} checks)`);
