/**
 * Form view size: compact by default, with Comfortable/Large zoom controls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

assert.match(form, /FORM_ZOOM_KEY/);
assert.match(form, /data-form-zoom=\{formZoom\}/);
assert.match(form, /data-testid=\{`form-zoom-\$\{level\}`\}/);
assert.match(form, /data-testid="form-zoom-in"/);
assert.match(form, /data-testid="form-zoom-out"/);
assert.match(form, /Compact|Comfortable|Large/);
assert.match(form, /\[data-form-zoom="compact"\]/);
assert.match(form, /\[data-form-zoom="large"\]/);
assert.match(form, /return "compact"/);
assert.match(form, /--h-input:34px/);
assert.match(form, /--fs-section:16px/);
// Comfortable / D88 base tokens remain for zoom-up.
assert.match(form, /--h-input:44px/);
assert.match(form, /--fs-section:22px/);

console.log("PASS testFormZoom");
