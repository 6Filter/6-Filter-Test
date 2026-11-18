/**
 * Part 149 — the input form in two columns. Source-level checks (jsdom cannot evaluate container queries
 * or layout; real measurements: scripts/measureFormLayout.mjs against a running build).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cssStart = form.indexOf("export const PROP_CSS");
assert.ok(cssStart > 0, "PROP_CSS exported");
const css = form.slice(cssStart);
const compact = (s) => s.replace(/\s+/g, " ");

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

check("contract names exist in the markup", () => {
  assert.match(form, /className="form-wrap" data-testid="form-wrap"/);
  assert.match(form, /className="form-layout" data-testid="form-layout"/);
  assert.match(form, /data-card="start"/);
  assert.match(form, /data-card=\{spec\.key\}/);
  assert.match(form, /className="prop-grid card-grid"/);
  assert.match(form, /className="f4-grid"/);
  assert.match(form, /data-f4-card/);
  assert.match(form, /className="f4c-body"/);
  assert.match(form, /data-testid="submit-bar"/);
});

check("cards stay in DOM step order (start before the filters, filters mapped in order)", () => {
  assert.ok(form.indexOf('data-card="start"') < form.indexOf("data-card={spec.key}"));
});

check("form-wrap is the container with width:100%; form-layout is the grid inside it", () => {
  assert.match(css, /\.form-wrap\{container-type:inline-size;container-name:formwrap;width:100%/);
  assert.match(css, /@container formwrap \(min-width:940px\)\{\s*\.form-layout\{display:grid/);
});

check("D129 placement", () => {
  const c = compact(css);
  assert.match(c, /\[data-card="start"\]\{grid-column:1;grid-row:1;\}/);
  assert.match(c, /\[data-card="f1"\]\{grid-column:2;grid-row:1 \/ span 3;\}/);
  assert.match(c, /\[data-card="f2"\]\{grid-column:1;grid-row:2;\}/);
  assert.match(c, /\[data-card="f3"\]\{grid-column:1;grid-row:3;\}/);
  assert.match(c, /\[data-card="f4"\]\{grid-column:1 \/ -1;grid-row:4;\}/);
  assert.match(c, /\[data-card="f5"\]\{grid-column:1;grid-row:5;\}/);
  assert.match(c, /\[data-card="f6"\]\{grid-column:2;grid-row:5;\}/);
});

check("D130 short boxes pair up at 460px (card container); old viewport rule is gone", () => {
  assert.match(css, /@container card \(min-width:460px\)\{\s*\.prop-form-page \.card-grid\{grid-template-columns:repeat\(2,/);
  assert.doesNotMatch(css, /@media \(max-width:1099px\)\{\s*\.prop-form-page \.prop-grid/);
});

check("D131 Filter 4: 4+3 at 900px, body two columns at 460px, 84px view box", () => {
  const c = compact(css);
  assert.match(c, /@container card \(min-width:900px\)\{ \.f4-grid\{[^}]*grid-template-rows:repeat\(4,auto\);grid-auto-flow:column/);
  assert.match(c, /\[data-f4-card\]\{container-type:inline-size;container-name:f4c/);
  assert.match(c, /@container f4c \(min-width:460px\)\{ \.f4c-body\{grid-template-columns:repeat\(2,/);
  assert.match(c, /\.f4-your-view textarea\{height:84px;min-height:84px;resize:vertical;\}/);
});

check("D132 room under the last card comes from --sticky-bar-h", () => {
  assert.match(css, /padding:20px 24px calc\(var\(--sticky-bar-h, 64px\) \+ 16px\)/);
  assert.match(form, /--sticky-bar-h/);
  assert.match(form, /new ResizeObserver\(apply\)/);
});

check("D133 default open state is one constant", () => {
  assert.match(form, /const DEFAULT_FILTER_OPEN = \{ f2: false, f3: false, f4: false \};/);
  assert.match(form, /useState\(\(\) => \(\{ \.\.\.DEFAULT_FILTER_OPEN \}\)\)/);
});

check("useCallback is imported", () => {
  assert.match(form, /import \{[^}]*\buseCallback\b[^}]*\} from "react"/);
});

console.log(`testFormLayout149: ${checks} checks passed`);
