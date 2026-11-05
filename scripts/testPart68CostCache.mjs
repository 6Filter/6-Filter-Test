import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF3 } from "../lib/filterChecks.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import {
  assembleMarginElasticity,
  normalizeCategoryAvgPrice,
} from "../lib/filters/runMarginElasticityResearch.js";
import {
  buildResearchFindings,
  cachedCostEstimateFrom,
  costEstimateFromResearch,
  f2SuggestionsFromCostEstimate,
  hasCachedCostEstimate,
  logCostEstimateCache,
} from "../lib/researchFindings.js";
import { researchHashFor } from "../lib/researchCache.js";

const costResearch = {
  estimatedCogsPerUnitInr: 42,
  estimatedNetMarginPct: 38,
  estimatedGstRatePct: 18,
  gstBasis: "Analysed by AI: personal-care stick at 18%.",
  estimatedGrammage: "50g",
  qcomTrajectory: "Take-rates rise toward 25%.",
  competitorPriceInr: 199,
  competitorPackSize: "50g",
  estimatedMrpInr: 103.25,
  sources: [{ title: "Shelf", url: "https://example.com" }],
};

const findingsA = buildResearchFindings({
  filter1: { benchmarkName: "Phitku", estimatedBenchmarkExists: true, categoryTamCr: 10 },
  filter4: {},
  costResearch,
});
const findingsB = buildResearchFindings({
  filter1: { benchmarkName: "Phitku", estimatedBenchmarkExists: true, categoryTamCr: 10 },
  filter4: {},
  costResearch,
});

assert.ok(findingsA.f2?.costEstimate, "research findings must store the F2 cost estimate");
assert.deepEqual(findingsA.f2.costEstimate, findingsB.f2.costEstimate);
assert.equal(findingsA.f2.costEstimate.grammage, "50g");
assert.equal(findingsA.f2.costEstimate.cogsAtScale, 42);
assert.equal(
  findingsA.f2.costEstimate.netMarginAtScale,
  null,
  "Part 134 — cost step never fills net margin (proposer types it)"
);
assert.equal(findingsA.f2.costEstimate.gstRatePct, 18);

const withoutCost = buildResearchFindings({
  filter1: { benchmarkName: "Phitku", estimatedBenchmarkExists: true },
});
assert.equal(withoutCost.f2.costEstimate, null, "no cost research → no invented estimate");

const cached = {
  researchFindings: findingsA,
  suggestions: { top: { category: "Deodorants" } },
};
assert.equal(hasCachedCostEstimate(cached), true);
assert.equal(cachedCostEstimateFrom(cached).grammage, "50g");
assert.equal(hasCachedCostEstimate({ researchFindings: { f1: {}, f3: {} }, suggestions: { top: {} } }), false);

const sug = f2SuggestionsFromCostEstimate(findingsA.f2.costEstimate);
assert.equal(sug.grammage, "50g");
assert.equal(sug.cogsAtScale, 42);
assert.equal(sug.netMarginAtScale, undefined);
assert.deepEqual(sug, f2SuggestionsFromCostEstimate(costEstimateFromResearch(costResearch)));

const legacySugOnly = {
  suggestions: { f2: { grammage: "100ml", cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18 } },
};
assert.equal(hasCachedCostEstimate(legacySugOnly), true, "legacy suggestions.f2 still counts as cached cost");
assert.equal(cachedCostEstimateFrom(legacySugOnly).grammage, "100ml");

const logs = [];
const orig = console.log;
console.log = (...args) => logs.push(args.join(" "));
try {
  logCostEstimateCache("abc", { grammage: "50g" });
  logCostEstimateCache("abc", null);
} finally {
  console.log = orig;
}
assert.match(logs[0], /\[primus\/cost-estimate\] hash=abc cached=true grammage=50g/);
assert.match(logs[1], /\[primus\/cost-estimate\] hash=abc cached=false grammage=REGENERATING/);

const sameInput = {
  name: "Indus Valley herbal deodorant stick",
  category: "Deodorants",
  ideaDescription: "Alcohol-free herbal deodorant stick with alum and vetiver.",
  division: "Personal Care",
  f1: { benchmark: "Phitku", declaredAttribute: "24-hour odour control" },
  f2: { cogsAtScale: 42, netMarginAtScale: 52, gstRatePct: 18, grammage: "50g" },
};
assert.equal(researchHashFor(sameInput), researchHashFor({ ...sameInput, f2: { ...sameInput.f2 } }));
assert.notEqual(
  researchHashFor(sameInput),
  researchHashFor({ ...sameInput, f1: { ...sameInput.f1, benchmark: "Nivea" } }),
  "a different benchmark must bust the cache and trigger fresh research"
);
assert.notEqual(
  researchHashFor(sameInput),
  researchHashFor({ ...sameInput, f1: { ...sameInput.f1, declaredAttribute: "skin-care hybrid" } }),
  "a different declared attribute must bust the cache"
);

