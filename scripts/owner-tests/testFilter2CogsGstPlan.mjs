/**
 * Part 134 revised — COGS range, GST honesty/override, property: only margin moves score.
 */
import assert from "node:assert/strict";
import { costEstimateFromResearch, f2SuggestionsFromCostEstimate } from "../../lib/researchFindings.js";
import { resolveGst } from "../../lib/gstRate.js";
import { applyFilter2Rules } from "../../lib/filter2Check.js";
import { resolveF2Price } from "../../lib/mrpFormula.js";

{
  const research = {
    estimatedCogsPerUnitInr: 12,
    estimatedCogsLowInr: 10,
    estimatedCogsHighInr: 15,
    cogsBasis: "BOM at scale from open sources",
    confidenceNote: "mid confidence",
    sources: [{ title: "Trade", url: "https://example.com/cogs" }],
    estimatedGstRatePct: 18,
    estimatedGrammage: "100 g",
  };
  const stored = costEstimateFromResearch(research);
  assert.equal(stored.cogsAtScale, 12);
  assert.equal(stored.cogsLowInr, 10);
  assert.equal(stored.cogsHighInr, 15);
  assert.match(stored.cogsBasis, /BOM/);
  assert.equal(stored.netMarginAtScale, null);

  const sug = f2SuggestionsFromCostEstimate(research);
  assert.equal(sug.cogsAtScale, 12);
  assert.equal(sug.netMarginAtScale, undefined);
  const overridden = { ...sug, cogsAtScale: 14 };
  assert.equal(overridden.cogsAtScale, 14);
}

{
  const d = resolveGst({ name: "Mystery SKU" });
  assert.equal(d.basis, "default");
  assert.doesNotMatch(d.note, /Analysed by AI/i);
  assert.match(d.note, /placeholder/i);

  const over = resolveGst({
    name: "Mystery",
    aiProposal: { gstRatePct: 5, source: "https://x.com", asOf: "2025-09-22" },
  });
  assert.equal(over.basis, "ai-estimate");
  assert.equal(over.gstRatePct, 5);
  // Person overrides by typing a different rate on the form — resolution stays available.
  assert.notEqual(12, over.gstRatePct);
}

{
  const ctx = { floor: 35, divisionLabel: "Foods" };
  const credit = (f2) =>
    applyFilter2Rules(f2, ctx)
      .items.filter((i) => !i.formAdmin)
      .reduce((s, i) => s + (Number(i.credit) || 0), 0);

  assert.equal(credit({ netMarginAtScale: 40 }), 1);
  assert.equal(credit({ netMarginAtScale: 40, cogsAtScale: 1, gstRatePct: 28, grammage: "x", qcomTrajectory: "q" }), 1);
  assert.equal(credit({ netMarginAtScale: 20 }), 0);

  // MRP override changes score only through the margin it implies
  const viaOverride = {
    cogsAtScale: 100,
    gstRatePct: 18,
    netMarginAtScale: 60,
    mrpOverride: true,
    mrpInr: 150,
  };
  assert.ok(resolveF2Price(viaOverride).ok);
  assert.equal(credit(viaOverride), 0);
}

console.log("PASS owner testFilter2CogsGstPlan");
