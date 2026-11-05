/**
 * Part 137 — F1 assessment runners treat bad LLM output as failed and do not cache failures.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { setCallLlmStub } from "./installCallLlmStub.mjs";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-assessment-fail-"));
process.env.REQUIRE_AUTH = "false";

const { initDb, getResearchCache } = await import("../lib/db.js");
await initDb();

const { runF1BenchmarkCheck, runF1ClaimCheck, runF1PlanCheck } = await import("../lib/f1Research.js");

let checks = 0;
function check(name, fn) {
  return (async () => {
    await fn();
    checks += 1;
  })().catch((e) => {
    e.message = `${name}: ${e.message}`;
    throw e;
  });
}

const SOURCE = "https://assessment-fail.example/item";

function benchmarkDoc(tag) {
  return {
    name: `Fail probe ${tag}`,
    category: "Buttermilk",
    ideaDescription: "Probe idea",
    f1: { benchmark: `Benchmark ${tag}`, declaredGap: 3 },
  };
}

function claimDoc(tag) {
  const text = `Growth argument for failure probe ${tag} with enough characters`;
  return {
    name: `Claim fail ${tag}`,
    category: "Buttermilk",
    ideaDescription: "Probe",
    f1: { benchmark: "Amul", declaredGap: 3, growthArgument: text },
    researchFindings: {
      autofillStatus: { "f1.growthArgument": { aiSuggested: text, confirmed: true } },
    },
  };
}

function planDoc(tag) {
  const attr = `Specific consumer benefit ${tag} not generic`;
  return {
    name: `Plan fail ${tag}`,
    category: "Buttermilk",
    ideaDescription: "Probe",
    f1: {
      benchmark: "Amul",
      declaredGap: 3,
      declaredAttribute: attr,
      growthRoute: "penetration",
      growthArgument: "Share gain",
    },
    researchFindings: {
      autofillStatus: {
        "f1.declaredAttribute": { aiSuggested: attr, confirmed: true },
        "f1.growthRoute": { aiSuggested: "penetration", confirmed: true },
      },
    },
  };
}

const okPlan = JSON.stringify({
  attributes: { relevance: "strong", specific: true },
  qcom: { relevance: "weak", specific: false },
  route: { matches: "yes", confidence: "high" },
});

const okClaim = JSON.stringify({
  argument: {
    relevance: "adequate",
    specific: true,
    supported: false,
    source_url: SOURCE,
    quote: "Market grew",
  },
});

const okBench = JSON.stringify({
  relevance: "strong",
  reason: "Leader",
  source_url: SOURCE,
});

async function assertFailureNotCached(runner, doc, stubFn, pickStatus) {
  let calls = 0;
  setCallLlmStub(async (opts) => {
    calls += 1;
    if (calls === 1) return stubFn(opts);
    if (String(opts.label || "").includes("benchmark")) {
      return { text: okBench, sources: [SOURCE] };
    }
    if (String(opts.label || "").includes("claim")) {
      return { text: okClaim, sources: [SOURCE] };
    }
    return { text: okPlan };
  });
  const first = await runner(doc, { provider: "claude" });
  const status = pickStatus(first);
  assert.equal(status, "failed");
  assert.notEqual(first?.cached, true);
  const cacheKey = first?.cacheKey;
  if (cacheKey) {
    const row = await getResearchCache(cacheKey);
    const step = row?.researchFindings?.f1Step;
    assert.ok(!step || !step.assessment || step.assessment.status !== "failed");
  }
  const second = await runner(doc, { provider: "claude" });
  assert.ok(calls >= 2, "failure must not prevent a retry LLM call");
  assert.notEqual(pickStatus(second), "failed");
}

const failureModes = [
  ["error throw", async () => {
    throw new Error("provider error");
  }],
  ["empty reply", async () => ({ text: "" })],
  ["unparseable", async () => ({ text: "Thanks! Here is my opinion without JSON." })],
  [
    "missing required field",
    async (opts) => {
      if (String(opts.label || "").includes("plan")) {
        return { text: "null" };
      }
      if (String(opts.label || "").includes("claim")) {
        return { text: JSON.stringify({ argument: { specific: true } }) };
      }
      return { text: JSON.stringify({ reason: "no relevance" }) };
    },
  ],
];

for (const [mode, stub] of failureModes) {
  await check(`runF1BenchmarkCheck ${mode}`, () =>
    assertFailureNotCached(
      runF1BenchmarkCheck,
      benchmarkDoc(`bench-${mode}`),
      stub,
      (r) => r?.assessment?.status
    )
  );
  await check(`runF1ClaimCheck ${mode}`, () =>
    assertFailureNotCached(
      runF1ClaimCheck,
      claimDoc(`claim-${mode}`),
      stub,
      (r) => r?.argument?.status || r?.derivation?.status || "failed"
    )
  );
  await check(`runF1PlanCheck ${mode}`, () =>
    assertFailureNotCached(
      runF1PlanCheck,
      planDoc(`plan-${mode}`),
      stub,
      (r) => r?.plan?.status
    )
  );
}

console.log(`PASS testAssessmentFailures (${checks} checks)`);
process.exit(0);
