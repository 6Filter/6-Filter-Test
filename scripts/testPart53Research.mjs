import "./enableResearchTrace.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { researchTextIsUsable, researchThenJson } from "../lib/llmJson.js";
import {
  resolveFilter1Verdict,
  RESEARCH_FAILED_COPY,
  statedBenchmarkVerified,
} from "../lib/filters/filter1Opportunity.js";
import { BENCHMARK_UNVERIFIED_COPY } from "../lib/researchFailureCopy.js";
import { buildResearchFindings } from "../lib/researchFindings.js";
import { checkF1, checkF4 } from "../lib/filterChecks.js";
import { RESEARCH_SCHEMA_VERSION, researchHashFor } from "../lib/researchCache.js";

assert.equal(statedBenchmarkVerified("Indulekha", "Indulekha Bringha Hair Oil"), true);
assert.equal(statedBenchmarkVerified("Qxzlph Brand 88421", "Indulekha Bhringa Hair Oil"), false);

const swapped = resolveFilter1Verdict(
  {
    attribute: "Hair strengthening",
    benchmarkName: "Indulekha Bhringa Hair Oil",
    estimatedBenchmarkExists: true,
    verdictReason: "Found a real hair-oil incumbent.",
  },
  { attribute: "Hair strengthening", benchmarkName: "Qxzlph Brand 88421" }
);
assert.equal(swapped.estimatedBenchmarkExists, false);
assert.equal(swapped.benchmarkName, "Qxzlph Brand 88421");
const swappedFindings = buildResearchFindings({ filter1: swapped });
assert.equal(swappedFindings.f1.benchmarkVerified, false);
assert.match(swappedFindings.f1.benchmarkEvidence, /did not verify Qxzlph Brand 88421/);
assert.doesNotMatch(swappedFindings.f1.benchmarkEvidence, /purchase-decision attribute/);
const swappedCheck = checkF1(
  { declaredAttribute: "Hair strengthening", benchmark: "Qxzlph Brand 88421", declaredGap: 2, growthRoute: "penetration", growthArgument: "x" },
  swappedFindings.f1
);
assert.match(swappedCheck.items[1].text, /Qxzlph Brand 88421/);
assert.match(swappedCheck.items[1].text, /did not verify|no verifiable/);
assert.doesNotMatch(swappedCheck.items[1].text, /purchase-decision attribute/);

assert.equal(researchTextIsUsable(""), false);
assert.equal(researchTextIsUsable("short"), false);
assert.equal(researchTextIsUsable("x".repeat(400)), true);

const failed = resolveFilter1Verdict(
  { generalCategory: "Hair oil" },
  { attribute: "Hair strengthening", benchmarkName: "Indulekha", researchFailed: true, researchError: "truncated" }
);
assert.equal(failed.researchFailed, true);
assert.equal(failed.verdictReason, RESEARCH_FAILED_COPY);
assert.equal(failed.attribute, "Hair strengthening");
assert.equal(failed.benchmarkName, "Indulekha");
assert.doesNotMatch(failed.verdictReason, /purchase-decision attribute/);

const findings = buildResearchFindings({
  filter1: {
    researchFailed: true,
    attribute: "Hair strengthening",
    benchmarkName: "Indulekha",
    verdictReason: RESEARCH_FAILED_COPY,
  },
});
assert.equal(findings.f1.researchFailed, true);
assert.equal(findings.f1.benchmarkVerified, false);
assert.equal(findings.f1.benchmarkEvidence, RESEARCH_FAILED_COPY);
assert.equal(findings.f1.categorySizeFound, false);
assert.equal(findings.f1.categorySizeEvidence, RESEARCH_FAILED_COPY);

