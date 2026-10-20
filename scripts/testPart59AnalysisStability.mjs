import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gateInputKey } from "../lib/analysisStability.js";
import { ideaScaleFromDoc } from "../lib/ideaScale.js";
import { checkF3 } from "../lib/filterChecks.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import {
  fingerprintResearchInput,
  logResearchCacheLookup,
  researchCacheResultLabel,
  researchHashFor,
} from "../lib/researchCache.js";

const hairOil = {
  name: "Oil with the herbal stick inside the pack",
  category: "Hair Oils",
  ideaDescription: "herbal stick",
  division: "Personal Care",
  f1: { declaredAttribute: "cooling" },
  f2: { mrpInr: 121, netMarginAtScale: 22, cogsAtScale: 70 },
  f3: {},
  f4: {},
  f5: {},
};

const key1 = gateInputKey(hairOil);
const key2 = gateInputKey({ ...hairOil, f2: { ...hairOil.f2 } });
assert.equal(key1, key2, "key order must not change the fingerprint");
assert.notEqual(
  gateInputKey(hairOil),
  gateInputKey({ ...hairOil, f2: { ...hairOil.f2, cogsAtScale: 95 } }),
  "COGS is a scoring input even though it is not a research-cache input"
);

assert.equal(
  ideaScaleFromDoc({
    f5: {},
    researchFindings: { f1: { categoryTamCr: 14000 } },
  }),
  "10g"
);

const range = { minMrpInr: 80, maxMrpInr: 120, minMarginPct: 12, maxMarginPct: 28 };
const f3At70 = checkF3(
  { cogsAtScale: 70, netMarginAtScale: 20, gstRatePct: 18 },
  { marginElasticity: range }
);
const f3At40 = checkF3(
  { cogsAtScale: 40, netMarginAtScale: 20, gstRatePct: 18 },
  { marginElasticity: range }
);
assert.equal(f3At70.checkLabel, "Cleared");
assert.equal(f3At40.checkLabel, "Below floor");
assert.notEqual(
  computeGoNoGo({ f3: f3At70 }),
  computeGoNoGo({ f3: f3At40 }),
  "changing only COGS must move GO/NO-GO when scoring runs on current fields"
);
assert.notEqual(scoreAdvisoryChecks({ f3: f3At70 }).pct, scoreAdvisoryChecks({ f3: f3At40 }).pct);

const baseHashDoc = {
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
  division: "Personal Care",
  f1: {
    benchmark: "Indulekha",
    declaredAttribute: "cooling",
    declaredAttribute2: "",
    declaredAttribute3: "",
    pureCommodity: false,
    growthArgument: "first draft",
  },
  f2: { cogsAtScale: 70, netMarginAtScale: 22 },
};
assert.equal(
  researchHashFor(baseHashDoc),
  researchHashFor({
    ...baseHashDoc,
    f1: { ...baseHashDoc.f1, growthArgument: "rewritten after AI fill" },
    f2: { cogsAtScale: 999, netMarginAtScale: 5 },
  }),
  "COGS, margin, and growth-argument prose must not bust the research cache"
);
assert.notEqual(
  researchHashFor(baseHashDoc),
  researchHashFor({ ...baseHashDoc, division: "Foods" }),
  "division feeds sizing research and must be in the hash"
);
assert.notEqual(
  researchHashFor(baseHashDoc),
  researchHashFor({ ...baseHashDoc, f1: { ...baseHashDoc.f1, pureCommodity: true } }),
  "isPureCommodity feeds Filter 1 research and must be in the hash"
);
assert.notEqual(
  researchHashFor(baseHashDoc),
  researchHashFor({ ...baseHashDoc, category: "Skin Creams" }),
  "category feeds several research functions and must be in the hash"
);
assert.notEqual(
  researchHashFor(baseHashDoc),
  researchHashFor({
    ...baseHashDoc,
    f1: { ...baseHashDoc.f1, declaredAttribute2: "non-sticky" },
  }),
  "attribute 2 feeds Filter 1 research and must be in the hash"
);
assert.equal(
  fingerprintResearchInput({
    ideaDescription: "herbal cooling hair oil",
    category: "Hair oils",
    benchmark: "Indulekha",
    attribute1: "cooling",
    attribute2: "",
    attribute3: "",
    division: "Personal Care",
    isPureCommodity: false,
    attachmentHash: "",
  }),
  researchHashFor(baseHashDoc)
);

