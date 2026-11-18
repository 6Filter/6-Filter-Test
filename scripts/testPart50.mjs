import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

assert.match(src, /className="gonogo-result-page"/);
assert.match(src, /className="prop-page output-page"/);
assert.match(src, /<main className="prop-page prop-form-page" data-view="propositionForm"(?:\s+data-form-zoom=\{formZoom\})?>/);

const tokenBlock = src.slice(src.indexOf(".output-page{"), src.indexOf(".proof-panel"));
assert.match(tokenBlock, /--c-bg-page:#faf3e8/);
assert.match(tokenBlock, /--path-panel-bg:var\(--card-bg\)/);
assert.match(tokenBlock, /--ink:var\(--c-text\)/);
assert.match(tokenBlock, /--pass:var\(--c-go\)/);
assert.match(tokenBlock, /--fail:var\(--c-nogo\)/);
assert.match(tokenBlock, /--watch:var\(--c-watch\)/);
assert.match(tokenBlock, /--nogo-bg:rgba\(168,67,43,\.1\)/);
assert.match(tokenBlock, /--btn-primary:var\(--c-accent\)/);
assert.match(tokenBlock, /font-family:'Sora'/);
assert.match(tokenBlock, /IBM Plex Mono/);
assert.doesNotMatch(tokenBlock, /--hero-go/);
assert.doesNotMatch(tokenBlock, /Plus Jakarta Sans/);

assert.doesNotMatch(src, /<main className="prop-page output-page" data-view="propositionForm">/);
assert.match(src, /View entered inputs/);
assert.match(src, /View GO\/NO-GO output/);
assert.match(src, /preferOutputView|_preferOutput/);
assert.match(src, /What to do next/);
assert.match(src, /Closest path to GO/);
assert.match(src, /\{classification\}/);
assert.match(src, /resolveOutputScore/);
assert.match(src, /className="gonogo-idea"/);
assert.match(src, /\{idea\}/);
assert.match(src, /className="gonogo-scale-chip idea-size-badge"/);
assert.match(src, /ideaSizeForResult|ideaSizeFromF5/);
assert.match(src, /sizeTier\.derivation/);

console.log("PASS Part 50 output-page tokens are scoped to GoNoGoResultPage");
