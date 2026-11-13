/**
 * Part 139 B/C/D — the role badge works on a phone: words wrap under the label, and the meaning
 * opens on tap (a real <button>), not on hover. Mounts the real components in jsdom.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_KEYS, ROLE_LABEL, ROLE_MEANING, roleMeaning, submitChecklist } from "../lib/fieldRoles.js";
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
const { FieldRoleBadge, FieldRoleLegend, BeforeYouSubmit, FIELD_ROLE_CSS, FIELD_ROLE_LEGEND_STORAGE_KEY } = ui.mod;
const { h, mount, act, window } = ui;
const doc = emptyPropositionDoc("x");

await check("CSS wraps: flex-wrap on the badge, full-width meaning, under-the-label on small screens", () => {
  assert.match(FIELD_ROLE_CSS, /\.field-role\{[^}]*flex-wrap:wrap/);
  assert.match(FIELD_ROLE_CSS, /\.field-role-badge\{[^}]*white-space:normal/);
  assert.match(FIELD_ROLE_CSS, /\.field-role-note\{[^}]*flex:1 1 100%/);
  assert.match(FIELD_ROLE_CSS, /\.field-role-meaning\{[^}]*flex:1 1 100%/);
  assert.match(FIELD_ROLE_CSS, /@media \(max-width:\d+px\)\{[^@]*\.field-role\{[^}]*flex:1 1 100%/);
  // Tap target is at least 28px, and the legend / card wrap too.
  assert.match(FIELD_ROLE_CSS, /\.field-role-toggle\{[^}]*min-height:28px/);
  assert.match(FIELD_ROLE_CSS, /\.field-role-legend-list li\{[^}]*flex-wrap:wrap/);
  assert.match(FIELD_ROLE_CSS, /\.before-you-submit-counts\{[^}]*flex-wrap:wrap/);
  // Words, not colour alone: no rule hides the text.
  assert.doesNotMatch(FIELD_ROLE_CSS, /font-size:0|color:transparent|display:none/);
});

await check("the form and the spec page both ship the shared CSS", () => {
  const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
  const spec = readFileSync(new URL("../src/SpecPage.jsx", import.meta.url), "utf8");
  assert.match(form, /\$\{FIELD_ROLE_CSS\}/);
  assert.match(spec, /<style>\{FIELD_ROLE_CSS\}<\/style>/);
});

await check("badge shows the role words as visible text with title + aria-description", async () => {
  const m = await mount(h(FieldRoleBadge, { path: "f1.declaredGap", doc }));
  const badge = m.host.querySelector('[data-role-for="f1.declaredGap"]');
  assert.ok(badge, "badge rendered");
  assert.equal(badge.className, "field-role-badge");
  assert.equal(badge.getAttribute("data-role"), "scored");
  assert.equal(badge.textContent, ROLE_LABEL.scored);
  assert.equal(badge.getAttribute("title"), roleMeaning("f1.declaredGap", doc));
  assert.equal(badge.getAttribute("aria-description"), ROLE_MEANING.scored);
  await m.unmount();
});

await check("badge renders nothing for a path with no role", async () => {
  const m = await mount(h(FieldRoleBadge, { path: "f6.forumVerdict", doc }));
  assert.equal(m.host.querySelector(".field-role"), null);
  assert.equal(m.host.textContent, "");
  await m.unmount();
});

await check("tap on the button opens and closes the meaning (not hover-only)", async () => {
  const m = await mount(h(FieldRoleBadge, { path: "f2.cogsAtScale", doc }));
  const btn = m.host.querySelector("button.field-role-toggle");
  assert.ok(btn, "a real <button> is the tap control");
  assert.equal(btn.getAttribute("type"), "button");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.equal(m.host.querySelector(".field-role-meaning"), null);
  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const open = m.host.querySelector(".field-role-meaning");
  assert.ok(open, "meaning opened on tap");
  assert.equal(open.textContent, ROLE_MEANING["needed-for-verdict"]);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(m.host.querySelector(".field-role-meaning"), null);
  await m.unmount();
});

await check("tapping the badge inside a checkbox label does not toggle the checkbox", async () => {
  let changes = 0;
  const m = await mount(
    h(
      "label",
      null,
      h("input", { type: "checkbox", defaultChecked: false, onChange: () => (changes += 1) }),
      h(FieldRoleBadge, { path: "f1.pureCommodity", doc })
    )
  );
  const btn = m.host.querySelector("button.field-role-toggle");
  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(changes, 0);
  assert.equal(m.host.querySelector("input").checked, false);
  assert.ok(m.host.querySelector(".field-role-meaning"));
  await m.unmount();
});

await check("the note shows beside the badge, and follows a New market route", async () => {
  const plain = await mount(h(FieldRoleBadge, { path: "f1.benchmark", doc }));
  assert.equal(plain.host.querySelector(".field-role-badge").textContent, ROLE_LABEL.scored);
  assert.match(plain.host.querySelector(".field-role-note").textContent, /Not needed when your growth route is New market/);
  await plain.unmount();
  const nm = { ...doc, f1: { ...doc.f1, growthRoute: "new-market" } };
  const m = await mount(h(FieldRoleBadge, { path: "f1.benchmark", doc: nm }));
  assert.equal(m.host.querySelector(".field-role-badge").textContent, ROLE_LABEL.optional);
  assert.equal(m.host.querySelector(".field-role-badge").getAttribute("data-role"), "optional");
  assert.match(m.host.querySelector(".field-role-note").textContent, /Not needed — your growth route is New market/);
  await m.unmount();
});

await check("legend lists every role word with its meaning, open on first visit", async () => {
  window.localStorage.clear();
  const m = await mount(h(FieldRoleLegend));
  const details = m.host.querySelector('details[data-testid="field-role-legend"]');
  assert.ok(details);
  assert.ok(details.classList.contains("field-role-legend"));
  assert.equal(details.open, true);
  assert.equal(details.querySelector("summary").textContent, "What the labels mean");
  const items = [...details.querySelectorAll("li[data-role-legend]")];
  assert.deepEqual(items.map((li) => li.getAttribute("data-role-legend")), ROLE_KEYS);
  for (const li of items) {
    const key = li.getAttribute("data-role-legend");
    assert.ok(li.textContent.includes(ROLE_LABEL[key]));
    assert.ok(li.textContent.includes(ROLE_MEANING[key]));
  }
  await m.unmount();
});

await check("legend remembers being collapsed in localStorage", async () => {
  window.localStorage.clear();
  const m = await mount(h(FieldRoleLegend));
  const details = m.host.querySelector("details");
  await act(async () => {
    details.open = false;
    details.dispatchEvent(new window.Event("toggle"));
  });
  assert.equal(window.localStorage.getItem(FIELD_ROLE_LEGEND_STORAGE_KEY), "1");
  assert.equal(FIELD_ROLE_LEGEND_STORAGE_KEY, "primus.fieldRoleLegendCollapsed");
  await m.unmount();

  const again = await mount(h(FieldRoleLegend));
  assert.equal(again.host.querySelector("details").open, false, "stays collapsed next visit");
  await act(async () => {
    const d = again.host.querySelector("details");
    d.open = true;
    d.dispatchEvent(new window.Event("toggle"));
  });
  assert.equal(window.localStorage.getItem(FIELD_ROLE_LEGEND_STORAGE_KEY), null);
  await again.unmount();
});

await check("Before-you-submit card shows live counts and the skippable summary", async () => {
  const m = await mount(h(BeforeYouSubmit, { doc }));
  const card = m.host.querySelector('[data-testid="before-you-submit"]');
  assert.ok(card);
  assert.equal(card.querySelector("h2").textContent, "Before you submit");
  const c = submitChecklist(doc);
  const read = (k) => Number(card.querySelector(`[data-count="${k}"]`).textContent);
  assert.equal(read("required-left"), c.requiredLeftCount);
  assert.equal(read("scored-empty"), c.scoredEmptyCount);
  assert.equal(read("verdict-empty"), c.verdictEmptyCount);
  assert.ok(c.requiredLeftCount > 0 && c.scoredEmptyCount > 0);
  assert.ok(card.textContent.includes(c.skippableSummary));
  await m.unmount();
});

console.log(`PASS testFieldLabelsMobile — ${checks} checks`);
process.exit(0);