const checked = checkF1(
  {
    declaredAttribute: "Hair strengthening",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  findings.f1
);
assert.match(checked.items[1].text, /Research failed — retry/);
assert.doesNotMatch(checked.items[1].text, /purchase-decision attribute/);
assert.match(checked.items[3].text, /Research failed — retry/);

const f4Failed = checkF4({}, { researchFailed: true });
assert.match(f4Failed.items[0].text, /Research failed — retry/);

const unverified = checkF1(
  { declaredAttribute: "Hold", benchmark: "Zzxq-not-a-real-brand-999", declaredGap: 2, growthRoute: "penetration", growthArgument: "x" },
  { benchmarkVerified: false, benchmarkEvidence: "Searched and found no verifiable competitive presence for this benchmark" }
);
assert.match(unverified.items[1].text, /no verifiable competitive presence/);

assert.match(RESEARCH_SCHEMA_VERSION, /f1-benchmark/);

const brief =
  "# Filter 1 brief\nIndulekha is a real HUL Ayurvedic hair-oil brand at about ₹400 crore annual sales. Hair strengthening is its core claim. Category size around ₹15,400 crore.\n" +
  "Public listings and trade press treat Indulekha Bringha as a currently-selling Ayurvedic hair oil with a hair-fall / strengthening purchase-decision claim.\n" +
  "x".repeat(400);

let callN = 0;
const { parsed, error } = await researchThenJson({
  label: "filter1-test",
  researchSystem: "sys",
  researchUser: "STATED_BENCHMARK: Indulekha\nSTATED_ATTRIBUTE: Hair strengthening",
  jsonSystem: "json",
  callResearch: async () => {
    callN += 1;
    return {
      text: brief,
      sources: [{ title: "Indulekha", url: "https://example.com/indulekha" }],
      stopReason: "max_tokens",
      contentTypes: ["web_search_tool_result", "text"],
    };
  },
  callStructure: async ({ userText }) => {
    callN += 1;
    assert.match(String(userText), /Indulekha/);
    return {
      text: JSON.stringify({
        generalCategory: "Herbal hair oil",
        benchmarkName: "Indulekha",
        attribute: "Hair strengthening",
        growthStage: "mature-cluttered",
        estimatedBenchmarkExists: true,
        sourceTier: 1,
        reconciliation: { status: "TIGHT", p50Cr: 15400 },
        verdict: "PASS",
        verdictReason: "Indulekha is a currently-selling HUL Ayurvedic hair oil.",
      }),
      sources: [],
      stopReason: "end_turn",
      contentTypes: ["text"],
    };
  },
});
assert.equal(error, undefined);
assert.equal(parsed.benchmarkName, "Indulekha");
assert.equal(parsed.attribute, "Hair strengthening");
assert.equal(callN, 2, "max_tokens with usable text must still run the structuring call");

const emptyTruncated = await researchThenJson({
  label: "filter1-empty",
  researchSystem: "sys",
  researchUser: "x",
  jsonSystem: "json",
  callResearch: async () => ({ text: "tiny", sources: [], stopReason: "max_tokens", contentTypes: ["text"] }),
  callStructure: async () => {
    throw new Error("structuring must not run on unusable truncated research");
  },
});
assert.equal(emptyTruncated.error, "truncated");
assert.equal(emptyTruncated.parsed, null);

const hashWithoutF1 = researchHashFor({
  name: "Hair oil",
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
});
const hashWithIndulekha = researchHashFor({
  name: "Hair oil",
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
  f1: { benchmark: "Indulekha", declaredAttribute: "Hair strengthening" },
});
const hashWithIndulekhaAgain = researchHashFor({
  name: "Hair oil",
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
  f1: { benchmark: "Indulekha", declaredAttribute: "Hair strengthening" },
});
assert.notEqual(hashWithoutF1, hashWithIndulekha, "naming a benchmark must bust the research cache");
assert.equal(hashWithIndulekha, hashWithIndulekhaAgain);

assert.equal(
  researchHashFor({
    name: "Hair oil",
    ideaDescription: "herbal  cooling\nhair oil",
    category: "Hair oils",
  }),
  researchHashFor({
    name: "HAIR OIL",
    ideaDescription: "herbal cooling hair oil",
    category: "Hair Oils",
  }),
  "whitespace and casing must not bust the research cache"
);
assert.equal(
  researchHashFor({
    name: "Hair oil",
    ideaDescription: "herbal cooling hair oil",
    category: "Hair oils",
    f1: { benchmark: "Indulekha", declaredAttribute: "Hair strengthening", growthArgument: "first draft" },
  }),
  researchHashFor({
    name: "Hair oil",
    ideaDescription: "herbal cooling hair oil",
    category: "Hair oils",
    f1: { benchmark: "Indulekha", declaredAttribute: "Hair strengthening", growthArgument: "rewritten after AI fill" },
  }),
  "growth-argument prose must not bust the research cache"
);

const schemaDefaultFalse = resolveFilter1Verdict(
  {
    attribute: "Hair strengthening",
    benchmarkName: "Indulekha Bringha Hair Oil",
    estimatedBenchmarkExists: false,
    benchmarkFinding: "Indulekha Bringha is HUL's Ayurvedic hair-oil brand, currently listed across India.",
    verdictReason: "Clears opportunity gate vs Indulekha on Hair strengthening.",
    reconciliation: { status: "TIGHT", p50Cr: 15400 },
  },
  { attribute: "Hair strengthening", benchmarkName: "Indulekha" }
);
assert.equal(schemaDefaultFalse.estimatedBenchmarkExists, true);
assert.equal(schemaDefaultFalse.benchmarkName, "Indulekha Bringha Hair Oil");
const schemaFindings = buildResearchFindings({ filter1: schemaDefaultFalse });
assert.equal(schemaFindings.f1.benchmarkVerified, true);
assert.match(schemaFindings.f1.benchmarkEvidence, /HUL/);
assert.doesNotMatch(schemaFindings.f1.benchmarkEvidence, /purchase-decision attribute/);

const stalePlaceholder = checkF1(
  {
    declaredAttribute: "Hair strengthening",
    declaredAttribute2: "Reduces hair breakage",
    declaredAttribute3: "Shine boost",
    benchmark: "Indulekha",
    declaredGap: 4,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  {
    benchmarkVerified: false,
    benchmarkEvidence: "Missing evidence: name the purchase-decision attribute.",
  }
);
assert.doesNotMatch(stalePlaceholder.items[1].text, /purchase-decision attribute/);
assert.match(stalePlaceholder.items[1].text, /Indulekha/);

const verifiedCheck = checkF1(
  {
    declaredAttribute: "Hair strengthening",
    benchmark: "Indulekha",
    declaredGap: 4,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  schemaFindings.f1
);
assert.equal(verifiedCheck.items[1].status, "done");
assert.match(verifiedCheck.items[1].text, /Benchmark verified: Indulekha/);
assert.match(verifiedCheck.items[1].text, /HUL/);

const sizingSrc = readFileSync(new URL("../lib/categoryIntelligence/runSizing.js", import.meta.url), "utf8");
assert.match(sizingSrc, /STATED_BENCHMARK must be researched as a named brand/);
assert.match(sizingSrc, /benchmarkFinding/);
assert.doesNotMatch(sizingSrc, /"estimatedBenchmarkExists":false/);

console.log("PASS Part 53 research failure no longer masquerades as a missing attribute");
