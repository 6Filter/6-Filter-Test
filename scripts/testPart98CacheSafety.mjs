import assert from "node:assert/strict";
import { memoryStepStore, runResearchStep } from "../lib/researchStepCache.js";
import { researchBundleSaveAllowed, researchResultIsCacheable } from "../lib/researchCacheable.js";
import { categoryFactCacheEnabled, categoryFactScope } from "../lib/categoryFactCache.js";
import { harnessQuoteFromMeasurement, readGoldBudgetCap, shouldAbortGoldRun } from "../lib/goldBudget.js";
import { saveResearchCache, getResearchCache, initDb } from "../lib/db.js";

assert.equal(categoryFactCacheEnabled(), false);
assert.notEqual(
  categoryFactScope("inflation", { ideaText: "shampoo a" }),
  categoryFactScope("inflation", { ideaText: "shampoo b" })
);
assert.notEqual(
  categoryFactScope("avg-price", { ideaText: "shampoo", grammage: "10g" }),
  categoryFactScope("avg-price", { ideaText: "shampoo", grammage: "100g" })
);
assert.equal(categoryFactScope("volume-loss", {}), null);

const store = memoryStepStore();
const f1 = { idea: "shampoo", category: "hair oil", image: "" };
const f4 = { idea: "shampoo", category: "hair oil", image: "" };
let f1Calls = 0;
let f4Calls = 0;
let sizingCalls = 0;
let costCalls = 0;
await runResearchStep("f1", f1, async () => {
  f1Calls += 1;
  return { benchmarkVerified: true, verdict: "PASS" };
}, { store });
await runResearchStep("f4", f4, async () => {
  f4Calls += 1;
  return { researchFailed: true, error: "truncated" };
}, { store });
await runResearchStep("f5", { idea: "shampoo", category: "hair oil", division: "Personal Care" }, async () => {
  sizingCalls += 1;
  return { householdsReachedY3Mn: 1 };
}, { store });
await runResearchStep("cost", { idea: "shampoo", name: "A", category: "hair oil", division: "Personal Care" }, async () => {
  costCalls += 1;
  return { estimatedCogsPerUnitInr: 20 };
}, { store });

await runResearchStep("f4", f4, async () => {
  f4Calls += 1;
  return { dimensions: { pack: { rating: "low" } } };
}, { store });
await runResearchStep("f1", f1, async () => {
  f1Calls += 1;
  return { benchmarkVerified: false };
}, { store });
await runResearchStep("f5", { idea: "shampoo", category: "hair oil", division: "Personal Care" }, async () => {
  sizingCalls += 1;
  return { householdsReachedY3Mn: 9 };
}, { store });
await runResearchStep("cost", { idea: "shampoo", name: "A", category: "hair oil", division: "Personal Care" }, async () => {
  costCalls += 1;
  return { estimatedCogsPerUnitInr: 99 };
}, { store });

assert.equal(f4Calls, 2);
assert.equal(f1Calls, 1);
assert.equal(sizingCalls, 1);
assert.equal(costCalls, 1);
assert.equal(researchResultIsCacheable({ researchFailed: true, error: "truncated" }), false);
assert.equal(researchResultIsCacheable({ error: "empty" }), false);
assert.equal(researchBundleSaveAllowed({ researchFindings: { f4: {} } }), false);
assert.equal(
  researchBundleSaveAllowed({ researchFindings: { f4: { researchFailed: true, error: "truncated" } } }),
  true
);
assert.equal(
  researchBundleSaveAllowed({
    researchFindings: {
      f3: { researchFailed: true },
      f4: { techShiftFound: true },
      stepsFailed: [],
    },
  }),
  true
);
assert.equal(researchBundleSaveAllowed({ filterNarratives: { f1: "ok" } }), true);

await initDb();
const hash = "part98-empty-bundle";
const saved = await saveResearchCache(hash, { researchFindings: { f4: {} } });
assert.equal(saved, null);
assert.equal(await getResearchCache(hash), null);
const mixed = await saveResearchCache("part98-mixed-bundle", {
  researchFindings: { f3: { researchFailed: true }, f5: { sizingFactorsFound: true, trialRatePct: 10 } },
});
assert.ok(mixed);
const failedOnly = await saveResearchCache("part98-failed-documented", {
  researchFindings: { f4: { researchFailed: true, error: "truncated" } },
});
assert.ok(failedOnly);

assert.throws(() => readGoldBudgetCap({}), /GOLD_SET_MAX_USD is required/);
assert.equal(readGoldBudgetCap({ GOLD_SET_MAX_USD: "2.5" }), 2.5);
const quote = harnessQuoteFromMeasurement(
  { inputTokens: 100000, outputTokens: 20000, cacheRead: 0, cacheWrite: 0, searches: 10 },
  { ideas: 10, baselines: 2, candidates: 1 }
);
assert.equal(quote.runs, 30);
let spent = 0;
const kept = [];
for (const id of ["a", "b", "c"]) {
  spent += 0.6;
  kept.push(id);
  if (shouldAbortGoldRun(spent, 1)) break;
}
assert.deepEqual(kept, ["a", "b"]);

console.log("testPart98CacheSafety ok");
