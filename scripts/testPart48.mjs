import assert from "node:assert/strict";
import { composeProductIdeaText, resolveGst, resolveGstRate, snapGstSlab } from "../lib/gstRate.js";
import { GST_STANDARD_RATES } from "../lib/lockedConstants.js";

const snack = {
  name: "Masala millet namkeen",
  category: "Packaged snacks",
  ideaDescription: "Ready-to-eat extruded millet chips for quick-commerce.",
};

// Part 134 — no keyword classifier. Uncited → plain placeholder (never "Analysed by AI").
const snackDefault = resolveGst(snack);
assert.equal(snackDefault.basis, "default");
assert.equal(snackDefault.gstRatePct, 18);
assert.doesNotMatch(snackDefault.note, /Analysed by AI/i);
assert.match(snackDefault.note, /placeholder|not checked/i);

const snackCited = resolveGst({
  ...snack,
  aiProposal: { gstRatePct: 18, source: "https://cbic.gov.in/gst", asOf: "2025-09-22" },
});
assert.equal(snackCited.basis, "ai-estimate");
assert.equal(snackCited.gstRatePct, 18);
assert.match(snackCited.note, /AI estimate from a web search/i);
assert.match(snackCited.note, /override/i);

const snackFinance = resolveGst({
  ...snack,
  table: [{ categoryKeywords: ["namkeen", "snack"], rate: 5, effectiveFrom: "2025-09-22", source: "Finance" }],
});
assert.equal(snackFinance.basis, "finance-table");
assert.equal(snackFinance.gstRatePct, 5);
assert.equal(snackFinance.needsConfirmation, false);

// Legacy resolveGstRate wrapper still returns gstBasis / gstKind.
const legacy = resolveGstRate({ ...snack, aiRate: 12, aiBasis: "old note without URL" });
assert.equal(legacy.gstKind, "default");
assert.doesNotMatch(legacy.gstBasis, /Analysed by AI/i);

assert.ok(GST_STANDARD_RATES.includes(0));
assert.ok(GST_STANDARD_RATES.includes(18));
assert.equal(snapGstSlab(17), 18);

assert.match(composeProductIdeaText(snack), /Masala millet namkeen/);
assert.match(composeProductIdeaText(snack), /Packaged snacks/);

console.log("PASS Part 48 GST honesty (finance → cited AI → placeholder)");
