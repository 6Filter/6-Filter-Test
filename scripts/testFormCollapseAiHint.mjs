/**
 * Form UX: F2–F4 collapsible; AI-fill fields marked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

check("Before you submit and still-to-enter list are gone from the form", () => {
  assert.doesNotMatch(form, /<BeforeYouSubmit\b/);
  assert.doesNotMatch(form, /Still to enter before a full score/);
});

check("Filters 2–4 are collapsible with an arrow toggle", () => {
  assert.match(form, /filterOpen/);
  assert.match(form, /f2: false, f3: false, f4: false/);
  assert.match(form, /ChevronDown|ChevronRight/);
  assert.match(form, /is-collapsible/);
  assert.match(form, /data-filter-open/);
  assert.match(form, /spec\.key === "f2" \|\| spec\.key === "f3" \|\| spec\.key === "f4"/);
});

check("AI fills this badge and lavender highlight are wired", () => {
  assert.match(form, /AI_FILLS_KEYS/);
  assert.match(form, /fieldAiFills/);
  assert.match(form, /ai-fills-badge/);
  assert.match(form, /is-ai-expected/);
  assert.match(form, /AI fills this/);
  assert.match(form, /cogsAtScale/);
  assert.match(form, /techShiftRisk/);
});

console.log(`PASS testFormCollapseAiHint — ${checks} checks`);
process.exit(0);
