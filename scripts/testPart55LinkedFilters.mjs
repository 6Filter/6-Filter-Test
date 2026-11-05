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

assert.match(RESEARCH_SCHEMA_VERSION, /f1-benchmark/);

// Part 133 — attributes earn credit only with Evidence Source read + relevant (not category-key validation).
const missingEvidence = checkF1(
  {
    declaredAttribute: "Sparkle finish",
    declaredAttribute2: "Hair strengthening",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  {}
);
const attrMissing = missingEvidence.items.find((i) => i.slot === "attributes");
assert.equal(attrMissing.status, "pending");
assert.match(attrMissing.text, /Evidence Source|Upload/i);

const evidenceOk = checkF1(
  {
    declaredAttribute: "less hair fall after oiling",
    declaredAttribute2: "cooling feel that lasts",
    declaredAttribute3: "ayurvedic herb story",
    benchmark: "Parachute",
    declaredGap: 2.5,
    gapDerivation: "Beat on hair-fall",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "households",
    evidenceSourceDate: "https://example.com/study",
  },
  {
    assessments: {
      benchmark: {
        raw: { relevance: "strong", source_url: "https://example.com/parachute" },
        returnedSources: ["https://example.com/parachute"],
      },
      attributes: { raw: { relevance: "strong", specific: true }, returnedSources: [] },
      derivation: {
        raw: {
          relevance: "strong",
          specific: true,
          supported: true,
          source_url: "https://example.com/parachute",
          quote: "hair-fall",
        },
        returnedSources: ["https://example.com/parachute"],
      },
      argument: {
        raw: {
          relevance: "strong",
          specific: true,
          supported: true,
          source_url: "https://example.com/parachute",
          quote: "households",
        },
        returnedSources: ["https://example.com/parachute"],
      },
      route: { raw: { matches: "yes", confidence: "high", expected: "penetration" }, returnedSources: [] },
    },
    benchmarkCheck: { status: "relevant", source_url: "https://example.com/parachute" },
    routeCheck: { expected: "penetration", confidence: "high" },
  },
  {
    evidenceRead: {
      status: "ok",
      relevant: true,
      facts: [{ topic: "attribute", verified: true, quote: "hair-fall" }],
    },
  }
);
assert.equal(evidenceOk.items.find((i) => i.slot === "attributes").status, "done");
assert.equal(evidenceOk.items.find((i) => i.slot === "benchmark").status, "done");

const unread = checkF1(
  {
    declaredAttribute: "Hair strengthening",
    declaredAttribute2: "Non-sticky feel",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
    evidenceSourceDate: "https://example.com/study",
  },
  {}
);
assert.equal(unread.items.find((i) => i.slot === "attributes").status, "pending");
assert.match(unread.items.find((i) => i.slot === "attributes").text, /Submit so it can be read|not yet read|awaiting/i);

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
assert.ok(Math.abs(band.minMrpInr - 450) < 0.01, `min should be max(floor 200, 500×0.9)=450, got ${band.minMrpInr}`);
assert.ok(Math.abs(band.maxMrpInr - 550) < 0.01, `max should be 500×1.1=550, got ${band.maxMrpInr}`);
assert.ok(band.elasticityDownPct > 0);
assert.ok(band.elasticityUpPct > 0);
assert.ok(Math.abs(band.recommendedMrpInr - 500) < 0.01, "₹500 is the centre of 450–550");

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
assert.match(formSrc, /f2Cogs, f2Margin, f2Gst/);
assert.match(formSrc, /deriveMrp|applyDerivedMrpToF2|derived\.mrp/);
assert.match(formSrc, /recastMarginElasticityLive/);
assert.match(formSrc, /f2Cogs, f2Margin, f2Gst, f3SuggestedRange/);

const f2Src = readFileSync(new URL("../lib/filters/runCostEstimate.js", import.meta.url), "utf8");
assert.match(f2Src, /qcomTrajectory/);
assert.match(f2Src, /competitorPriceInr/);
assert.match(f2Src, /categoryPcc/);

const f4Src = readFileSync(new URL("../lib/categoryIntelligence/runFormatTrend.js", import.meta.url), "utf8");
assert.match(f4Src, /quick-commerce/);
assert.match(f4Src, /category-intelligence/);

console.log("PASS Part 55 category skill loaded; attributes validated; F2 MRP centres F3 band");
