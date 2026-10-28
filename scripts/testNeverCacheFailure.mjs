/**
 * A failed step is not written to the step cache or the category-fact cache.
 * An all-failed bundle is refused. A mixed bundle (some filters ok) is stored so
 * identical inputs replay the same scores. Run 1 fails Filter 4; run 2 retries it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-never-cache-"));
process.env.CATEGORY_FACT_CACHE = "on";

const { memoryStepStore, runResearchStep } = await import("../lib/researchStepCache.js");
const { researchBundleSaveAllowed } = await import("../lib/researchCacheable.js");
const { withCategoryFact, readCategoryFact } = await import("../lib/categoryFactCache.js");
const { saveResearchCache, getResearchCache, invalidateResearchCache } = await import("../lib/db.js");
const { fileListAudit } = await import("../lib/propositionRetention.js");

const store = memoryStepStore();
const f1 = { idea: "cache-probe", category: "cache-probe", image: "" };
const f4 = { idea: "cache-probe", category: "cache-probe", image: "" };
const f5 = { idea: "cache-probe", category: "cache-probe", division: "Personal Care" };
const cost = { idea: "cache-probe", name: "A", category: "cache-probe", division: "Personal Care" };
let f1Calls = 0;
let f4Calls = 0;
let sizingCalls = 0;
let costCalls = 0;

await runResearchStep("f1", f1, async () => {
  f1Calls += 1;
  return { benchmarkVerified: true };
}, { store });
await runResearchStep("f4", f4, async () => {
  f4Calls += 1;
  return { researchFailed: true, error: "injected" };
}, { store });
await runResearchStep("f5", f5, async () => {
  sizingCalls += 1;
  return { householdsReachedY3Mn: 1 };
}, { store });
await runResearchStep("cost", cost, async () => {
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
await runResearchStep("f5", f5, async () => {
  sizingCalls += 1;
  return { householdsReachedY3Mn: 9 };
}, { store });
await runResearchStep("cost", cost, async () => {
  costCalls += 1;
  return { estimatedCogsPerUnitInr: 99 };
}, { store });

assert.equal(f4Calls, 2);
assert.equal(f1Calls, 1);
assert.equal(sizingCalls, 1);
assert.equal(costCalls, 1);

for (const bad of [
  { researchFailed: true },
  { error: "down" },
  { parseFailed: true, text: "x" },
  { stopReason: "max_tokens", text: "cut" },
  {},
]) {
  assert.equal(researchBundleSaveAllowed({ researchFindings: { f4: bad } }), false);
}

assert.equal(
  researchBundleSaveAllowed({
    researchFindings: {
      f3: { researchFailed: true, failureReason: "no usable range" },
      f4: { techShiftFound: true, overallRisk: "High" },
      f5: { sizingFactorsFound: true, householdsReachedY3Mn: 2 },
      stepsExpected: ["F3", "F4", "F5"],
      stepsDone: ["F4", "F5"],
      stepsFailed: ["F3"],
      sources: [],
    },
  }),
  true,
  "mixed success + failed filter must be cacheable for score replay"
);

assert.equal(await saveResearchCache("a".repeat(64), { researchFindings: { f4: { researchFailed: true } } }), null);

const mixedHash = "b".repeat(64);
const mixedSaved = await saveResearchCache(mixedHash, {
  researchFindings: {
    f3: { researchFailed: true, failureReason: "no usable range" },
    f4: { techShiftFound: true },
    stepsFailed: [],
  },
});
assert.ok(mixedSaved, "mixed bundle must save even when stepsFailed is an empty array");
assert.equal((await getResearchCache(mixedHash))?.researchFindings?.f4?.techShiftFound, true);

const fact = await withCategoryFact({
  category: "cache-probe",
  scope: "idea:cache-probe",
  factType: "inflation",
  run: async () => ({ researchFailed: true, error: "injected" }),
});
assert.equal(fact.researchFailed, true);
assert.equal(await readCategoryFact("cache-probe", "idea:cache-probe", "inflation"), null);

const hash = createHash("sha256").update("part104-row").digest("hex");
const stored = await saveResearchCache(hash, {
  researchFindings: { f1: { benchmarkVerified: true } },
  division: "Personal Care",
});
assert.ok(stored);
const removed = await invalidateResearchCache(hash, "Master");
assert.equal(removed.deleted, true);
assert.equal(await getResearchCache(hash), null);
const audit = await fileListAudit();
assert.ok(audit.some((row) => row.action === "invalidate-research-cache" && JSON.stringify(row.ids_json).includes(hash)));

console.log("PASS never cache a failed research step — mixed bundles still save for score replay");
