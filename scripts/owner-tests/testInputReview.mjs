/**
 * Part 132 — deterministic input review (pure). Attached owner suite when present;
 * this lock mirrors the acceptance rules until that file lands untouched.
 */
import assert from "node:assert/strict";
import { reviewInputs, titleCaseName } from "../../lib/inputReview.js";
import {
  DECLARED_GAP_MAX,
  GST_STANDARD_RATES,
  IDEA_DESCRIPTION_MIN_CHARS,
  INVALID_INPUTS_BLOCK_SUBMIT,
} from "../../lib/lockedConstants.js";

assert.equal(INVALID_INPUTS_BLOCK_SUBMIT, true);
assert.ok(GST_STANDARD_RATES.includes(18));
assert.equal(DECLARED_GAP_MAX, 10);
assert.equal(IDEA_DESCRIPTION_MIN_CHARS, 15);

assert.equal(titleCaseName("DOVE SCALP SERUM 100 ML"), "Dove Scalp Serum 100 ml");
assert.equal(titleCaseName("dOVE SCALP SERUM"), "Dove Scalp Serum");

const realNames = [
  "Dove Scalp Serum",
  "Parachute Advansed",
  "Indulekha Bringha",
  "Maaza mango fruit drink",
  "Amul Sugar free lassi",
  "Clinic Plus",
  "Sunsilk Hair Fall Solution",
  "Himalaya Neem Face Wash",
  "Lifebuoy Total",
  "Horlicks Classic Malt",
];
for (const name of realNames) {
  const r = reviewInputs({
    name: "Hair growth serum for Indian women",
    category: "Hair serums",
    ideaDescription: "A leave-in hair growth serum for Indian women with thinning hair.",
    f1: { declaredAttribute: "hair growth", benchmark: name, declaredGap: 3 },
    f2: { gstRatePct: 18, netMarginAtScale: 45, mrpInr: 299, cogsAtScale: 80, grammage: "50 ml" },
  });
  assert.equal(r.blocking, false, `must not flag real product: ${name}`);
  assert.ok(!r.fields.some((f) => f.field === "benchmark" && f.status === "invalid"));
}

{
  const r = reviewInputs({
    name: "zzzz",
    category: "asdfgh",
    ideaDescription: "qwerty",
    f1: { declaredAttribute: "test", benchmark: "asdfgh qwerty", declaredGap: 15 },
    f2: { gstRatePct: 99, netMarginAtScale: 150, mrpInr: 325, cogsAtScale: 900, grammage: "50" },
  });
  assert.equal(r.blocking, true);
  assert.ok(r.fields.some((f) => f.field === "benchmark" && f.status === "invalid"));
  assert.ok(r.fields.some((f) => f.field === "declaredGap" && f.status === "invalid"));
  assert.ok(r.fields.some((f) => f.field === "gstRatePct" && f.status === "invalid"));
  assert.ok(r.fields.some((f) => f.field === "netMarginAtScale" && f.status === "invalid"));
  assert.ok(r.fields.some((f) => f.field === "ideaDescription" && f.status === "invalid"));
}

{
  const r = reviewInputs({
    name: "Hair growth serum",
    category: "Hair serums",
    ideaDescription: "A leave-in serum aimed at Indian women with thinning hair and scalp dryness.",
    f1: { declaredAttribute: "hair growth", benchmark: "dOVE SCALP SERUM", declaredGap: 3 },
    f2: { gstRatePct: 18, netMarginAtScale: 45, mrpInr: 299, cogsAtScale: 80, grammage: "50 ml" },
  });
  assert.equal(r.blocking, false);
  const odd = r.fields.find((f) => f.code === "BENCHMARK_ODD_CAPITALS");
  assert.ok(odd);
  assert.match(odd.suggestion, /Dove Scalp Serum/i);
}

console.log("PASS owner testInputReview");
