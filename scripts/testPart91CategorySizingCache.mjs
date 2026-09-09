import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fingerprintCategorySizingInput,
  logResearchCacheLookup,
  researchCacheResultLabel,
} from "../lib/researchCache.js";
import { getOrRunCategorySizing } from "../lib/categoryIntelligence/getOrRunSizing.js";

const base = {
  ideaText: "herbal cooling hair oil with stick",
  categoryName: "Hair Oils",
  attribute: "cooling",
  benchmarkName: "Indulekha",
  isPureCommodity: false,
  pricePerUnit: 121,
  scope: "India modern trade",
};

assert.equal(
  fingerprintCategorySizingInput(base),
  fingerprintCategorySizingInput({
    scope: base.scope,
    pricePerUnit: base.pricePerUnit,
    isPureCommodity: base.isPureCommodity,
    benchmarkName: base.benchmarkName,
    attribute: base.attribute,
    categoryName: base.categoryName,
    ideaText: base.ideaText,
  }),
  "same inputs must produce the same hash regardless of object key order"
);

assert.notEqual(
  fingerprintCategorySizingInput(base),
  fingerprintCategorySizingInput({ ...base, categoryName: "Skin Creams" }),
  "a different categoryName must produce a different hash"
);

assert.equal(
  fingerprintCategorySizingInput(base),
  fingerprintCategorySizingInput({ ...base, ideaId: "should-not-matter" }),
  "ideaId must not be part of the fingerprint"
);

const httpSrc = readFileSync(new URL("../lib/categoryIntelligence/http.js", import.meta.url), "utf8");
const runBranch = httpSrc.slice(
  httpSrc.indexOf('if (url === "/api/category-sizing/run")'),
  httpSrc.indexOf("const exportMatch")
);
assert.match(runBranch, /getOrRunCategorySizing/);
assert.doesNotMatch(runBranch, /runCategorySizing\s*\(/);

const filter1Src = readFileSync(
  new URL("../lib/filters/filter1Opportunity.js", import.meta.url),
  "utf8"
);
assert.match(filter1Src, /runCategorySizing/);
assert.doesNotMatch(filter1Src, /getOrRunCategorySizing/);

const unique = {
  ...base,
  categoryName: `CacheTest Oils ${Date.now()}`,
  ideaText: `cache-test idea ${Date.now()}`,
};
const fakeParsed = {
  sizingRunId: "test-run",
  categoryName: unique.categoryName,
  sources: [{ title: "test", url: "https://example.com" }],
};

let runCalls = 0;
const runFn = async () => {
  runCalls += 1;
  return { parsed: fakeParsed };
};

const first = await getOrRunCategorySizing(unique, { runFn, persist: false });
assert.equal(runCalls, 1);
assert.equal(first.fromCache, false);
assert.deepEqual(first.parsed, fakeParsed);

const second = await getOrRunCategorySizing(unique, { runFn, persist: false });
assert.equal(runCalls, 1, "identical inputs must invoke runCategorySizing only once");
assert.equal(second.fromCache, true);
assert.deepEqual(second.parsed, fakeParsed);

assert.equal(researchCacheResultLabel({ ok: true }), "HIT");
assert.equal(researchCacheResultLabel(null), "MISS");

const cacheLogs = [];
const origLog = console.log;
console.log = (...args) => {
  cacheLogs.push(args.join(" "));
};
logResearchCacheLookup("abc", { researchFindings: {} });
logResearchCacheLookup("def", null);
console.log = origLog;
assert.ok(cacheLogs.some((l) => l.includes("result=HIT")));
assert.ok(cacheLogs.some((l) => l.includes("result=MISS")));

console.log("PASS Part 91: category sizing fingerprint cache (hash stable, miss then hit)");
