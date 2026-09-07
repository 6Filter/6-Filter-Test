import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const log = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const status = readFileSync(new URL("../lib/logStatus.js", import.meta.url), "utf8");

assert.match(form, /gonogo-scale-chip/);
assert.match(form, /ideaSizeFromF5/);
assert.match(form, /sizeTier\.derivation/);
assert.doesNotMatch(app, /ideaWeight \? ` · \$\{ideaWeight\}`/);
assert.doesNotMatch(app, /sc-fin-label">Classification/);
assert.doesNotMatch(app, /\{ideaWeight \|\| "—"\}/);

assert.match(html, /min-height:\s*100%/);
assert.match(html, /height:\s*auto/);
assert.doesNotMatch(html, /html, body, #root \{ height: 100%; margin: 0; background: #F5F2EA; \}/);
assert.match(html, /background:\s*transparent/);

assert.match(app, /min-height:100vh/);
assert.match(app, /html:has\(\.screen-log\)/);
assert.match(form, /align-items:start/);
assert.match(form, /height:auto/);
assert.match(form, /\.prop-page\.output-page\{[^}]*max-width:none/);
assert.match(form, /\.prop-page\.prop-form-page\{[^}]*margin:0 -28px -48px/);

assert.match(log, /background:var\(--bg\)/);
assert.match(log, /border-spacing:0/);
assert.match(log, /h\.division \|\| h\.submitterDepartment/);
assert.match(status, /dept: doc\.division \|\| doc\.submitterDepartment/);

console.log("PASS Part 71 gram badge removed, shared cream canvas fixed, Log department binding documented");
