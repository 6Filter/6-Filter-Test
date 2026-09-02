import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");

assert.match(src, /className="output-page gonogo-result-page"/);
assert.match(src, /className="prop-page output-page"/);
assert.match(src, /<main className="prop-page" data-view="propositionForm">/);

const tokenBlock = src.slice(src.indexOf(".output-page{"), src.indexOf(".proof-panel"));
assert.match(tokenBlock, /--bg:#0B1B2A/);
assert.match(tokenBlock, /--card:#12283C/);
assert.match(tokenBlock, /--ink:#F0EEE7/);
assert.match(tokenBlock, /--pass:#63C08D/);
assert.match(tokenBlock, /--fail:#F08A7A/);
assert.match(tokenBlock, /--watch:#E3B25C/);
assert.match(tokenBlock, /--hero-go:#14513A/);
assert.match(tokenBlock, /--hero-nogo:#5C2320/);
assert.match(tokenBlock, /--hero-watch:#5C4A20/);
assert.match(tokenBlock, /\.gonogo-hero\.tone-pass\{background:var\(--hero-go\)/);
assert.match(tokenBlock, /\.gonogo-hero\.tone-fail\{background:var\(--hero-nogo\)/);
assert.match(tokenBlock, /\.gonogo-hero\.tone-watch\{background:var\(--hero-watch\)/);
assert.match(tokenBlock, /\.gonogo-classification\{color:var\(--ink\)/);
assert.match(tokenBlock, /font-family:'Plus Jakarta Sans'/);
assert.match(tokenBlock, /font-family:'IBM Plex Mono'/);

const heroGoHits = [...src.matchAll(/--hero-go/g)];
const heroNogoHits = [...src.matchAll(/--hero-nogo/g)];
const heroWatchHits = [...src.matchAll(/--hero-watch/g)];
assert.equal(heroGoHits.length, 2, "token define + one usage");
assert.equal(heroNogoHits.length, 2, "token define + one usage");
assert.equal(heroWatchHits.length, 2, "token define + one usage");
assert.doesNotMatch(src, /<main className="prop-page output-page" data-view="propositionForm">/);

assert.match(src, /Back to filters/);
assert.match(src, /What's holding this back/);
assert.match(src, /Filter analysis/);
assert.match(src, /\{score\.pct\}%/);
assert.match(src, /\{result\.classification\}/);
assert.match(src, /className="gonogo-scale"/);
assert.match(src, /Category: \{categoryName\}/);
assert.match(src, /Continue to upload market-research proof and unlock Filters 5–6\./);

console.log("PASS Part 50 output-page 1B tokens are scoped to GoNoGoResultPage");
