import "./enableResearchTrace.mjs";
import assert from "node:assert/strict";
import { researchTextIsUsable, researchThenJson } from "../lib/llmJson.js";
import {
  resolveFilter1Verdict,
  RESEARCH_FAILED_COPY,
  statedBenchmarkVerified,
} from "../lib/filters/filter1Opportunity.js";
import { BENCHMARK_UNVERIFIED_COPY } from "../lib/researchFailureCopy.js";
import { buildResearchFindings } from "../lib/researchFindings.js";
import { checkF1, checkF4 } from "../lib/filterChecks.js";
import { RESEARCH_SCHEMA_VERSION } from "../lib/researchCache.js";

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
assert.equal(swappedFindings.f1.benchmarkEvidence, BENCHMARK_UNVERIFIED_COPY);
const swappedCheck = checkF1(
  { declaredAttribute: "Hair strengthening", benchmark: "Qxzlph Brand 88421", declaredGap: 2, growthRoute: "penetration", growthArgument: "x" },
  swappedFindings.f1
);
assert.match(swappedCheck.items[1].text, /no verifiable competitive presence/);
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

assert.match(RESEARCH_SCHEMA_VERSION, /f3-pack-normalize/);

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

console.log("PASS Part 53 research failure no longer masquerades as a missing attribute");
