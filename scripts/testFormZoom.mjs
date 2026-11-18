/**
 * Form text size. Superseded by Part 146: the three presets (Compact / Comfortable / Large) are replaced by one
 * control, a minus, a percentage and a plus (1% to 100%). 78% keeps today's default look, so nothing changes
 * until a button is pressed. The behaviour tests are testTextSizeControl.mjs and testTextSizeForm.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

for (const gone of [/FORM_ZOOM/, /data-form-zoom/, /form-zoom-/, /View size/, /"comfortable"/]) {
  assert.doesNotMatch(form, gone, String(gone));
}
assert.match(form, /<TextSizeControl\b/);
// The default look is unchanged: the old Compact values are what 78% produces.
assert.match(form, /--h-input:34px/);
assert.match(form, /--fs-section:calc\(16px \* var\(--ts\)\)/);
assert.match(form, /--fs-label:calc\(13px \* var\(--ts\)\)/);
assert.match(form, /--fs-input:calc\(13px \* var\(--ts\)\)/);

console.log("PASS testFormZoom (Part 146: one text size control)");
