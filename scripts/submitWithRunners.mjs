/**
 * Part 137 — test helper only. Never import from production lib/.
 * Runs planned research steps via injected runners, then stamps the ledger.
 */
import {
  planResearch,
  refuseModelCall,
  researchPassFinished,
  shouldRunStep,
  stampResearchSteps,
} from "../lib/researchProgress.js";

const INTERNAL = {
  F1: "f1",
  f1Benchmark: "f1Benchmark",
  f1Claims: "f1Claims",
  f1Plan: "f1Plan",
  f1Route: "f1Route",
  noCompetitor: "noCompetitor",
  F2: "cost",
  F3: "margin",
  F4: "f4",
  F5: "f5",
  evidence: "evidence",
};

/**
 * @param {object} doc
 * @param {Record<string, Function>} runners
 * @param {{ confirm?: Function }} [opts]
 */
export async function submitWithRunners(doc, runners = {}, { confirm } = {}) {
  const plan = planResearch(doc);
  if (plan.researchState === "complete" || !plan.steps.length) {
    return { doc, calls: [] };
  }
  if (plan.researchState === "incomplete" && typeof confirm === "function") {
    const ok = await confirm(plan);
    if (!ok) return { doc, calls: [], declined: true };
  }
  const calls = [];
  for (const step of plan.steps) {
    if (!shouldRunStep(doc, INTERNAL[step] || step)) continue;
    const run = runners[step];
    if (typeof run !== "function") await refuseModelCall();
    calls.push(step);
    await run();
  }
  const findings = { ...(doc.researchFindings || {}) };
  if (calls.includes("F3")) {
    findings.f3 = {
      ...(findings.f3 || {}),
      priceEventsFound: true,
      marginElasticityFound: findings.f3?.marginElasticityFound === true,
      researchFailed: false,
    };
  }
  if (calls.includes("F4")) findings.f4 = { ...(findings.f4 || {}), techShiftFound: true, researchFailed: false };
  if (calls.includes("F5")) findings.f5 = { ...(findings.f5 || {}), sizingFactorsFound: true, researchFailed: false };
  if (calls.includes("F1")) findings.f1 = { ...(findings.f1 || {}), benchmarkVerified: true, researchFailed: false };
  if (calls.includes("f1Benchmark")) {
    findings.f1 = {
      ...(findings.f1 || {}),
      assessments: {
        ...(findings.f1?.assessments || {}),
        benchmark: findings.f1?.assessments?.benchmark || {
          status: "ok",
          raw: { relevance: "strong", source_url: "https://example.com/bench" },
          returnedSources: ["https://example.com/bench"],
        },
      },
      benchmarkCheck: findings.f1?.benchmarkCheck || {
        status: "relevant",
        source_url: "https://example.com/bench",
      },
      researchFailed: false,
    };
  }
  if (calls.includes("f1Claims")) {
    findings.f1 = {
      ...(findings.f1 || {}),
      assessments: {
        ...(findings.f1?.assessments || {}),
        derivation: findings.f1?.assessments?.derivation || {
          status: "ok",
          raw: { relevance: "adequate", specific: true, supported: false },
          returnedSources: [],
        },
        argument: findings.f1?.assessments?.argument || {
          status: "ok",
          raw: { relevance: "adequate", specific: true, supported: false },
          returnedSources: [],
        },
      },
      claimChecks: findings.f1?.claimChecks || {
        gapDerivation: { verdict: "unverified" },
        growthArgument: { verdict: "unverified" },
      },
    };
  }
  if (calls.includes("f1Plan") || calls.includes("f1Route")) {
    findings.f1 = {
      ...(findings.f1 || {}),
      assessments: {
        ...(findings.f1?.assessments || {}),
        attributes: findings.f1?.assessments?.attributes || {
          status: "ok",
          raw: { relevance: "strong", specific: true },
        },
        route: findings.f1?.assessments?.route || {
          status: "ok",
          raw: { matches: "yes", confidence: "high", expected: "penetration" },
        },
      },
      routeCheck: findings.f1?.routeCheck || {
        matches: "yes",
        confidence: "high",
        expected: "penetration",
        reason: "test stub",
      },
    };
  }
  if (calls.includes("F2")) findings.f2 = { ...(findings.f2 || {}), costEstimate: { cogsAtScale: 1 }, researchFailed: false };
  const stamped = stampResearchSteps(findings, doc);
  const finished = researchPassFinished(stamped);
  return {
    doc: {
      ...doc,
      researchRunAt: finished ? doc.researchRunAt || new Date(0).toISOString() : doc.researchRunAt || null,
      researchFindings: stamped,
    },
    calls,
  };
}
