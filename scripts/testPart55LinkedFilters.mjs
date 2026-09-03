import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1 } from "../lib/filterChecks.js";
import { assembleMarginElasticity, normalizeCategoryAvgPrice } from "../lib/filters/runMarginElasticityResearch.js";
import { loadSixFilterSkill, loadCategoryIntelligenceSkill } from "../lib/skills/loadSkill.js";
import { RESEARCH_SCHEMA_VERSION } from "../lib/researchCache.js";

const categorySkill = loadCategoryIntelligenceSkill();
assert.match(categorySkill, /Category Intelligence Without Syndicated Data/);
assert.match(categorySkill, /per-capita/);
assert.match(categorySkill, /Competitive Analysis|competitor/i);

const six = loadSixFilterSkill();
assert.match(six, /Category Intelligence Without Syndicated Data/);
assert.match(six, /validate the 3 stated USPs/i);

assert.match(RESEARCH_SCHEMA_VERSION, /f1-f3-linked/);

const notCore = checkF1(
  {
    declaredAttribute: "Sparkle finish",
    declaredAttribute2: "Hair strengthening",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  {
    categoryKeyAttributes: ["hair fall control", "fragrance", "non-sticky feel"],
    attributeValidation: [
      { stated: "Sparkle finish", status: "not-core", note: "Not a category purchase driver" },
      { stated: "Hair strengthening", status: "aligned", note: "Maps to hair-fall / strength" },
    ],
  }
);
assert.equal(notCore.items[0].status, "pending");
assert.match(notCore.items[0].text, /hair fall control/);

const aligned = checkF1(
  {
    declaredAttribute: "Hair strengthening",
    declaredAttribute2: "Non-sticky feel",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  {
    categoryKeyAttributes: ["hair strengthening", "non-sticky feel"],
    attributeValidation: [
      { stated: "Hair strengthening", status: "aligned" },
      { stated: "Non-sticky feel", status: "aligned" },
    ],
  }
);
assert.equal(aligned.items[0].status, "done");
assert.match(aligned.items[0].text, /confirms 2/);

const price = normalizeCategoryAvgPrice({
  avgPriceInr: 81.675,
  packSizeFound: "10ml sachet",
  grammage: "100ml",
});
const band = assembleMarginElasticity({
  cogsAtScale: 100,
  netMarginAtScale: 80,
  division: "Personal Care",
  minMarginPct: 50,
  categoryAvgPrice: { ...price, sourceTier: 2, sources: [] },
  inflation: { ratePct: 18.5, volumeLossPct: 18.5, source: "CPI personal care" },
  grammage: "100ml",
  mrpInr: 500,
});
assert.equal(band.minMrpInr, 200);
assert.ok(band.maxMrpInr > 800);
assert.ok(band.elasticityDownPct > 0);
assert.ok(band.elasticityUpPct > 0);
assert.equal(band.recommendedMrpInr != null, true);
assert.ok(Math.abs(band.recommendedMrpInr - 500) < 0.01, "₹500 sits inside 200–898");

const tooLow = assembleMarginElasticity({
  cogsAtScale: 100,
  netMarginAtScale: 80,
  division: "Personal Care",
  minMarginPct: 50,
  categoryAvgPrice: { ...price, sourceTier: 2, sources: [] },
  inflation: { ratePct: 18.5, volumeLossPct: 18.5, source: "CPI" },
  grammage: "100ml",
  mrpInr: 150,
});
assert.ok(tooLow.mrpAdjustmentNote);
assert.ok(tooLow.recommendedMrpInr >= 200);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /mrpAdjustmentNote/);

const f2Src = readFileSync(new URL("../lib/filters/runCostEstimate.js", import.meta.url), "utf8");
assert.match(f2Src, /qcomTrajectory/);
assert.match(f2Src, /competitorPriceInr/);
assert.match(f2Src, /categoryPcc/);

const f4Src = readFileSync(new URL("../lib/categoryIntelligence/runFormatTrend.js", import.meta.url), "utf8");
assert.match(f4Src, /quick-commerce/);
assert.match(f4Src, /category-intelligence/);

console.log("PASS Part 55 category skill loaded; attributes validated; F2 MRP centres F3 band");
