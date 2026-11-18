/**
 * Part 143 B/C/D86–D87 — no helper lines at rest, no brackets in headings,
 * placeholders, benefit plus (16 intent checks; source + field defs).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM } from "../lib/propositionFields.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const form = read("../src/PropositionForm.jsx");
const badge = read("../src/FieldRoleBadge.jsx");

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

check("D1 legend and ? toggle are gone from the form and badge UI", () => {
  assert.doesNotMatch(form, /<FieldRoleLegend\s*\/>/);
  assert.doesNotMatch(badge, /What the labels mean/);
  assert.doesNotMatch(badge, /field-role-help|role-note|ROLE_MEANING/);
  assert.doesNotMatch(badge, /primus\.fieldRoleLegendCollapsed/);
});

check("D2 FieldControl does not render static prop-helper under boxes", () => {
  const fcStart = form.indexOf("\nfunction FieldControl(");
  const fcEnd = form.indexOf("\nfunction ", fcStart + 10);
  const fieldControl = form.slice(fcStart, fcEnd > 0 ? fcEnd : undefined);
  assert.doesNotMatch(fieldControl, /className="prop-helper"/);
  assert.match(fieldControl, /const helper = ""/);
});

check("D3 category helper note is not rendered on the form", () => {
  assert.doesNotMatch(form, /FMCG_CATEGORY_LIST_NOTE/);
  assert.doesNotMatch(form, /Starter list of common FMCG/);
});

check("D3b team field-helper static copy is gone", () => {
  assert.doesNotMatch(form, /className="field-helper"/);
  assert.doesNotMatch(form, /Pick the team for this idea/);
});

check("D3c concept-card button is gone (Part 145 D107: one upload)", () => {
  assert.doesNotMatch(form, /Upload concept card/);
  assert.doesNotMatch(form, /Separate from the Filter 1 source-file/);
});

check("D4 every FieldControl / hero heading carries data-field-label", () => {
  assert.match(form, /data-field-label=\{fieldPath \|\| undefined\}/);
  for (const key of ["name", "category", "ideaDescription"]) {
    assert.match(form, new RegExp(`data-field-label="${key}"`), key);
  }
  assert.match(form, /data-field-label="f2\.mrpOverride"/);
});

check("D5 headings have no bracketed hints or (optional)", () => {
  for (const f of PROPOSITION_TOP_FIELDS) {
    assert.doesNotMatch(f.label, /\([^)]*\)/);
  }
  for (const spec of SIX_FILTERS_FORM) {
    for (const f of spec.fields) {
      assert.doesNotMatch(f.label, /\(optional\)/i, f.key);
      assert.doesNotMatch(f.label, /\(consumer language\)/i, f.key);
    }
  }
});

check("D6 every text/number/textarea box has a placeholder ≥ 10 chars", () => {
  const need = ["text", "number", "textarea", "price-resilience", "derived-mrp"];
  for (const spec of SIX_FILTERS_FORM) {
    for (const f of spec.fields) {
      if (!need.includes(f.type)) continue;
      const ph = String(f.placeholder || "");
      assert.ok(ph.length >= 10, `${spec.key}.${f.key} placeholder="${ph}"`);
    }
  }
  const price = SIX_FILTERS_FORM.find((s) => s.key === "f3").fields.find(
    (f) => f.key === "plannedAnnualIncreasePct"
  );
  assert.ok(price.placeholder.length >= 10, "P1 price-rise placeholder");
});

check("D7 GST HSN sentence is focus-only (gstFocusHint), not a resting helper", () => {
  assert.match(form, /gstFocusHint && gstFocused/);
  const gst = SIX_FILTERS_FORM.find((s) => s.key === "f2").fields.find((f) => f.key === "gstRatePct");
  assert.ok(gst.gstFocusHint);
});

check("A1 Filter 1 starts with one benefit and a plus", () => {
  assert.match(form, /benefitExtra/);
  assert.match(form, /\+ Add another benefit/);
  assert.match(form, /data-testid="add-another-benefit"/);
});

check("A2 benefit keys stay declaredAttribute / 2 / 3", () => {
  const f1 = SIX_FILTERS_FORM.find((s) => s.key === "f1").fields.map((f) => f.key);
  assert.deepEqual(
    f1.filter((k) => k.startsWith("declaredAttribute")),
    ["declaredAttribute", "declaredAttribute2", "declaredAttribute3"]
  );
});

check("A3 stored benefit 2/3 always show (has2/has3 gates)", () => {
  assert.match(form, /declaredAttribute2 \|\| ""/);
  assert.match(form, /declaredAttribute3 \|\| ""/);
  assert.match(form, /has2 \|\| has3 \|\| benefitExtra >= 1/);
  assert.match(form, /has3 \|\| benefitExtra >= 2/);
});

check("A4 after three benefits there is no plus", () => {
  assert.match(form, /setBenefitExtra\(2\)/);
  assert.match(form, /Math\.min\(2,/);
});

check("A5 only Required and Optional badges", () => {
  assert.match(badge, /displayRole/);
  assert.match(badge, /data-role=\{role\}/);
  assert.doesNotMatch(badge, /ROLE_LABEL\.(scored|needed|filled)/);
});

check("A6 F4/F5/F6 static prop-helper captions are not resting lines", () => {
  assert.doesNotMatch(form, /Rate all seven points/);
  assert.doesNotMatch(form, /className="prop-helper">\{evidenceF5F6Note\}/);
  assert.match(form, /className="autofill-status">\{evidenceF5F6Note\}/);
});

check("Submit bar uses submitBarMessageTwoLabels; BeforeYouSubmit removed from form", () => {
  assert.match(form, /submitBarMessageTwoLabels\(doc\)/);
  assert.doesNotMatch(form, /<BeforeYouSubmit\b/);
  assert.doesNotMatch(badge, /data-count="required-left"/);
  assert.doesNotMatch(badge, /data-count="scored-empty"/);
});

console.log(`PASS testFormDeclutter — ${checks} checks`);
process.exit(0);
