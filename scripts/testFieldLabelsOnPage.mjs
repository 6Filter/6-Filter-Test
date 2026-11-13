/**
 * Part 139 B–F — the labels are on the page.
 *
 * NOTE: the owner's attached testFieldLabelsOnPage.mjs was not provided, so this is our own version.
 * A full jsdom mount of PropositionForm (auth, fetch, router, 5,000 lines) is too heavy, so this is:
 *   - strong source assertions on src/PropositionForm.jsx / SpecPage.jsx for data-field, data-role-for,
 *     the legend, the Before-you-submit counts and the submit bar,
 *   - real jsdom renders of the extracted components (FieldRoleBadge, BeforeYouSubmit) for EVERY form box,
 *   - unit tests of the checklist / submitBarMessage / Path-to-GO helpers,
 *   - the server's 400 on a blank name at Submit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROLE_LABEL,
  ROLE_MEANING,
  annotatePathActions,
  formFieldPaths,
  optionalPathHint,
  pathActionFieldPath,
  roleLabel,
  roleMeaning,
  submitBarMessage,
  submitChecklist,
} from "../lib/fieldRoles.js";
import { firstMissingRequiredField } from "../lib/propositionsApi.js";
import { SIX_FILTERS_FORM, emptyPropositionDoc } from "../lib/propositionFields.js";
import { loadFieldRoleUi } from "./_fieldLabelsHarness.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const form = read("../src/PropositionForm.jsx");
const spec = read("../src/SpecPage.jsx");

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

// The body of FieldControl: from its declaration to the next top-level declaration.
const fcStart = form.indexOf("\nfunction FieldControl(");
assert.ok(fcStart > 0, "FieldControl found");
const fcEnd = form.indexOf("\nfunction ", fcStart + 10);
const fieldControl = form.slice(fcStart, fcEnd > 0 ? fcEnd : undefined);

await check("every prop-label in FieldControl carries a FieldRoleBadge (all branches)", () => {
  const lines = fieldControl.split("\n");
  const labelLines = lines.map((l, i) => (/className="prop-label"/.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.ok(labelLines.length >= 6, `computed-risk, derived-mrp, price-resilience, computed-range, computed, default (${labelLines.length})`);
  for (const i of labelLines) {
    const near = lines.slice(i, i + 12).join("\n");
    assert.match(near, /<FieldRoleBadge path=\{fieldPath\} doc=\{ideaDoc\} \/>/, `badge near line ${i}`);
  }
  // The checkbox branch has no .prop-label but still gets the badge.
  const cb = fieldControl.indexOf('if (field.type === "checkbox")');
  assert.match(fieldControl.slice(cb, cb + 900), /<FieldRoleBadge path=\{fieldPath\} doc=\{ideaDoc\} \/>/);
});

await check("the badge is a sibling of the box, not its label (label points at the box by id)", () => {
  assert.match(fieldControl, /<label className="prop-field-inner" htmlFor=\{inputId\}>/);
  const ids = fieldControl.match(/id=\{inputId\}/g) || [];
  assert.ok(ids.length >= 3, "select, textarea and input carry the id");
});

await check("every visible control has data-field", () => {
  // Filter boxes: FieldControl is always given fieldPath, and every control branch sets data-field.
  assert.match(form, /fieldPath=\{`\$\{spec\.key\}\.\$\{field\.key\}`\}/);
  const dataFieldCount = (fieldControl.match(/data-field=\{fieldPath \|\| undefined\}/g) || []).length;
  assert.ok(dataFieldCount >= 10, `data-field on each control branch (${dataFieldCount})`);
  // submitterName goes through FieldControl with its path.
  assert.match(form, /fieldPath="submitterName"/);
  // Hero inputs, team select, F5 computed revenue.
  for (const key of ["name", "category", "ideaDescription"]) {
    assert.match(form, new RegExp(`data-field="${key}"`), `hero ${key}`);
    assert.match(form, new RegExp(`<FieldRoleBadge path="${key}" doc=\\{doc\\} />`), `badge for ${key}`);
    assert.match(form, new RegExp(`htmlFor="fld-${key}"`), `label for ${key}`);
  }
  assert.match(form, /data-field="submitterDepartment"/);
  assert.match(form, /<FieldRoleBadge path="submitterDepartment" doc=\{doc\} \/>/);
  assert.match(form, /data-field=\{`\$\{spec\.key\}\.\$\{field\.key\}`\}/, "F5 computed revenue block");
  assert.match(form, /<FieldRoleBadge path=\{`\$\{spec\.key\}\.\$\{field\.key\}`\} doc=\{doc\} \/>/);
  const f5 = SIX_FILTERS_FORM.find((s) => s.key === "f5");
  assert.ok(f5.fields.some((f) => f.key === "computedRevenue" && f.type === "computed"));
});

const ui = await loadFieldRoleUi();
const { h, mount } = ui;
const { FieldRoleBadge, BeforeYouSubmit } = ui.mod;
const doc = emptyPropositionDoc("x");

await check("a badge renders for EVERY form box, with the role words and data-role-for", async () => {
  const paths = formFieldPaths();
  assert.equal(paths.length, 40);
  for (const path of paths) {
    const m = await mount(h(FieldRoleBadge, { path, doc }));
    const badge = m.host.querySelector(`span.field-role-badge[data-role-for="${path}"]`);
    assert.ok(badge, `badge for ${path}`);
    assert.equal(badge.textContent, roleLabel(path, doc), `label text for ${path}`);
    assert.ok(Object.values(ROLE_LABEL).includes(badge.textContent), `${path} shows a ROLE_LABEL word`);
    assert.equal(badge.getAttribute("title"), roleMeaning(path, doc));
    assert.ok(Object.values(ROLE_MEANING).includes(badge.getAttribute("aria-description")));
    await m.unmount();
  }
});

await check("legend sits at the top of the form (after the identity strip) and on the spec page", () => {
  assert.match(form, /import \{[^}]*FieldRoleLegend[^}]*\} from "\.\/FieldRoleBadge\.jsx"/);
  const strip = form.indexOf('aria-label="Submitter"');
  const legend = form.indexOf("<FieldRoleLegend />");
  const hero = form.indexOf('id="the-proposition"');
  assert.ok(strip > 0 && legend > strip && legend < hero, "identity strip < legend < hero");
  assert.match(spec, /import \{[^}]*FieldRoleLegend[^}]*\} from "\.\/FieldRoleBadge\.jsx"/);
  assert.match(spec, /<FieldRoleLegend \/>/);
  const badge = read("../src/FieldRoleBadge.jsx");
  assert.match(badge, /data-testid="field-role-legend"/);
  assert.match(badge, /What the labels mean/);
  assert.match(badge, /primus\.fieldRoleLegendCollapsed/);
  assert.match(badge, /ROLE_KEYS\.map/);
});

await check("Before-you-submit card is mounted in the form with live doc state", () => {
  assert.match(form, /<BeforeYouSubmit doc=\{doc\} \/>/);
  const card = form.indexOf("<BeforeYouSubmit");
  const bar = form.indexOf('className="submit-bar"');
  const grid = form.indexOf("SIX_FILTERS_FORM.map((spec)");
  assert.ok(grid < card && card < bar, "filter grid < card < submit bar");
  const badge = read("../src/FieldRoleBadge.jsx");
  for (const k of ["required-left", "scored-empty", "verdict-empty"]) assert.match(badge, new RegExp(`data-count="${k}"`));
  assert.match(badge, /Before you submit/);
  assert.match(badge, /submitChecklist\(doc\)/);
  assert.match(badge, /skippableSummary/);
});

await check("Before-you-submit counts follow the doc as it is filled in", async () => {
  const filled = structuredClone(doc);
  const m = await mount(h(BeforeYouSubmit, { doc: filled }));
  const read1 = () => ({
    req: Number(m.host.querySelector('[data-count="required-left"]').textContent),
    scored: Number(m.host.querySelector('[data-count="scored-empty"]').textContent),
    verdict: Number(m.host.querySelector('[data-count="verdict-empty"]').textContent),
  });
  const c = submitChecklist(filled);
  assert.deepEqual(read1(), { req: c.requiredLeftCount, scored: c.scoredEmptyCount, verdict: c.verdictEmptyCount });
  await m.unmount();

  const next = { ...filled, name: "Cooling oil", category: "Hair oils", ideaDescription: "An oil", submitterName: "A", submitterDepartment: "Marketing" };
  const m2 = await mount(h(BeforeYouSubmit, { doc: next }));
  assert.equal(m2.host.querySelector('[data-count="required-left"]').textContent, String(submitChecklist(next).requiredLeftCount));
  assert.ok(submitChecklist(next).requiredLeftCount < c.requiredLeftCount);
  await m2.unmount();
});

await check("submit bar shows submitBarMessage(doc) and keeps progress + Submit", () => {
  assert.match(form, /\{submitBarMessage\(doc\)\}/);
  assert.doesNotMatch(form, /required fields left before you can submit/);
  assert.match(form, /className="progress-track"/);
  assert.match(form, /canSubmit/);
  assert.match(form, /submitProgress\(doc\)/);
  assert.match(form, />\s*\{?.*"Submit for verdict"/s);
  // Wording comes from fieldRoles.
  const empty = submitBarMessage(emptyPropositionDoc("x"));
  assert.match(empty, /^5 required boxes left before you can submit\./);
  assert.match(empty, /needed for a verdict\.$/);
  assert.equal(submitChecklist(doc).requiredLeftCount, 5);
});

await check("What was assessed shows each field's role label", () => {
  const at = form.indexOf('data-testid="what-was-assessed"');
  assert.ok(at > 0);
  const block = form.slice(at, at + 2600);
  assert.match(block, /roleLabel\(entry\.field, doc\)/);
  assert.match(block, /data-role-for=\{entry\.field\}/);
  assert.match(block, /className="field-role-badge"/);
});

await check("Path to GO: optional boxes are not sold as a score gain; leftovers say so in fieldRoles' words", () => {
  assert.equal(optionalPathHint(), ROLE_MEANING.optional);
  assert.match(form, /annotatePathActions\(/);
  assert.match(form, /it\.optionalHint/);
  assert.equal(pathActionFieldPath("F2", "Record quick-commerce terms / take-rate assumption"), "f2.qcomTrajectory");
  assert.equal(pathActionFieldPath("F1", "Add an evidence source"), "f1.evidenceSourceDate");
  assert.equal(pathActionFieldPath("F1", "Name a competitor benchmark brand"), "");

  const rows = [
    { id: "a", filter: "F2", text: "Record quick-commerce terms", gainPct: 0, blocker: false },
    { id: "b", filter: "F2", text: "Record quick-commerce terms", gainPct: 6, blocker: false },
    { id: "c", filter: "F1", text: "Name a competitor benchmark brand", gainPct: 6, blocker: false },
  ];
  const out = annotatePathActions(rows, doc);
  assert.deepEqual(out.map((r) => r.id), ["b", "c"], "gain-less optional row dropped");
  assert.equal(out[0].optionalHint, ROLE_MEANING.optional);
  assert.equal(out[1].optionalHint, undefined);
  // The scoring file stays byte-identical: this is a UI-side helper.
  assert.doesNotMatch(read("../lib/improvementPoints.js"), /fieldRoles/);
});

await check("Submit with a blank name is refused by the server rule (400 path)", () => {
  assert.deepEqual(firstMissingRequiredField({ name: " ", category: "x", ideaDescription: "y" }), {
    field: "name",
    label: "Idea name",
  });
  const api = read("../lib/propositionsApi.js");
  const at = api.indexOf("firstMissingRequiredField(payload, opened)");
  assert.ok(at > 0);
  assert.match(api.slice(at, at + 260), /sendJson\(res, 400,/);
  assert.match(api.slice(at, at + 260), /is required before Submit/);
  // The form marks the same boxes Required, so the card and the server agree.
  for (const f of ["name", "category", "ideaDescription"]) assert.equal(roleLabel(f, doc), ROLE_LABEL.required);
});

console.log(`PASS testFieldLabelsOnPage — ${checks} checks`);
process.exit(0);
