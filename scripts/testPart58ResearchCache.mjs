import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  RESEARCH_SCHEMA_VERSION,
  logResearchCacheLookup,
  researchCacheResultLabel,
  researchHashFor,
} from "../lib/researchCache.js";
import {
  anthropicSystemBlocks,
  cachedSkillSystem,
  flattenSkillSystem,
  sixFilterChecklistSystem,
  sixFilterFullSystem,
} from "../lib/skills/loadSkill.js";

assert.match(RESEARCH_SCHEMA_VERSION, /f1-benchmark/);

const herbal = {
  name: "Oil with the herbal stick inside the pack",
  ideaDescription: "Oil with the herbal stick inside the pack",
  category: "Hair Oils",
};

const batch = [
  herbal,
  { ...herbal, ideaDescription: "Oil with the herbal stick inside the pack " },
  { ...herbal, ideaDescription: "Oil  with  the  herbal  stick  inside  the  pack" },
  { ...herbal, name: "OIL WITH THE HERBAL STICK INSIDE THE PACK" },
  { ...herbal, category: "hair oils" },
  {
    ...herbal,
    f1: { growthArgument: "Category working size ₹14000 Cr. First research draft." },
  },
  {
    ...herbal,
    f1: { growthArgument: "Different AI paragraph on the second Submit." },
  },
  {
    ...herbal,
    f1: {
      declaredAttribute: "cooling feel",
      benchmark: "Parachute Advansed 200ml",
      growthRoute: "penetration",
      growthArgument: "rewritten",
    },
  },
];

const hashes = batch.map((doc) => researchHashFor(doc));
const firstSixSame = hashes.slice(0, 6).every((h) => h === hashes[0]);
assert.equal(firstSixSame, true, "near-identical herbal-stick submissions must share a hash");
assert.notEqual(hashes[0], hashes[7], "naming a benchmark still busts the cache");

function legacyHash(doc) {
  const f1 = doc.f1 || {};
  const attrs = [f1.declaredAttribute, f1.declaredAttribute2, f1.declaredAttribute3]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  const fp = [
    String(f1.benchmark || "").trim().toLowerCase(),
    attrs,
    String(f1.growthRoute || "").trim().toLowerCase(),
    String(f1.growthArgument || "").trim().toLowerCase(),
  ].join("|");
  const normalized =
    `f1-benchmark-v4|${String(doc.name || "").trim().toLowerCase()}|` +
    `${String(doc.ideaDescription || "").trim().toLowerCase()}|` +
    `${String(doc.category || "").trim().toLowerCase()}||${fp}`;
  return createHash("sha256").update(normalized).digest("hex");
}

const legacyUnique = new Set(batch.map(legacyHash)).size;
const nextUnique = new Set(hashes).size;
const legacyHits = batch.length - legacyUnique;
const nextHits = batch.length - nextUnique;
assert.ok(nextHits > legacyHits, "normalized hash must raise hit rate on the debug batch");

assert.equal(researchCacheResultLabel({ findings: true }), "HIT");
assert.equal(researchCacheResultLabel(null), "MISS");

const logs = [];
const orig = console.log;
console.log = (...args) => logs.push(args.join(" "));
try {
  logResearchCacheLookup("abc123", { ok: true });
  logResearchCacheLookup("abc123", null);
} finally {
  console.log = orig;
}
assert.match(logs[0], /\[primus\/research-cache\] hash=abc123 result=HIT$/);
assert.match(logs[1], /\[primus\/research-cache\] hash=abc123 result=MISS$/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /logResearchCacheLookup\(inputHash, cached\)/);
assert.match(apiSrc, /logResearchCacheLookup\(inputHash, Boolean\(cached \|\| current\.researchRunAt\)\)/);

const skillSys = sixFilterFullSystem("You are Filter 1 — task-specific.");
const blocks = anthropicSystemBlocks(skillSys);
assert.equal(Array.isArray(blocks), true);
assert.equal(blocks[0].cache_control.type, "ephemeral");
assert.match(blocks[0].text, /6 Filter Test|six-filter/i);
assert.match(blocks[1].text, /Filter 1/);
assert.ok(blocks[0].text.length > blocks[1].text.length);

const checklist = sixFilterChecklistSystem("Research F3 price.");
assert.equal(anthropicSystemBlocks(checklist)[0].cache_control.type, "ephemeral");
assert.match(flattenSkillSystem(checklist), /Research F3 price/);
assert.equal(cachedSkillSystem("skill", "task").type, "cached-skill-system");

const skillSrc = readFileSync(new URL("../lib/skills/loadSkill.js", import.meta.url), "utf8");
assert.match(skillSrc, /cache_control: \{ type: "ephemeral" \}/);

const callSrc = readFileSync(new URL("../lib/callAnthropic.js", import.meta.url), "utf8");
assert.match(callSrc, /anthropicSystemBlocks/);
assert.match(callSrc, /cache_read_input_tokens/);
assert.match(callSrc, /prompt-caching-2024-07-31/);

const sites = [
  "../lib/categoryIntelligence/runSizing.js",
  "../lib/categoryIntelligence/runFormatTrend.js",
  "../lib/filters/runPriceResearch.js",
  "../lib/filters/runSizingResearch.js",
  "../lib/filters/runCostEstimate.js",
  "../lib/filters/runVolumeLossResearch.js",
  "../lib/filters/runMarginElasticityResearch.js",
];
for (const rel of sites) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  assert.match(src, /sixFilter(Full|Checklist)System\(/, `${rel} must wrap skill text for prompt cache`);
  assert.doesNotMatch(
    src,
    /sixFilterSkillForProvider\(\)\s*\+/,
    `${rel} must not concatenate skill text into a flat system string`
  );
}

console.log(
  `PASS Part 58 research-cache + prompt cache wiring ` +
    `legacyUnique=${legacyUnique}/${batch.length} nextUnique=${nextUnique}/${batch.length} ` +
    `legacyHitRate=${((legacyHits / batch.length) * 100).toFixed(0)}% ` +
    `nextHitRate=${((nextHits / batch.length) * 100).toFixed(0)}%`
);
