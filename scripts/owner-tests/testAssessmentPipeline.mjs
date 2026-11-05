/**
 * Part 137 — assessment pipeline (Postgres + stubbed LLM).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { setCallLlmStub } from "../installCallLlmStub.mjs";

const SKIP = "SKIP testAssessmentPipeline — TEST_DATABASE_URL not set";
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-assessment-pipeline-${process.pid}`);
process.env.REQUIRE_AUTH = "false";

const { initDb } = await import("../../lib/db.js");
await initDb();

const { STEP_SLOTS, expectedResearchSteps, mergeFindingsByStep, stampKeptFindings } = await import(
  "../../lib/researchProgress.js"
);

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

function okBenchmarkJson(sourceUrl = "https://catalog.example/india-product") {
  return JSON.stringify({
    relevance: "strong",
    reason: "Leader in category",
    source_url: sourceUrl,
  });
}

function llmOk(sourceUrl = "https://catalog.example/india-product") {
  return {
    text: okBenchmarkJson(sourceUrl),
    sources: [sourceUrl],
  };
}

function benchmarkDoc(suffix = "") {
  return {
    name: `Assessment probe ${suffix}`,
    category: "Probiotic buttermilk",
    ideaDescription: "Pouch format probiotic buttermilk for urban households",
    f1: {
      benchmark: `Amul Probiotic buttermilk pouch ${suffix}`.trim(),
      declaredGap: 3,
    },
  };
}

function claimDoc(suffix = "") {
  const text = `Confirmed growth argument with enough detail ${suffix}`.trim();
  return {
    name: `Claim probe ${suffix}`,
    category: "Buttermilk",
    ideaDescription: "Probe",
    f1: {
      benchmark: "Amul",
      declaredGap: 3,
      growthArgument: text,
    },
    researchFindings: {
      autofillStatus: {
        "f1.growthArgument": { aiSuggested: text, confirmed: true },
      },
    },
  };
}

function patchFindingsFromExtra(extra) {
  const f1 = {};
  if (extra.assessments) f1.assessments = extra.assessments;
  if (extra.benchmarkCheck) f1.benchmarkCheck = extra.benchmarkCheck;
  if (extra.claimChecks) f1.claimChecks = extra.claimChecks;
  if (extra.routeCheck) f1.routeCheck = extra.routeCheck;
  const out = {};
  if (Object.keys(f1).length) out.f1 = f1;
  if (extra.f2Assessments) out.f2 = { assessments: extra.f2Assessments };
  return out;
}

const EMITTABLE = [
  "F1",
  "f1Benchmark",
  "f1Claims",
  "f1Plan",
  "noCompetitor",
  "F2",
  "F3",
  "F4",
  "F5",
  "evidence",
];

await check("STEP_SLOTS covers every step expectedResearchSteps can emit", () => {
  for (const step of EMITTABLE) {
    assert.ok(STEP_SLOTS[step], `STEP_SLOTS missing ${step}`);
  }
  const withBenchmark = {
    name: "A",
    category: "Buttermilk",
    ideaDescription: "x",
    f1: {
      benchmark: "Amul Probiotic buttermilk",
      declaredGap: 3,
      gapDerivation: "Differentiation on probiotics",
      growthArgument: "Category growing fast in India",
      growthRoute: "penetration",
      declaredAttribute: "Live probiotic cultures",
      evidenceSourceDate: "2024-06-01",
    },
    f2: {
      mrpOverride: true,
      mrpInr: 35,
      cogsAtScale: 12,
      gstRatePct: 5,
    },
    f4: { techShiftRisk: "" },
    f5: {
      householdsReachedY3Mn: 2,
      trialRatePct: 10,
      repeatConversionPct: 40,
      purchaseFrequencyYr: 6,
      avgPackValueInr: 35,
    },
  };
  const firstMover = {
    name: "B",
    category: "Buttermilk",
    ideaDescription: "x",
    f1: { declaredGap: 0, benchmark: "", growthArgument: "First mover in segment" },
  };
  const emitted = new Set([
    ...expectedResearchSteps(withBenchmark),
    ...expectedResearchSteps(firstMover),
  ]);
  for (const step of EMITTABLE) {
    assert.ok(emitted.has(step), `expectedResearchSteps never emits ${step}`);
  }
});

await check("mergeFindingsByStep: f1Benchmark only keeps prior derivation", () => {
  const previous = {
    f1: {
      assessments: {
        derivation: { status: "ok", raw: { relevance: "adequate" }, returnedSources: [] },
      },
    },
  };
  const neu = {
    f1: {
      assessments: {
        benchmark: { status: "ok", raw: { relevance: "strong" }, returnedSources: [] },
      },
    },
  };
  const merged = mergeFindingsByStep(neu, previous, ["f1Benchmark"]);
  assert.equal(merged.f1.assessments.derivation.status, "ok");
  assert.equal(merged.f1.assessments.benchmark.status, "ok");
});

const { runFilter1ExtraChecks, runF1BenchmarkCheck } = await import("../../lib/f1Research.js");

await check("missing-step retry merges paid benchmark assessment", async () => {
  const doc = benchmarkDoc("missing-retry");
  setCallLlmStub(async () => llmOk("https://retry.example/product"));
  const extra = await runFilter1ExtraChecks(doc, { provider: "claude", onlySteps: ["f1Benchmark"] });
  assert.ok(extra.assessments?.benchmark?.status === "ok");
  const previous = { f1: { benchmarkVerified: false } };
  const merged = mergeFindingsByStep(patchFindingsFromExtra(extra), previous, ["f1Benchmark"], doc);
  assert.equal(merged.f1.assessments.benchmark.status, "ok");
});

await check("unreadable reply → failed, not relevance none", async () => {
  setCallLlmStub(async () => ({ text: "Sure! The benchmark looks fine — no JSON here." }));
  const out = await runF1BenchmarkCheck(benchmarkDoc("unreadable"), { provider: "claude" });
  assert.equal(out.assessment.status, "failed");
  assert.notEqual(out.assessment.raw?.relevance, "none");
});

await check("AI throw → failed with error string", async () => {
  setCallLlmStub(async () => {
    throw new Error("network timeout simulated");
  });
  const out = await runF1BenchmarkCheck(benchmarkDoc("throw"), { provider: "claude" });
  assert.equal(out.assessment.status, "failed");
  assert.match(out.assessment.error, /timeout|network/i);
  assert.notEqual(out.assessment.raw?.relevance, "none");
});

await check("failed benchmark is not cached — second ok run calls LLM again", async () => {
  const doc = benchmarkDoc("not-cached-fail");
  let calls = 0;
  setCallLlmStub(async () => {
    calls += 1;
    if (calls === 1) return { text: "not json at all" };
    return llmOk("https://second-run.example/p");
  });
  const first = await runF1BenchmarkCheck(doc, { provider: "claude" });
  assert.equal(first.assessment.status, "failed");
  const second = await runF1BenchmarkCheck(doc, { provider: "claude" });
  assert.equal(second.assessment.status, "ok");
  assert.ok(calls >= 2, `expected >= 2 LLM calls, got ${calls}`);
});

await check("empty reply → failed", async () => {
  setCallLlmStub(async () => ({ text: "   " }));
  const out = await runF1BenchmarkCheck(benchmarkDoc("empty"), { provider: "claude" });
  assert.equal(out.assessment.status, "failed");
});

await check("reply missing relevance field → failed", async () => {
  setCallLlmStub(async () => ({ text: JSON.stringify({ reason: "no relevance key" }) }));
  const out = await runF1BenchmarkCheck(benchmarkDoc("no-relevance"), { provider: "claude" });
  assert.equal(out.assessment.status, "failed");
});

await check("no lib/ file contains example.com/bench", () => {
  const root = fileURLToPath(new URL("../../lib", import.meta.url));
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".js") || name.endsWith(".mjs")) {
        const body = readFileSync(full, "utf8");
        assert.doesNotMatch(body, /example\.com\/bench/, `forbidden stub URL in ${full}`);
      }
    }
  }
  walk(root);
});

await check("ok benchmark reply is cached on identical second call", async () => {
  const doc = benchmarkDoc("cache-hit");
  let calls = 0;
  setCallLlmStub(async () => {
    calls += 1;
    return llmOk("https://cache-hit.example/p");
  });
  const a = await runF1BenchmarkCheck(doc, { provider: "claude" });
  assert.equal(a.assessment.status, "ok");
  const b = await runF1BenchmarkCheck(doc, { provider: "claude" });
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
});

await check("stampKeptFindings matches mergeFindingsByStep for limited f1Claims", () => {
  const previous = {
    f1: {
      assessments: {
        benchmark: { status: "ok", raw: { relevance: "strong" }, returnedSources: [] },
      },
    },
  };
  const neu = {
    f1: {
      assessments: {
        argument: { status: "ok", raw: { relevance: "adequate" }, returnedSources: [] },
      },
    },
  };
  const limited = ["f1Claims"];
  const a = mergeFindingsByStep(neu, previous, limited);
  const b = stampKeptFindings(neu, previous, limited);
  assert.deepEqual(a.f1.assessments, b.f1.assessments);
});

await check("failed claim check is returned from runFilter1ExtraChecks", async () => {
  const doc = claimDoc("fail-claim");
  setCallLlmStub(async (opts) => {
    if (String(opts.label || "").includes("claim")) {
      return { text: "unparseable claim reply" };
    }
    return llmOk();
  });
  const extra = await runFilter1ExtraChecks(doc, { provider: "claude", onlySteps: ["f1Claims"] });
  const failedSlot = extra.failedSlots?.find((s) => s.step === "f1Claims");
  const argFailed = extra.assessments?.argument?.status === "failed";
  assert.ok(failedSlot || argFailed, "expected failed claim surfaced");
});

console.log(`PASS testAssessmentPipeline (${checks} checks)`);
await suite.drop?.();
process.exit(0);
