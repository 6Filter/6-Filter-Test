import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

assert.match(src, /className="gonogo-result-page"/);
assert.match(src, /className="prop-page output-page"/);
assert.match(src, /<main className="prop-page prop-form-page" data-view="propositionForm">/);

const tokenBlock = src.slice(src.indexOf(".output-page{"), src.indexOf(".proof-panel"));
assert.match(tokenBlock, /--bg:#0d0715/);
assert.match(tokenBlock, /--path-panel-bg:#151f2c/);
assert.match(tokenBlock, /--ink:#efe8fb/);
assert.match(tokenBlock, /--pass:#7ee0a8/);
assert.match(tokenBlock, /--fail:#ff8a6b/);
assert.match(tokenBlock, /--watch:#f0c14b/);
assert.match(tokenBlock, /--nogo-bg:#4d1f1f/);
assert.match(tokenBlock, /--btn-primary:#5a2ea6/);
assert.match(tokenBlock, /font-family:'Space Grotesk'/);
assert.match(tokenBlock, /JetBrains Mono/);
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
