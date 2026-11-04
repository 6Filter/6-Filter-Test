/**
 * Unit tests: returnedSources from multiple web_search_tool_result blocks;
 * model-listed sources in JSON are ignored by extractors that only read tool blocks.
 */
import assert from "node:assert/strict";
import {
  extractReturnedSourcesFromContent,
  extractReturnedSourcesFromLlmResult,
  returnedSourceUrls,
} from "../lib/returnedSources.js";
import { sanitizeBenchmarkAssessment, sanitizeClaimAssessment } from "../lib/f1ResearchSafeguards.js";

const content = [
  {
    type: "web_search_tool_result",
    content: [
      { url: "https://one.example/a", title: "One" },
      { url: "https://two.example/b", title: "Two" },
    ],
  },
  {
    type: "web_search_tool_result",
    content: [{ url: "https://three.example/c", title: "Three" }],
  },
  {
    type: "text",
    text: '{"relevance":"strong","source_url":"https://evil.example/fake"}',
    citations: [{ url: "https://cite.example/d", title: "Cite" }],
  },
];

const fromBlocks = extractReturnedSourcesFromContent(content);
assert.equal(fromBlocks.length, 4);
assert.deepEqual(returnedSourceUrls(fromBlocks).sort(), [
  "https://cite.example/d",
  "https://one.example/a",
  "https://three.example/c",
  "https://two.example/b",
]);

const fromResult = extractReturnedSourcesFromLlmResult({ content });
assert.ok(returnedSourceUrls(fromResult).includes("https://one.example/a"));

// Benchmark: model source not in returned list → none
{
  const raw = sanitizeBenchmarkAssessment(
    { relevance: "strong", source_url: "https://evil.example/fake" },
    returnedSourceUrls(fromBlocks)
  );
  assert.equal(raw.relevance, "none");
}
{
  const raw = sanitizeBenchmarkAssessment(
    { relevance: "strong", source_url: "https://one.example/a" },
    returnedSourceUrls(fromBlocks)
  );
  assert.equal(raw.relevance, "strong");
}

// Contradiction without quote → not contradicted
{
  const raw = sanitizeClaimAssessment(
    { relevance: "strong", specific: true, contradicted: true, source_url: "https://one.example/a", quote: "" },
    returnedSourceUrls(fromBlocks)
  );
  assert.equal(raw.contradicted, false);
}
{
  const raw = sanitizeClaimAssessment(
    {
      relevance: "strong",
      specific: true,
      contradicted: true,
      source_url: "https://one.example/a",
      quote: "sales fell",
    },
    returnedSourceUrls(fromBlocks)
  );
  assert.equal(raw.contradicted, true);
}

console.log("PASS testReturnedSources");
