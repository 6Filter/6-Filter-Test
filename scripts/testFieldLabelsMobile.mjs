/**
 * Part 143 — mobile wrap for the two-label badge (replaces Part 139 legend/? tests).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayRole } from "../lib/fieldRoleDisplay.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import { loadFieldRoleUi } from "./_fieldLabelsHarness.mjs";

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

const ui = await loadFieldRoleUi();
const { FieldRoleBadge, BeforeYouSubmit, FIELD_ROLE_CSS } = ui.mod;
const { h, mount, window } = ui;
const doc = emptyPropositionDoc("x");
const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const spec = readFileSync(new URL("../src/SpecPage.jsx", import.meta.url), "utf8");

await check("CSS wraps badge under the label on small screens", () => {
  assert.match(FIELD_ROLE_CSS, /\.field-role\{[^}]*flex-wrap:wrap/);
  assert.match(FIELD_ROLE_CSS, /\.field-role-badge\{[^}]*white-space:normal/);
  assert.match(FIELD_ROLE_CSS, /@media \(max-width:\d+px\)\{[^@]*\.field-role\{[^}]*flex:1 1 100%/);
  assert.doesNotMatch(FIELD_ROLE_CSS, /font-size:0|color:transparent/);
});

await check("the form and the spec page both ship the shared CSS", () => {
  assert.match(form, /\$\{FIELD_ROLE_CSS\}/);
  assert.match(spec, /<style>\{FIELD_ROLE_CSS\}<\/style>/);
});

await check("Part 152 Required boxes carry no badge; Optional boxes show the word Optional", async () => {
  const req = await mount(h(FieldRoleBadge, { path: "f1.declaredGap", doc }));
  assert.equal(req.host.querySelector('[data-role-for="f1.declaredGap"]'), null, "no Required badge");
  assert.equal(req.host.textContent.trim(), "");
  await req.unmount();
  const m = await mount(h(FieldRoleBadge, { path: "f1.declaredAttribute2", doc }));
  const badge = m.host.querySelector('[data-role-for="f1.declaredAttribute2"]');
  assert.ok(badge, "Optional badge rendered");
  assert.equal(badge.className, "field-role-badge");
  assert.equal(badge.getAttribute("data-role"), "optional");
  assert.equal(badge.textContent, displayRole("f1.declaredAttribute2", doc));
  assert.equal(m.host.querySelector("button.field-role-toggle"), null);
  assert.equal(m.host.querySelector(".field-role-note"), null);
  await m.unmount();
});

await check("New market makes Benchmark Optional on the badge", async () => {
  const nm = { ...doc, f1: { ...doc.f1, growthRoute: "new-market" } };
  const m = await mount(h(FieldRoleBadge, { path: "f1.benchmark", doc: nm }));
  assert.equal(m.host.querySelector(".field-role-badge").textContent, "Optional");
  assert.equal(m.host.querySelector(".field-role-badge").getAttribute("data-role"), "optional");
  await m.unmount();
});

await check("BeforeYouSubmit component still mounts one count (form no longer shows it)", async () => {
  window.innerWidth = 360;
  assert.doesNotMatch(form, /<BeforeYouSubmit\b/);
  const m = await mount(h(BeforeYouSubmit, { doc }));
  assert.ok(m.host.querySelector('[data-count="required-empty"]'));
  assert.match(FIELD_ROLE_CSS, /\.before-you-submit-one\{[^}]*flex-wrap:wrap/);
  await m.unmount();
});

await check("form CSS: benefit plus and labels wrap on phone", () => {
  assert.match(form, /@media \(max-width:760px\)/);
  assert.match(form, /\.benefit-add\{width:100%;\}/);
  assert.match(form, /\.prop-label\{[^}]*flex-wrap:wrap/s);
});

console.log(`PASS testFieldLabelsMobile — ${checks} checks`);
process.exit(0);
