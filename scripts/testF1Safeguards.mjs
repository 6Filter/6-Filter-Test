/**
 * Part 133 — unit tests for source/quote verification safeguards.
 */
import assert from "node:assert/strict";
import {
  sanitizeBenchmarkCheck,
  sanitizeClaimList,
  sanitizeClaimChecks,
  sanitizeRouteCheck,
  urlsMatchReturnedSources,
} from "../lib/f1ResearchSafeguards.js";

const sources = [
  "https://example.com/dove-serum",
  { url: "https://retail.example/india/listing" },
];

// relevant without returned source → not-found
{
  const out = sanitizeBenchmarkCheck(
    { status: "relevant", source_url: "https://evil.example/fake", reason: "looks good" },
    sources
  );
  assert.equal(out.status, "not-found");
}

// relevant with returned source stands
{
  const out = sanitizeBenchmarkCheck(
    { status: "relevant", source_url: "https://example.com/dove-serum", reason: "on shelf" },
    sources
  );
  assert.equal(out.status, "relevant");
}

// contradicted without quote → unverifiable
{
  const out = sanitizeClaimList(
    [{ claim: "Category is ₹50,000 Cr", verdict: "contradicted", source_url: "https://example.com/dove-serum", quote: "" }],
    sources
  );
  assert.equal(out.claims[0].verdict, "unverifiable");
  assert.equal(out.verdict, "unverified");
}

// contradicted without returned source → unverifiable
{
  const out = sanitizeClaimList(
    [
      {
        claim: "Category is ₹50,000 Cr",
        verdict: "contradicted",
        source_url: "https://other.example/x",
        quote: "size is ₹1,200 Cr",
      },
    ],
    sources
  );
  assert.equal(out.claims[0].verdict, "unverifiable");
}

// contradicted with source + quote stands; per-text verdict contradicted
{
  const out = sanitizeClaimList(
    [
      {
        claim: "Category is ₹50,000 Cr",
        verdict: "contradicted",
        source_url: "https://retail.example/india/listing",
        quote: "category is about ₹1,200 crore",
      },
      { claim: "Hair oils grow 8%", verdict: "supported", source_url: "https://example.com/dove-serum", quote: "8%" },
    ],
    sources
  );
  assert.equal(out.verdict, "contradicted");
}

// supported only → supported
{
  const out = sanitizeClaimList(
    [{ claim: "Sold in India", verdict: "supported", source_url: "https://example.com/dove-serum", quote: "available" }],
    sources
  );
  assert.equal(out.verdict, "supported");
}

// empty claims → unverified
{
  const out = sanitizeClaimList([], sources);
  assert.equal(out.verdict, "unverified");
}

// claimChecks sanitizer
{
  const out = sanitizeClaimChecks(
    {
      growthArgument: {
        claims: [
          {
            claim: "TAM ₹99,000 Cr",
            verdict: "contradicted",
            source_url: "https://example.com/dove-serum",
            quote: "TAM nearer ₹2,000 Cr",
          },
        ],
      },
    },
    sources
  );
  assert.equal(out.growthArgument.verdict, "contradicted");
}

// route mismatch only at high
{
  const high = sanitizeRouteCheck({ expected: "frequency", confidence: "high", reason: "current buyers" });
  assert.equal(high.mismatchCounts, true);
  const med = sanitizeRouteCheck({ expected: "frequency", confidence: "medium", reason: "maybe" });
  assert.equal(med.mismatchCounts, false);
}

assert.equal(urlsMatchReturnedSources("https://example.com/dove-serum/", sources), true);
assert.equal(urlsMatchReturnedSources("https://nope.example", sources), false);

console.log("PASS testF1Safeguards");