const cacheSrc = readFileSync(new URL("../lib/researchCache.js", import.meta.url), "utf8");
const fingerprintFn = cacheSrc.slice(
  cacheSrc.indexOf("export function fingerprintResearchInput"),
  cacheSrc.indexOf("export function hashAttachment")
);
assert.match(fingerprintFn, /ideaDescription/);
assert.match(fingerprintFn, /category/);
assert.match(fingerprintFn, /benchmark/);
assert.match(fingerprintFn, /attribute1/);
assert.match(fingerprintFn, /attribute2/);
assert.match(fingerprintFn, /attribute3/);
assert.match(fingerprintFn, /division/);
assert.match(fingerprintFn, /isPureCommodity/);
assert.match(fingerprintFn, /attachmentHash/);
assert.doesNotMatch(fingerprintFn, /growthArgument/);
assert.doesNotMatch(fingerprintFn, /cogsAtScale/);
assert.doesNotMatch(fingerprintFn, /netMarginAtScale/);

assert.equal(researchCacheResultLabel({ ok: true }), "HIT");
assert.equal(researchCacheResultLabel(null), "MISS");

const cacheLogs = [];
const scoringLogs = [];
const origLog = console.log;
console.log = (...args) => {
  const line = args.join(" ");
  cacheLogs.push(line);
  scoringLogs.push(line);
};
try {
  logResearchCacheLookup("abc123", { ok: true });
  logResearchCacheLookup("abc123", null);
  await computeAllAdvisoryChecks({
    f2: { cogsAtScale: 70, netMarginAtScale: 22 },
    f3: { marginElasticity: range },
  });
} finally {
  console.log = origLog;
}
assert.match(cacheLogs[0], /\[primus\/research-cache\] hash=abc123 result=HIT$/);
assert.match(cacheLogs[1], /\[primus\/research-cache\] hash=abc123 result=MISS$/);
assert.match(
  scoringLogs.join("\n"),
  /\[primus\/scoring\] recomputed fresh from current field values, cogs=70, margin=22 -> checkLabel=/
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.doesNotMatch(formSrc, /shouldReuseAnalysis/);
assert.match(formSrc, /result\.researchRan/);
assert.match(formSrc, /!initial\?\.researchRunAt/);
assert.match(formSrc, /if \(!goNoGo\?\.classification\) \{\s*const preview = applyLocalGate/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /skipDerivedAutoFill/);
assert.match(apiSrc, /researchRan: Boolean\(shouldRunResearch\)/);
assert.match(apiSrc, /goNoGo: _clientStoredResult/);
assert.match(apiSrc, /division: divisionForScore\(enriched, enriched\)/);
assert.match(apiSrc, /computeAllAdvisoryChecks\(scored\)/);

const gateSrc = readFileSync(new URL("../lib/propositionGateApi.js", import.meta.url), "utf8");
assert.doesNotMatch(gateSrc, /shouldReuseAnalysis/);
assert.doesNotMatch(gateSrc, /saved\.goNoGo\.classification/);
assert.match(gateSrc, /const advisoryChecks = await computeAllAdvisoryChecks\(scored\)/);

const scoringSrc = readFileSync(new URL("../lib/propositionScoring.js", import.meta.url), "utf8");
assert.match(
  scoringSrc,
  /\[primus\/scoring\] recomputed fresh from current field values, cogs=\$\{f2\.cogsAtScale\}/
);

console.log("PASS Part 59 stale results: research fingerprint + always-fresh scoring");
