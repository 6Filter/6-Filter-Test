/**
 * Part 133 — Filter 1 research calls (Postgres + stubbed LLM). Owner attached suite when present.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const SKIP = "SKIP testFilter1Research — TEST_DATABASE_URL not set";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

function hostAllowed(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
if (!hostAllowed(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("../pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-f1-research-${process.pid}`);
process.env.REQUIRE_AUTH = "false";

const { initDb } = await import("../../lib/db.js");
await initDb();

const {
  shouldRunBenchmarkCheck,
  shouldRunClaimCheck,
  shouldRunRouteCheck,
  confirmedTextsForClaimCheck,
} = await import("../../lib/f1Research.js");
const { sanitizeBenchmarkCheck, sanitizeClaimChecks } = await import("../../lib/f1ResearchSafeguards.js");
const {
  F1_BENCHMARK_PROMPT_TOKEN,
  F1_CLAIM_PROMPT_TOKEN,
  F1_ROUTE_PROMPT_TOKEN,
} = await import("../../lib/f1Research.js");
const { inputReviewSystemPrompt: _ir } = await import("../../lib/inputReviewAi.js");

assert.match(F1_BENCHMARK_PROMPT_TOKEN, /PRIMUS_F1_BENCHMARK_CHECK/);
assert.match(F1_CLAIM_PROMPT_TOKEN, /PRIMUS_F1_CLAIM_CHECK/);
assert.match(F1_ROUTE_PROMPT_TOKEN, /PRIMUS_F1_ROUTE_CHECK/);

// No money on first-movers / blank benchmarks / unconfirmed AI text
assert.equal(shouldRunBenchmarkCheck({ declaredGap: 0, benchmark: "" }), false);
assert.equal(shouldRunBenchmarkCheck({ declaredGap: 3, benchmark: "" }), false);
assert.equal(shouldRunBenchmarkCheck({ declaredGap: 3, benchmark: "Dove" }), true);

const autofill = {
  "f1.gapDerivation": { aiSuggested: "AI text" },
  "f1.growthArgument": { aiSuggested: "AI arg", confirmed: true },
};
assert.deepEqual(confirmedTextsForClaimCheck({ gapDerivation: "AI text", growthArgument: "AI arg" }, autofill), {
  growthArgument: "AI arg",
});
assert.equal(
  shouldRunClaimCheck({ gapDerivation: "AI text", growthArgument: "AI arg" }, autofill),
  true
);
assert.equal(shouldRunRouteCheck({ growthRoute: "penetration" }, { "f1.growthRoute": { aiSuggested: "penetration" } }), false);
assert.equal(
  shouldRunRouteCheck({ growthRoute: "penetration" }, { "f1.growthRoute": { aiSuggested: "penetration", confirmed: true } }),
  true
);

// Safeguards (same as pure unit file — required for this suite)
{
  const sources = ["https://ok.example/a"];
  assert.equal(
    sanitizeBenchmarkCheck({ status: "relevant", source_url: "https://bad.example" }, sources).status,
    "not-found"
  );
  const claims = sanitizeClaimChecks(
    {
      growthArgument: {
        claims: [{ claim: "x", verdict: "contradicted", source_url: "https://ok.example/a", quote: "y" }],
      },
    },
    sources
  );
  assert.equal(claims.growthArgument.verdict, "contradicted");
}

console.log("PASS owner testFilter1Research");
await suite.drop?.();
process.exit(0);
