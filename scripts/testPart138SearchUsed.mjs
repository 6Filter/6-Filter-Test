/**
 * Part 138 G — `searchUsed` on a stored assessment is set by CODE from the request
 * (Boolean(webSearchEnabled || searchesUsed > 0)), never from the model's JSON.
 * Covers every web-checked type: benchmark, attributes, derivation, parity, route, argument,
 * GST, and the seven Filter 4 dimensions. Also: inputCoverage only calls a web-checked field
 * "assessed" when the stored ok result carries searchUsed:true.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { setCallLlmStub } from "./installCallLlmStub.mjs";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-part138-searchused-"));
process.env.REQUIRE_AUTH = "false";

const { initDb } = await import("../lib/db.js");
await initDb();

const {
  okAssessment,
  failedAssessment,
  searchUsedFromRequest,
  isWebCheckedOk,
  WEB_CHECKED_ASSESSMENT_KEYS,
} = await import("../lib/assessmentResult.js");
const { buildF4Assessment, f4AssessmentsFromResearch } = await import("../lib/f4Assessment.js");
const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js");
const { runF1BenchmarkCheck, runF1ClaimCheck, runF1PlanCheck, runFilter1ExtraChecks } = await import(
  "../lib/f1Research.js"
);
const { runFormatTrend } = await import("../lib/categoryIntelligence/runFormatTrend.js");
const { runCostEstimate } = await import("../lib/filters/runCostEstimate.js");
const { inputCoverage } = await import("../lib/inputCoverage.js");

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

const SOURCE = "https://part138.example/source";

// ---------------------------------------------------------------- pure helper
await check("searchUsedFromRequest reads only code-side inputs", () => {
  assert.equal(searchUsedFromRequest({ webSearchEnabled: true }), true);
  assert.equal(searchUsedFromRequest({ webSearchEnabled: false, searchesUsed: 3 }), true);
  assert.equal(searchUsedFromRequest({ webSearchEnabled: false, searchesUsed: 0 }), false);
  assert.equal(searchUsedFromRequest({}), false);
  // a model-supplied key is not an input
  assert.equal(searchUsedFromRequest({ searchUsed: true }), false);
});

await check("okAssessment ignores a searchUsed the model put in raw", () => {
  const lied = okAssessment({ relevance: "strong", searchUsed: true }, [SOURCE]);
  assert.equal(lied.searchUsed, false);
  assert.equal("searchUsed" in lied.raw, false);
  const honest = okAssessment({ relevance: "strong", searchUsed: false }, [SOURCE], { searchUsed: true });
  assert.equal(honest.searchUsed, true);
  assert.equal(isWebCheckedOk(honest), true);
  assert.equal(isWebCheckedOk(lied), false);
  assert.equal(isWebCheckedOk(failedAssessment("x", { searchUsed: true })), false);
  // legacy stored result without the key never counts as web-checked
  assert.equal(isWebCheckedOk({ status: "ok", raw: { relevance: "strong" }, returnedSources: [] }), false);
});

await check("web-checked key list covers the Part 138 fields", () => {
  for (const k of ["benchmark", "attributes", "derivation", "parity", "route", "argument", "gst"]) {
    assert.ok(WEB_CHECKED_ASSESSMENT_KEYS.includes(k), k);
  }
});

// ------------------------------------------------------------ Filter 1 runners
function f1Doc(tag) {
  return {
    name: `SearchUsed ${tag}`,
    category: "Buttermilk",
    ideaDescription: `Probe idea ${tag}`,
    f1: {
      benchmark: `Amul probiotic ${tag}`,
      declaredGap: 3,
      declaredAttribute: `Specific gut benefit for ${tag} buyers`,
      growthRoute: "penetration",
      growthArgument: `Category growth argument for ${tag} with checkable data`,
      gapDerivation: `We beat on fibre content ${tag}`,
      parityExceptions: `We may lose on price per pack ${tag}`,
    },
    researchFindings: {
      autofillStatus: {
        "f1.declaredAttribute": { aiSuggested: "x", confirmed: true },
        "f1.growthRoute": { aiSuggested: "x", confirmed: true },
        "f1.growthArgument": { aiSuggested: "x", confirmed: true },
        "f1.gapDerivation": { aiSuggested: "x", confirmed: true },
        "f1.parityExceptions": { aiSuggested: "x", confirmed: true },
      },
    },
  };
}

// The model lies in every reply: it claims searchUsed:false (and nested copies).
const modelLiesFalse = {
  searchUsed: false,
  relevance: "strong",
  reason: "Leader",
  source_url: SOURCE,
};
const claimBlock = {
  relevance: "adequate",
  specific: true,
  supported: false,
  source_url: SOURCE,
  quote: "Market grew",
  searchUsed: false,
};

function stub({ webSearchRequests = 0, modelSearchUsed = false } = {}) {
  const seen = [];
  setCallLlmStub(async (opts) => {
    seen.push({ label: opts.label, useWebSearch: opts.useWebSearch });
    const label = String(opts.label || "");
    if (label.includes("benchmark")) {
      return {
        text: JSON.stringify({ ...modelLiesFalse, searchUsed: modelSearchUsed }),
        sources: [SOURCE],
        webSearchRequests,
      };
    }
    if (label.includes("claim")) {
      return {
        text: JSON.stringify({
          searchUsed: modelSearchUsed,
          derivation: { ...claimBlock, searchUsed: modelSearchUsed },
          parity: { ...claimBlock, searchUsed: modelSearchUsed },
          argument: { ...claimBlock, searchUsed: modelSearchUsed },
        }),
        sources: [SOURCE],
        webSearchRequests,
      };
    }
    return {
      text: JSON.stringify({
        searchUsed: modelSearchUsed,
        attributes: { relevance: "strong", specific: true, searchUsed: modelSearchUsed },
        qcom: { relevance: "weak", specific: false },
        route: { matches: "yes", confidence: "high", searchUsed: modelSearchUsed },
      }),
      sources: [SOURCE],
      webSearchRequests,
    };
  });
  return seen;
}

await check("benchmark: searchUsed from the request flag, not the model", async () => {
  const seen = stub({ modelSearchUsed: false });
  const out = await runF1BenchmarkCheck(f1Doc("bench-a"), { provider: "claude" });
  assert.equal(out.assessment.status, "ok");
  assert.equal(seen[0].useWebSearch, true, "benchmark request must enable web search");
  assert.equal(out.assessment.searchUsed, true);
  assert.equal("searchUsed" in out.assessment.raw, false);
});

await check("benchmark: model claiming searchUsed:true cannot create it", async () => {
  // Same request flag → still true; the point is the value never depends on model text.
  stub({ modelSearchUsed: true });
  const out = await runF1BenchmarkCheck(f1Doc("bench-b"), { provider: "claude" });
  assert.equal(out.assessment.searchUsed, true);
  assert.equal("searchUsed" in out.assessment.raw, false);
});

await check("derivation, parity, argument: each its own assessment, searchUsed from request", async () => {
  const seen = stub({ modelSearchUsed: false });
  const out = await runF1ClaimCheck(f1Doc("claims-a"), { provider: "claude" });
  assert.equal(seen[0].useWebSearch, true);
  for (const slot of ["derivation", "parity", "argument"]) {
    assert.ok(out[slot], `${slot} assessment missing`);
    assert.equal(out[slot].status, "ok", slot);
    assert.equal(out[slot].searchUsed, true, `${slot} searchUsed`);
    assert.equal("searchUsed" in out[slot].raw, false, `${slot} raw must not carry model searchUsed`);
  }
  // parity is its own write — not merged into derivation
  assert.notEqual(out.parity, out.derivation);
});

await check("attributes, route (and qcom): searchUsed from request", async () => {
  const seen = stub({ modelSearchUsed: false });
  const out = await runF1PlanCheck(f1Doc("plan-a"), { provider: "claude" });
  assert.equal(seen[0].useWebSearch, true, "plan check must be web-checked");
  assert.equal(out.plan.status, "ok");
  assert.equal(out.plan.searchUsed, true);
});

await check("runFilter1ExtraChecks stores searchUsed:true on all six F1 slots", async () => {
  stub({ modelSearchUsed: false });
  const extra = await runFilter1ExtraChecks(f1Doc("extra-a"), { provider: "claude" });
  for (const slot of ["benchmark", "attributes", "derivation", "parity", "route", "argument"]) {
    const a = extra.assessments[slot];
    assert.ok(a, `${slot} missing`);
    assert.equal(a.status, "ok", slot);
    assert.equal(a.searchUsed, true, `${slot} searchUsed`);
  }
});

await check("provider-reported searches also count; failed results record the request flag", async () => {
  stub({ webSearchRequests: 2, modelSearchUsed: false });
  const out = await runF1BenchmarkCheck(f1Doc("bench-c"), { provider: "claude" });
  assert.equal(out.assessment.searchUsed, true);
  setCallLlmStub(async () => {
    throw new Error("provider error");
  });
  const failed = await runF1BenchmarkCheck(f1Doc("bench-d"), { provider: "claude" });
  assert.equal(failed.assessment.status, "failed");
  assert.equal(failed.assessment.searchUsed, true, "failed request still enabled web search");
  assert.equal(isWebCheckedOk(failed.assessment), false, "a failed result never counts");
});

// ------------------------------------------------------------------ GST
await check("GST assessment: searchUsed from the request flag, not model JSON", async () => {
  const seen = [];
  setCallLlmStub(async (opts) => {
    seen.push({ label: opts.label, useWebSearch: opts.useWebSearch });
    if (opts.useWebSearch) return { text: "Packaged buttermilk GST research notes.", sources: [SOURCE], webSearchRequests: 0 };
    return {
      text: JSON.stringify({
        searchUsed: false,
        estimatedCogsPerUnitInr: 10,
        cogsLowInr: 8,
        cogsHighInr: 12,
        estimatedGstRatePct: 5,
        gstSource: SOURCE,
        gstAsOf: "2026-01-01",
        gstBasis: "Packaged dairy drink slab",
        estimatedGrammage: "200 ml",
      }),
      sources: [],
    };
  });
  const cost = await runCostEstimate({
    ideaText: "Probiotic buttermilk pouch",
    name: "Probe",
    category: "Buttermilk",
    division: "",
    financeGstTable: [],
  });
  assert.ok(seen.some((s) => s.useWebSearch === true), "cost research must run with web search enabled");
  assert.ok(cost.gstAssessment, "cost estimate carries a gst assessment");
  assert.equal(cost.gstAssessment.searchUsed, true);
});

// ------------------------------------------------------------ Filter 4 (7 dims)
function dimsJson({ modelSearchUsed }) {
  const cell = (risk) => ({ risk, reason: `${risk} risk — evidence`, searchUsed: modelSearchUsed });
  return JSON.stringify({
    searchUsed: modelSearchUsed,
    dimensions: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, cell("Low")])),
    sources: [{ title: "x", url: SOURCE }],
  });
}

await check("seven F4 dimensions: searchUsed true when the request enabled web search", async () => {
  const seen = [];
  setCallLlmStub(async (opts) => {
    seen.push({ label: opts.label, useWebSearch: opts.useWebSearch });
    if (opts.useWebSearch) return { text: "Research findings on the format.", sources: [{ title: "s", url: SOURCE }], webSearchRequests: 0 };
    return { text: dimsJson({ modelSearchUsed: false }), sources: [] };
  });
  const out = await runFormatTrend({ ideaText: "Probiotic buttermilk", category: "Buttermilk", persist: false });
  assert.ok(seen.some((s) => s.useWebSearch === true));
  assert.ok(out.assessments, "assessments missing");
  assert.deepEqual(Object.keys(out.assessments).sort(), [...TECH_SHIFT_DIMENSIONS].sort());
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const a = out.assessments[key];
    assert.equal(a.status, "ok", key);
    assert.equal(a.searchUsed, true, `${key} searchUsed`);
    assert.equal(a.raw.rating, "Low", key);
    assert.equal(a.raw.supported, true, key);
    assert.equal(a.raw.source_url, SOURCE, key);
    assert.deepEqual(a.returnedSources.map((s) => s.url || s), [SOURCE]);
  }
});

await check("F4 run with web search off stores searchUsed:false even if the model says true", () => {
  const dims = Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Low", reason: "ok" }]));
  const out = f4AssessmentsFromResearch({
    dimensions: dims,
    sources: [SOURCE],
    webSearchEnabled: false,
    searchesUsed: 0,
    cited: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { source_url: SOURCE, quote: "q", searchUsed: true }])),
  });
  for (const key of TECH_SHIFT_DIMENSIONS) {
    assert.equal(out[key].searchUsed, false, key);
    assert.equal(isWebCheckedOk(out[key]), false, key);
  }
  const b = buildF4Assessment({ rating: "High", supported: true, webSearchEnabled: false, searchesUsed: 0 });
  assert.equal(b.searchUsed, false);
});

await check("F4 failed research writes failed assessments (searchUsed from request), never none", async () => {
  setCallLlmStub(async (opts) => {
    if (opts.useWebSearch) return { text: "Research findings.", sources: [{ title: "s", url: SOURCE }] };
    return { text: "no json here", sources: [] };
  });
  const out = await runFormatTrend({ ideaText: "Probiotic buttermilk", category: "Buttermilk", persist: false });
  assert.equal(out.parsed, null);
  for (const key of TECH_SHIFT_DIMENSIONS) {
    assert.equal(out.assessments[key].status, "failed", key);
    assert.equal(out.assessments[key].searchUsed, true, key);
  }
});

// ---------------------------------------------------------------- coverage
await check("inputCoverage: a web-checked field is assessed only with searchUsed:true", () => {
  const ok = { status: "ok", raw: { relevance: "strong", source_url: SOURCE }, returnedSources: [SOURCE] };
  const doc = (a) => ({ f1: { benchmark: "Amul" }, researchFindings: { f1: { assessments: { benchmark: a } } } });
  const status = (a) => inputCoverage(doc(a)).find((r) => r.field === "f1.benchmark").status;
  assert.equal(status({ ...ok, searchUsed: true }), "assessed");
  assert.equal(status({ ...ok, searchUsed: false }), "pending");
  assert.equal(status(ok), "pending");
  assert.equal(status({ status: "failed", searchUsed: true, error: "boom" }), "failed");
});

console.log(`PASS testPart138SearchUsed (${checks} checks)`);
process.exit(0);
