import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

check("What was assessed heading", () => {
  assert.match(src, /What was assessed/);
});

check("Retry control", () => {
  assert.match(src, />\s*Retry\s*</);
});

check("Use as written control", () => {
  assert.match(src, /Use as written/);
});

check("Evaluate is primary AI control", () => {
  assert.match(src, /output-btn-primary[^>]*[\s\S]*Evaluate/);
  const runMissingButton = />\s*Run missing steps\s*</.test(src);
  assert.equal(runMissingButton, false, "Run missing steps must not be a button label");
});

console.log(`PASS testWhatWasAssessedUi (${checks} checks)`);
