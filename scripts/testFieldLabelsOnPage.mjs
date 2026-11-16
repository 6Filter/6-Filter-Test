/**
 * Part 143 E — labels on the page (replaces the seven-label Part 139 version).
 * Legend gone, one badge per box, owner examples, one-number card, Submit bar.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  displayRole,
  displayRoleKey,
  submitBarMessageTwoLabels,
} from "../lib/fieldRoleDisplay.js";
import { formFieldPaths } from "../lib/fieldRoles.js";
import { firstMissingRequiredField } from "../lib/propositionsApi.js";
import { SIX_FILTERS_FORM, emptyPropositionDoc } from "../lib/propositionFields.js";
import { loadFieldRoleUi } from "./_fieldLabelsHarness.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const form = read("../src/PropositionForm.jsx");
const badgeSrc = read("../src/FieldRoleBadge.jsx");

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

const fcStart = form.indexOf("\nfunction FieldControl(");
assert.ok(fcStart > 0, "FieldControl found");
const fcEnd = form.indexOf("\nfunction ", fcStart + 10);
const fieldControl = form.slice(fcStart, fcEnd > 0 ? fcEnd : undefined);

await check("every prop-label in FieldControl carries a FieldRoleBadge", () => {
  const lines = fieldControl.split("\n");
  const labelLines = lines.map((l, i) => (/className="prop-label"/.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.ok(labelLines.length >= 6, `branches (${labelLines.length})`);
  for (const i of labelLines) {
    const near = lines.slice(i, i + 14).join("\n");
    assert.match(
      near,
      /<FieldRoleBadge path=(?:\{fieldPath\}|"f2\.mrpOverride") doc=\{ideaDoc\} \/>/,
      `badge near line ${i}`
    );
  }
  const cb = fieldControl.indexOf('if (field.type === "checkbox")');
  assert.match(fieldControl.slice(cb, cb + 900), /<FieldRoleBadge path=\{fieldPath\} doc=\{ideaDoc\} \/>/);
});

await check("MRP override tick has data-field and its own badge", () => {
  assert.match(fieldControl, /data-field="f2\.mrpOverride"/);
  assert.match(fieldControl, /<FieldRoleBadge path="f2\.mrpOverride" doc=\{ideaDoc\} \/>/);
});

await check("label points at the box by id; headings use data-field-label", () => {
  assert.match(fieldControl, /<label className="prop-field-inner" htmlFor=\{inputId\}>/);
  assert.match(fieldControl, /data-field-label=\{fieldPath \|\| undefined\}/);
  const ids = fieldControl.match(/id=\{inputId\}/g) || [];
  assert.ok(ids.length >= 3, "select, textarea and input carry the id");
});

await check("every visible control has data-field", () => {
  assert.match(form, /fieldPath=\{`\$\{spec\.key\}\.\$\{field\.key\}`\}/);
  for (const key of ["name", "category", "ideaDescription"]) {
    assert.match(form, new RegExp(`data-field="${key}"`), `hero ${key}`);
    assert.match(form, new RegExp(`<FieldRoleBadge path="${key}" doc=\\{doc\\} />`), `badge for ${key}`);
    assert.match(form, new RegExp(`htmlFor="fld-${key}"`), `label for ${key}`);
  }
  assert.match(form, /data-field="submitterDepartment"/);
  assert.match(form, /<FieldRoleBadge path="submitterDepartment" doc=\{doc\} \/>/);
});

await check("legend is gone from the form and Spec page", () => {
  assert.doesNotMatch(form, /<FieldRoleLegend\s*\/>/);
  assert.doesNotMatch(read("../src/SpecPage.jsx"), /FieldRoleLegend/);
  assert.doesNotMatch(badgeSrc, /What the labels mean/);
  assert.doesNotMatch(badgeSrc, /data-testid="field-role-legend"/);
});

const ui = await loadFieldRoleUi();
const { h, mount } = ui;
const { FieldRoleBadge } = ui.mod;
const doc = emptyPropositionDoc("x");

await check("a badge renders for EVERY form box as Required or Optional only", async () => {
  const paths = formFieldPaths();
  assert.equal(paths.length, 40);
  for (const path of paths) {
    const m = await mount(h(FieldRoleBadge, { path, doc }));
    const badge = m.host.querySelector(`span.field-role-badge[data-role-for="${path}"]`);
    assert.ok(badge, `badge for ${path}`);
    const want = displayRole(path, doc);
    assert.equal(badge.textContent, want, `label text for ${path}`);
    assert.ok(want === "Required" || want === "Optional");
    assert.equal(badge.getAttribute("data-role"), displayRoleKey(path, doc));
    await m.unmount();
  }
});

await check("owner examples: attribute 1 Required; attribute 2 Optional; New market makes Benchmark Optional", () => {
  assert.equal(displayRole("f1.declaredAttribute", doc), "Required");
  assert.equal(displayRole("f1.declaredAttribute2", doc), "Optional");
  assert.equal(displayRole("f2.mrpInr", doc), "Optional");
  const nm = { ...doc, f1: { ...doc.f1, growthRoute: "new-market" } };
  assert.equal(displayRole("f1.benchmark", nm), "Optional");
});

await check("Before-you-submit card is removed from the input form", () => {
  assert.doesNotMatch(form, /<BeforeYouSubmit\b/);
  assert.doesNotMatch(form, /Still to enter before a full score/);
  // Component still exists for unit use; card export keeps one-number shape.
  assert.match(badgeSrc, /data-count="required-empty"/);
  assert.doesNotMatch(badgeSrc, /data-count="scored-empty"/);
});

await check("submit bar uses submitBarMessageTwoLabels(doc)", () => {
  assert.match(form, /\{submitBarMessageTwoLabels\(doc\)\}/);
  assert.match(form, /className="progress-track"/);
  const empty = submitBarMessageTwoLabels(emptyPropositionDoc("x"));
  assert.match(empty, /required boxes left before you can submit:/);
  assert.match(empty, /Your name/);
});

await check("F5 computed revenue still has a badge", () => {
  const f5 = SIX_FILTERS_FORM.find((s) => s.key === "f5");
  assert.ok(f5.fields.some((f) => f.key === "computedRevenue" && f.type === "computed"));
  assert.match(form, /<FieldRoleBadge path=\{`\$\{spec\.key\}\.\$\{field\.key\}`\} doc=\{doc\} \/>/);
});

await check("Submit with a blank name is still refused by the server rule", () => {
  assert.deepEqual(firstMissingRequiredField({ name: " ", category: "x", ideaDescription: "y" }), {
    field: "name",
    label: "Idea name",
  });
});

await check("benefit plus is wired in Filter 1", () => {
  assert.match(form, /data-testid="add-another-benefit"/);
  assert.match(form, /benefitExtra/);
});

await check("type tokens live on .prop-form-page", () => {
  assert.match(form, /--fs-label:16px/);
  assert.match(form, /--c-label:#f6eefb/);
  assert.match(form, /--h-input:44px/);
});

await check("no seven-role words on badges", () => {
  assert.doesNotMatch(badgeSrc, /Needed for a verdict|Not in the score|Filled by AI|Changes the checks/);
});

console.log(`PASS testFieldLabelsOnPage — ${checks} checks`);
process.exit(0);