const pack = { avgPriceInr: 199, packSizeFound: "50g" };
const norm50 = normalizeCategoryAvgPrice({ ...pack, grammage: "50g" });
const norm50b = normalizeCategoryAvgPrice({ ...pack, grammage: "50g" });
const norm100 = normalizeCategoryAvgPrice({ ...pack, grammage: "100g" });
assert.equal(norm50.normalizedAvgPriceInr, norm50b.normalizedAvgPriceInr);
assert.notEqual(norm50.normalizedAvgPriceInr, norm100.normalizedAvgPriceInr);

const elasticityA = assembleMarginElasticity({
  cogsAtScale: 42,
  netMarginAtScale: 52,
  minMarginPct: 50,
  categoryAvgPrice: { ...norm50, sourceTier: 3 },
  inflation: { ratePct: 6.14, volumeLossPct: 6.5 },
  grammage: "50g",
  mrpInr: 103.25,
});
const elasticityB = assembleMarginElasticity({
  cogsAtScale: 42,
  netMarginAtScale: 52,
  minMarginPct: 50,
  categoryAvgPrice: { ...norm50, sourceTier: 3 },
  inflation: { ratePct: 6.14, volumeLossPct: 6.5 },
  grammage: "50g",
  mrpInr: 103.25,
});
assert.equal(elasticityA.maxMrpInr, elasticityB.maxMrpInr);
assert.equal(elasticityA.minMrpInr, elasticityB.minMrpInr);

const f2 = { cogsAtScale: 42, netMarginAtScale: 52, gstRatePct: 18, grammage: "50g", mrpInr: 103.25 };
const f3A = checkF3(f2, { marginElasticity: elasticityA });
const f3B = checkF3(f2, { marginElasticity: elasticityB });
assert.equal(f3A.checkLabel, f3B.checkLabel);
const checksA = { f3: f3A };
const checksB = { f3: f3B };
const scoreA = scoreAdvisoryChecks(checksA);
const scoreB = scoreAdvisoryChecks(checksB);
const classA = computeGoNoGo(checksA);
const classB = computeGoNoGo(checksB);

console.log(
  `[primus/determinism-check] run1.grammage=${f2.grammage} run2.grammage=${f2.grammage} match=${f2.grammage === f2.grammage}`
);
console.log(
  `[primus/determinism-check] run1.maxMrpInr=${elasticityA.maxMrpInr} run2.maxMrpInr=${elasticityB.maxMrpInr} match=${elasticityA.maxMrpInr === elasticityB.maxMrpInr}`
);
console.log(
  `[primus/determinism-check] run1.score=${scoreA.pct} run2.score=${scoreB.pct} match=${scoreA.pct === scoreB.pct}`
);
console.log(
  `[primus/determinism-check] run1.classification=${classA} run2.classification=${classB} match=${classA === classB}`
);

assert.equal(elasticityA.maxMrpInr, elasticityB.maxMrpInr);
assert.equal(scoreA.pct, scoreB.pct);
assert.equal(classA, classB);

const findingsSrc = readFileSync(new URL("../lib/researchFindings.js", import.meta.url), "utf8");
assert.match(findingsSrc, /costEstimateFromResearch/);
assert.match(findingsSrc, /\[primus\/cost-estimate\] hash=/);

const firstPassSrc = readFileSync(new URL("../lib/propositionAiFirstPass.js", import.meta.url), "utf8");
assert.match(firstPassSrc, /getResearchCache/);
assert.match(firstPassSrc, /hasCachedCostEstimate/);
assert.match(firstPassSrc, /costResearch/);
assert.match(firstPassSrc, /fromCache: true/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /hasCachedCostEstimate\(cached\)/);
assert.match(apiSrc, /logCostEstimateCache/);
assert.match(apiSrc, /"grammage"/);
assert.match(apiSrc, /current\.researchRunAt/);
assert.match(apiSrc, /forceFresh: forceResearch/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /initial\?\.researchRunAt \|\| docRef\.current\?\.researchRunAt/);
assert.match(formSrc, /Grammage \/ COGS \/ margin: same empty-field guard/);
// Part 124: AI suggestion chips stay visible on auto-filled fields (including grammage).
assert.match(formSrc, /grammage/);
assert.doesNotMatch(formSrc, /f2AutoKeys/);

console.log("PASS Part 68 cost-estimate cache + grammage/MRP/score/classification determinism");
