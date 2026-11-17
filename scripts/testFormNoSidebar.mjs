import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

assert.doesNotMatch(form, /prop-sidebar/);
assert.doesNotMatch(form, /prop-side-nav/);
assert.doesNotMatch(form, /sidebarNavItems/);
assert.doesNotMatch(form, /label: "The proposition"/);
assert.match(form, /prop-form-shell\{display:block;width:100%;max-width:none;\}/);
assert.match(form, /prop-form-main\{min-width:0;width:100%/);
assert.match(form, /data-testid="sidebar-not-saved"/);
assert.match(form, /Last good save/);

console.log("PASS testFormNoSidebar");
