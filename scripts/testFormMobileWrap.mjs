/**
 * Part 143 author test — on a phone-width viewport the heading, badge and plus wrap
 * without horizontal overflow (CSS rules + mounted badge wrap).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import { loadFieldRoleUi } from "./_fieldLabelsHarness.mjs";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

await check("CSS: label and badge wrap; plus full-width under 760px", () => {
  assert.match(form, /\.prop-label\{[^}]*flex-wrap:wrap/s);
  assert.match(form, /@media \(max-width:760px\)/);
  assert.match(form, /\.field-role\{[^}]*flex:1 1 100%/s);
  assert.match(form, /\.benefit-add\{width:100%;\}/);
  assert.match(form, /@media \(max-width:1099px\)/);
});

await check("mounted badge wraps under a narrow heading without fixed nowrap on the wrap", async () => {
  const ui = await loadFieldRoleUi();
  const { h, mount, window } = ui;
  window.innerWidth = 360;
  const doc = emptyPropositionDoc("m");
  const m = await mount(
    h(
      "div",
      { className: "prop-label", style: { width: "320px", display: "flex", flexWrap: "wrap" } },
      h("span", null, "Declared attribute"),
      h(ui.mod.FieldRoleBadge, { path: "f1.declaredAttribute2", doc })
    )
  );
  const wrap = m.host.querySelector(".field-role");
  const badge = m.host.querySelector(".field-role-badge");
  assert.ok(wrap && badge);
  const wrapStyle = window.getComputedStyle(wrap);
  assert.notEqual(wrapStyle.whiteSpace, "nowrap");
  assert.ok(badge.getBoundingClientRect().width <= 320);
  await m.unmount();
});

await check("benefit plus button text is present for wrap layout", () => {
  assert.match(form, /benefit-add/);
  assert.match(form, /\+ Add another benefit/);
});

console.log(`PASS testFormMobileWrap — ${checks} checks`);
process.exit(0);
