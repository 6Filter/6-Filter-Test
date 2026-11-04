import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FMCG_CATEGORIES } from "../lib/fmcgCategories.js";
import { resolveCategoryFamily } from "../lib/categoryFamily.js";
import {
  lookupSyndicatedData,
  measureSyndicatedTokenDelta,
  formatUnscopedSyndicatedPrompt,
  formatSyndicatedLookup,
  maxUsesForMatch,
  EXACT_CATEGORY_MATCH_MAX_USES,
} from "../lib/syndicatedLookup.js";
import { buildScopedSearchQuery, scopedSearchInstruction } from "../lib/scopedSearch.js";
import { checkF1, evaluateDeclaredGap, isClaimingNoCompetitor } from "../lib/filterChecks.js";
import { fingerprintNoCompetitor } from "../lib/researchCache.js";

function fatRow(category, family, extra = "") {
  return {
    category,
    categoryFamily: family,
    period: "2025",
    geography: "All-India",
    categoryValueCr: 12000,
    valueGrowthPct: 8.2,
    volumeGrowthPct: 2.1,
    products: Array.from({ length: 8 }, (_, i) => ({
      brand: `${category} Brand ${i + 1} ${extra}`,
      variant: "Flagship",
      pack: "100 g",
      mrpInr: 99 + i,
      gramsOrMl: 100,
      pricePerGram: 0.99,
    })),
  };
}

function kantarRow(category, family) {
  return {
    category,
    categoryFamily: family,
    period: "2025",
    geography: "All-India",
    householdsMn: 80,
    penetrationPct: 40,
    trialRatePct: 12,
    repeatConversionPct: 35,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 75,
  };
}

const nielsenAll = [
  fatRow("Snacks", "Foods", "Haldiram"),
  fatRow("Namkeen", "Foods"),
  fatRow("Chips", "Foods"),
  fatRow("Hair oils", "Personal Care", "Parachute"),
  fatRow("Shampoo", "Personal Care"),
  fatRow("Deodorant", "Personal Care"),
  fatRow("Soap", "Personal Care"),
  fatRow("Detergent", "Home Care"),
  fatRow("Dishwash", "Home Care"),
  fatRow("Juice", "Beverages"),
  fatRow("Tea", "Beverages"),
  fatRow("Milk", "Foods"),
];
const kantarAll = nielsenAll.map((r) => kantarRow(r.category, r.categoryFamily));

for (const cat of FMCG_CATEGORIES) {
  assert.ok(resolveCategoryFamily(cat), `${cat} must resolve to a family`);
}
assert.equal(resolveCategoryFamily("Hair Care"), "Personal Care");
assert.equal(resolveCategoryFamily("Hair Oils"), "Personal Care");
assert.equal(resolveCategoryFamily("Snacks"), "Foods");
assert.equal(resolveCategoryFamily("Spices & Masalas"), "Foods");
assert.equal(resolveCategoryFamily("Detergents"), "Home Care");

const snacks = lookupSyndicatedData(nielsenAll, { category: "Snacks" });
assert.equal(snacks.matchedOn, "category");
assert.equal(snacks.family, "Foods");
assert.ok(snacks.rows.every((r) => r.category === "Snacks"));
assert.equal(
  snacks.rows.some((r) => /hair|shampoo|detergent|juice/i.test(r.category)),
  false,
  "Snacks lookup must not include unrelated categories"
);

const snacksFamily = lookupSyndicatedData(nielsenAll, { category: "Ready-to-cook" });
assert.equal(snacksFamily.matchedOn, "family");
assert.equal(snacksFamily.family, "Foods");
assert.ok(snacksFamily.rows.every((r) => r.categoryFamily === "Foods"));
assert.equal(
  snacksFamily.rows.some((r) => r.categoryFamily === "Personal Care"),
  false
);

const hairCare = lookupSyndicatedData(nielsenAll, { category: "Hair Care" });
assert.equal(hairCare.matchedOn, "family", "Hair Care with no exact row must fall back to Personal Care");
assert.equal(hairCare.family, "Personal Care");
assert.ok(hairCare.rows.every((r) => r.categoryFamily === "Personal Care"));
assert.equal(hairCare.rows.some((r) => r.category === "Snacks"), false);

const none = lookupSyndicatedData(nielsenAll, { category: "Industrial adhesives" });
assert.equal(none.matchedOn, "none");
assert.deepEqual(none.rows, []);

