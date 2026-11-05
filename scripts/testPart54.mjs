import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gstRateUnfilled, resolveGst, resolveGstRate } from "../lib/gstRate.js";
import { isMarginElasticityUnfilled } from "../lib/mrpFormula.js";

const hairOil = resolveGst({
  name: "Cooling herbal hair oil",
  category: "Hair care",
  ideaDescription: "A cooling herbal hair oil for daily use",
});
assert.equal(hairOil.gstRatePct, 18, "default placeholder is 18%");
assert.equal(hairOil.basis, "default");
assert.doesNotMatch(hairOil.note, /Analysed by AI/i);
assert.match(hairOil.note, /placeholder|not been checked/i);

const chips = resolveGstRate({
  name: "Masala potato chips",
  category: "Snacks",
  ideaDescription: "Packaged namkeen chips",
  aiProposal: { gstRatePct: 18, source: "https://example.com/gst", asOf: "2025-09-22" },
});
assert.equal(chips.gstRatePct, 18, "cited AI estimate may be 18%");
assert.equal(chips.gstKind, "ai-estimate");
assert.match(chips.gstBasis, /AI estimate from a web search/i);

const atta = resolveGst({
  name: "Fortified atta",
  category: "Staples",
  ideaDescription: "Wheat flour atta for rotis",
  table: [{ categoryKeywords: ["atta", "flour"], rate: 5, effectiveFrom: "2025-09-22", source: "Finance" }],
});
assert.equal(atta.gstRatePct, 5, "Finance table wins for atta");
assert.equal(atta.basis, "finance-table");

assert.equal(gstRateUnfilled(null), true);
assert.equal(gstRateUnfilled(""), true);
assert.equal(gstRateUnfilled(18), false);
assert.equal(gstRateUnfilled("5"), false);

assert.equal(
  isMarginElasticityUnfilled({ minMarginPct: 5, maxMarginPct: 10, minMrpInr: 5, maxMrpInr: 10 }),
  true
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /derived-mrp|deriveMrp/);

console.log("PASS Part 54 GST honesty + margin elasticity unfilled");