const ideaAsQuery = lookupSyndicatedData(nielsenAll, {
  category: "100ml herbal hair oil vs Parachute for South India snacks aisle",
});
assert.equal(ideaAsQuery.matchedOn, "none", "idea text must not fuzzy-scan the whole file");

const snacksDelta = measureSyndicatedTokenDelta(nielsenAll, kantarAll, "Snacks");
console.log(
  `[part76/tokens] Snacks research syndicated block tokensBefore=${snacksDelta.tokensBefore} ` +
    `tokensAfter=${snacksDelta.tokensAfter} saved=${snacksDelta.tokensSaved} ` +
    `(${Math.round((snacksDelta.tokensSaved / snacksDelta.tokensBefore) * 100)}%) ` +
    `matchedOn nielsen=${snacksDelta.nielsenMatchedOn} kantar=${snacksDelta.kantarMatchedOn}`
);
assert.equal(snacksDelta.nielsenMatchedOn, "category");
assert.ok(snacksDelta.tokensAfter < snacksDelta.tokensBefore, "scoped rows must send fewer tokens than the full file");
assert.ok(snacksDelta.tokensSaved > 500, "reduction must be material, not a rounding wobble");

const unscoped = formatUnscopedSyndicatedPrompt(nielsenAll, kantarAll);
const scoped = formatSyndicatedLookup({
  nielsen: lookupSyndicatedData(nielsenAll, { category: "Snacks" }),
  kantar: lookupSyndicatedData(kantarAll, { category: "Snacks" }),
});
assert.match(unscoped, /Hair oils/);
assert.doesNotMatch(scoped, /Hair oils/);
assert.match(scoped, /Snacks/);

const snacksSearch = buildScopedSearchQuery("Nielsen Kantar category size", "Snacks");
assert.equal(snacksSearch.primary, "Nielsen Kantar category size Snacks category India");
assert.equal(snacksSearch.fallback, "Nielsen Kantar category size Foods category India");
const hairSearch = buildScopedSearchQuery("major brand competitors established", "Hair Care");
assert.match(hairSearch.primary, /Hair Care category India/);
assert.match(hairSearch.fallback, /Personal Care category India/);
assert.match(scopedSearchInstruction("Nielsen size", "Snacks"), /PRIMARY:/);
assert.match(scopedSearchInstruction("Nielsen size", "Snacks"), /FALLBACK/);
assert.match(
  scopedSearchInstruction("Nielsen size", "Hair oils", { brand: "Parachute Advansed" }),
  /BENCHMARK VERIFY.*Parachute Advansed product listing India Hair oils/
);

assert.equal(isClaimingNoCompetitor({ declaredGap: 0 }), true);
assert.equal(isClaimingNoCompetitor({ declaredGap: "", benchmark: "" }), false);
assert.equal(isClaimingNoCompetitor({ declaredGap: 0, benchmark: "none" }), false);
assert.equal(isClaimingNoCompetitor({ declaredGap: 1.5 }), false);
assert.equal(
  isClaimingNoCompetitor({ declaredGap: 0, benchmark: "Parachute Advansed" }),
  false,
  "gap 0 with a typed benchmark is below the floor, not a first-mover claim (Part 133)"
);
assert.equal(
  isClaimingNoCompetitor(
    { declaredGap: 0, benchmark: "Parachute Advansed" },
    { benchmarkVerified: true }
  ),
  false,
  "a verified named competitor with gap 0 must not take the first-mover exception"
);
assert.equal(isClaimingNoCompetitor({ declaredGap: 2.2 }), false);

const novelF1 = {
  declaredAttribute: "enzyme-stable probiotic sachet for ambient dal",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "first-mover in ambient probiotic dal",
};
const firstMover = checkF1(novelF1, {
  noCompetitorCheck: {
    majorCompetitorsFound: [],
    searchSummary: "no established ambient probiotic dal brand found in India retail",
  },
});
const gapDone = firstMover.items.find((it) => it.slot === "gap" && /first-mover/i.test(it.text));
assert.ok(gapDone);
assert.equal(gapDone.status, "done");
assert.notEqual(firstMover.checkLabel, "Below floor");
assert.doesNotMatch(gapDone.text, /Below floor|below the 2\.0 floor/i);

const oneWeakFindings = {
  noCompetitorCheck: {
    majorCompetitorsFound: ["Local Kirana Mix (unbranded)"],
    searchSummary: "one ambiguous regional mix, not a major brand",
  },
};
assert.equal(evaluateDeclaredGap(novelF1, oneWeakFindings).status, "done");
assert.match(evaluateDeclaredGap(novelF1, oneWeakFindings).text, /first-mover/);
const oneWeak = checkF1(novelF1, oneWeakFindings);
assert.notEqual(oneWeak.checkLabel, "Below floor");

const crowded = checkF1(novelF1, {
  noCompetitorCheck: {
    majorCompetitorsFound: ["MTR", "iD Fresh", "ITC Aashirvaad"],
    searchSummary: "ready-to-cook dal kits already on shelf",
  },
});
assert.equal(crowded.checkLabel, "Below floor");
const crowdedGap = crowded.items.find((it) => it.slot === "gap");
assert.equal(crowdedGap.status, "pending");
assert.match(crowdedGap.text, /MTR/);
assert.match(crowdedGap.text, /iD Fresh/);
assert.match(crowdedGap.text, /ITC Aashirvaad/);
assert.doesNotMatch(crowdedGap.text, /first-mover verified|accepted as a verified first-mover/i);

const shortGap = {
  declaredAttribute: "cooling",
  declaredGap: 1.5,
  growthRoute: "penetration",
  growthArgument: "share take",
};
assert.equal(isClaimingNoCompetitor(shortGap), false);
const short = checkF1(shortGap, {
  noCompetitorCheck: { majorCompetitorsFound: [], searchSummary: "should be ignored" },
});
assert.equal(short.checkLabel, "Below floor");
const shortItem = short.items.find((it) => /1\.5/.test(it.text));
assert.equal(shortItem.status, "pending");
assert.match(shortItem.text, /below the 2(?:\.0)? floor/);
assert.doesNotMatch(shortItem.text, /first-mover|No established competitor/);

const hashA = fingerprintNoCompetitor({
  ideaDescription: "enzyme-stable probiotic sachet",
  category: "Ready-to-eat",
});
const hashB = fingerprintNoCompetitor({
  ideaDescription: "enzyme-stable probiotic sachet",
  category: "Ready-to-eat",
});
const hashC = fingerprintNoCompetitor({
  ideaDescription: "enzyme-stable probiotic sachet",
  category: "Shampoo",
});
assert.equal(hashA, hashB);
assert.notEqual(hashA, hashC);

assert.equal(maxUsesForMatch("category", "category", 4), EXACT_CATEGORY_MATCH_MAX_USES);
assert.equal(maxUsesForMatch("category", "category", 3), EXACT_CATEGORY_MATCH_MAX_USES);
assert.equal(maxUsesForMatch("family", "family", 4), 4);
assert.equal(maxUsesForMatch("none", "none", 4), 4);
assert.equal(maxUsesForMatch("category", "family", 4), 4);
assert.equal(maxUsesForMatch("family", "category", 4), 4);
assert.equal(maxUsesForMatch("category", "none", 4), 4);
assert.equal(maxUsesForMatch("none", "category", 4), 4);
assert.equal(EXACT_CATEGORY_MATCH_MAX_USES, 1);

const lookupSrc = readFileSync(new URL("../lib/syndicatedLookup.js", import.meta.url), "utf8");
assert.match(lookupSrc, /lookupSyndicatedData/);
assert.match(lookupSrc, /maxUsesForMatch/);
assert.doesNotMatch(lookupSrc, /function scoreMatch|function bestRow/);
assert.match(readFileSync(new URL("../lib/categoryIntelligence/runSizing.js", import.meta.url), "utf8"), /withCategoryScope/);
assert.match(readFileSync(new URL("../lib/categoryIntelligence/runSizing.js", import.meta.url), "utf8"), /maxUsesForMatch/);
assert.match(readFileSync(new URL("../lib/filters/runNoCompetitorCheck.js", import.meta.url), "utf8"), /fingerprintNoCompetitor/);
assert.match(readFileSync(new URL("../lib/filters/runNoCompetitorCheck.js", import.meta.url), "utf8"), /maxUsesForMatch/);
assert.match(readFileSync(new URL("../lib/filterChecks.js", import.meta.url), "utf8"), /evaluateDeclaredGap/);
assert.match(
  readFileSync(new URL("../lib/categoryScopedResearch.js", import.meta.url), "utf8"),
  /nielsenMatchedOn/
);

console.log(
  `PASS Part 76 category-scoped syndicated lookup (${snacksDelta.tokensSaved} tokens saved on Snacks vs full file), no-competitor exception, and maxUsesForMatch`
);
