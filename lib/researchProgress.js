/**
 * Whether a research pass finished every filter it was supposed to run.
 * researchRunAt only separates a draft from a submitted idea.
 * A step counts as done only when it has a result, never because it failed to record an error.
 */
import { isClaimingNoCompetitor } from "./filterChecks.js";
import { usdFromUsage } from "./goldBudget.js";
import { isMarginElasticityUnfilled } from "./mrpFormula.js";
import { isTechShiftRiskUnfilled } from "./techShiftRisk.js";

export const EXPECTED_STEPS = ["F1", "noCompetitor", "F2", "F3", "F4", "F5", "evidence"];

const INTERNAL = {
  F1: "f1",
  noCompetitor: "noCompetitor",
  F2: "cost",
  F3: "margin",
  F4: "f4",
  F5: "f5",
  evidence: "evidence",
};

const STEP_BY_INTERNAL = Object.fromEntries(Object.entries(INTERNAL).map(([step, name]) => [name, step]));

const F5_KEYS = [
  "householdsReachedY3Mn",
  "trialRatePct",
  "repeatConversionPct",
  "purchaseFrequencyYr",
  "avgPackValueInr",
];

/**
 * Measured fresh idea: 12 model calls, list price $1.06278715.
 * Two calls each for F1, F2, F4 and F5, four for F3 (price plus volume-loss).
 * Used until the per-label ledger has rows.
 */
export const MEASURED_FRESH_IDEA = {
  source: "measured-fresh-idea",
  listPriceUsd: 1.06278715,
  calls: 12,
  callsByStep: { F1: 2, noCompetitor: 1, F2: 2, F3: 4, F4: 2, F5: 2, evidence: 1 },
};

export function stepCostUsd(step, ledger = null) {
  const fromLedger = ledger && Number(ledger[step]);
  if (Number.isFinite(fromLedger) && fromLedger > 0) return fromLedger;
  const calls = MEASURED_FRESH_IDEA.callsByStep[step] || 0;
  if (!calls) return 0;
  return (MEASURED_FRESH_IDEA.listPriceUsd / MEASURED_FRESH_IDEA.calls) * calls;
}

export function ledgerFromCalls(rows = []) {
  const buckets = {};
  for (const row of rows) {
    const step = stepForLabel(row.label);
    if (!step) continue;
    const bag = buckets[step] || { runs: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
    if (countsAsRun(row.label)) bag.runs += 1;
    bag.inputTokens += Number(row.input_tokens ?? row.inputTokens) || 0;
    bag.outputTokens += Number(row.output_tokens ?? row.outputTokens) || 0;
    bag.cacheRead += Number(row.cache_read_tokens ?? row.cacheRead) || 0;
    bag.cacheWrite += Number(row.cache_write_tokens ?? row.cacheWrite) || 0;
    bag.searches += Number(row.web_searches ?? row.searches) || 0;
    buckets[step] = bag;
  }
  const usd = {};
  for (const [step, bag] of Object.entries(buckets)) {
    if (!bag.runs) continue;
    usd[step] = usdFromUsage(bag) / bag.runs;
  }
  return Object.keys(usd).length ? usd : null;
}

function stepForLabel(label) {
  const name = String(label || "");
  if (name.startsWith("filter1")) return "F1";
  if (name.startsWith("no-competitor")) return "noCompetitor";
  if (name.startsWith("f2-cost")) return "F2";
  if (name.startsWith("f3-")) return "F3";
  if (name.startsWith("filter4")) return "F4";
  if (name.startsWith("f5-")) return "F5";
  if (name.startsWith("evidence")) return "evidence";
  return "";
}

function countsAsRun(label) {
  const name = String(label || "");
  return (
    name === "filter1" ||
    name === "no-competitor" ||
    name === "f2-cost" ||
    name === "filter4" ||
    name === "f5-sizing" ||
    name === "f3-category-avg-price"
  );
}

function partFailed(part) {
  if (!part || typeof part !== "object") return false;
  if (part.researchFailed) return true;
  if (part.error) return true;
  if (part.parseFailed) return true;
  if (part.stopReason === "max_tokens") return true;
  return false;
}

function findingsPart(findings, step) {
  const key = step.toLowerCase();
  const part = findings?.[key];
  return part && typeof part === "object" ? part : null;
}

export function stampKeptFindings(findings, previous, limited = [], doc = null) {
  const next = findings && typeof findings === "object" ? { ...findings } : {};
  const prev = previous && typeof previous === "object" ? previous : {};
  const keep = { f1: "f1", f2: "cost", f3: "margin", f4: "f4", f5: "f5" };
  if (limited.length) {
    for (const [key, step] of Object.entries(keep)) {
      if (!limited.includes(step) && prev[key]) next[key] = prev[key];
    }
  }
  return stampResearchSteps(next, doc);
}

function filled(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * A value the person already typed is not a missing research step —
 * except Filter 1: attribute / benchmark / gap are research *inputs*
 * that must still be web-verified. Typing them must not skip F1 search.
 */
export function handEntered(doc = {}, step) {
  if (step === "F1") return false;
  if (step === "F2") return filled(doc.f2?.cogsAtScale) && filled(doc.f2?.netMarginAtScale);
  if (step === "F3") return !isMarginElasticityUnfilled(doc.f3?.marginElasticity);
  if (step === "F4") return !isTechShiftRiskUnfilled(doc.f4?.techShiftRisk);
  if (step === "F5") return F5_KEYS.every((key) => filled(doc.f5?.[key]));
  return false;
}

/**
 * Steps a Submit would call. See docs/RESEARCH_STEPS.md.
 * noCompetitor is expected only for a gap of 0 or blank with no verified benchmark.
 */
export function expectedResearchSteps(doc = {}) {
  const steps = [];
  if (!handEntered(doc, "F1")) steps.push("F1");
  if (isClaimingNoCompetitor(doc.f1 || {}, doc.researchFindings?.f1 || {})) steps.push("noCompetitor");
  if (!handEntered(doc, "F2")) steps.push("F2");
  if (!handEntered(doc, "F3")) steps.push("F3");
  if (!handEntered(doc, "F4")) steps.push("F4");
  if (!handEntered(doc, "F5")) steps.push("F5");
  const hasEvidence =
    Boolean(doc?.f1?.evidenceSourceFile?.fileId || doc?.f1?.evidenceSourceFile?.data || doc?.f1?.evidenceSourceFile?.name) ||
    Boolean(String(doc?.f1?.evidenceSourceDate || "").trim());
  if (hasEvidence) steps.push("evidence");
  return steps;
}

export function shouldRunStep(doc = {}, internalName, { forceFresh = false } = {}) {
  const step = STEP_BY_INTERNAL[internalName];
  if (!step) return true;
  if (handEntered(doc, step)) return false;
  if (forceFresh) return true;
  return expectedResearchSteps(doc).includes(step);
}

export function stampResearchSteps(findings = {}, doc = null) {
  const expected = doc ? expectedResearchSteps(doc) : ["F1", "F2", "F3", "F4"];
  const done = [];
  const failed = [];
  for (const step of expected) {
    if (stepFailed(findings, step)) failed.push(step);
    else if (positiveFinding(findings, step)) done.push(step);
  }
  return {
    ...findings,
    stepsExpected: expected,
    stepsDone: done,
    stepsFailed: failed,
  };
}

function positiveFinding(findings, step) {
  if (step === "noCompetitor") return Boolean(findings?.f1?.noCompetitorCheck);
  if (step === "evidence") {
    const er = findings?.evidenceRead || findings?.f1?.evidenceRead;
    return er && (er.status === "read" || er.status === "unreadable" || er.status === "none");
  }
  const part = findingsPart(findings, step);
  if (!part) return false;
  if (step === "F1") {
    // D8/D9 may leave benchmark/size open even after a successful research pass.
    return (
      part.benchmarkVerified === true ||
      part.categorySizeFound === true ||
      (Array.isArray(part.attributeValidation) && part.attributeValidation.length > 0) ||
      Boolean(part.benchmarkEvidence || part.categorySizeEvidence || part.evidence)
    );
  }
  if (step === "F2") return Boolean(part.costEstimate);
  if (step === "F3") return part.marginElasticityFound === true;
  if (step === "F4") return part.techShiftFound === true;
  if (step === "F5") return part.sizingFactorsFound === true;
  return false;
}

function stepFailed(findings, step) {
  if (step === "noCompetitor") {
    const check = findings?.f1?.noCompetitorCheck;
    return Boolean(check && (check.researchFailed || check.error || check.parseFailed));
  }
  if (step === "evidence") return false;
  return partFailed(findingsPart(findings, step));
}

export function researchPassFinished(findings) {
  if (!findings || typeof findings !== "object") return false;
  const expected = Array.isArray(findings.stepsExpected) ? findings.stepsExpected : null;
  if (!expected) return false;
  const done = new Set(Array.isArray(findings.stepsDone) ? findings.stepsDone : []);
  const failed = new Set(Array.isArray(findings.stepsFailed) ? findings.stepsFailed : []);
  return expected.every((step) => done.has(step) || failed.has(step));
}

function hasLedger(findings) {
  return Array.isArray(findings?.stepsExpected) && findings.stepsExpected.length > 0;
}

function legacyDone(doc, step) {
  if (step === "noCompetitor") return Boolean(doc.researchFindings?.f1?.noCompetitorCheck);
  return handEntered(doc, step);
}

export function planResearch(doc = {}, ledger = null) {
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  if (hasLedger(findings)) {
    const expected = findings.stepsExpected.filter((step) => EXPECTED_STEPS.includes(step));
    const failed = (Array.isArray(findings.stepsFailed) ? findings.stepsFailed : []).filter((step) => expected.includes(step));
    const done = (Array.isArray(findings.stepsDone) ? findings.stepsDone : []).filter((step) => expected.includes(step) && !failed.includes(step));
    const missing = expected.filter((step) => !done.includes(step) && !failed.includes(step));
    if (failed.length) return finish("failed", [...failed, ...missing], ledger);
    if (missing.length) return finish("incomplete", missing, ledger);
    return finish("complete", [], ledger);
  }
  if (!doc.researchRunAt) return finish("draft", expectedResearchSteps(doc), ledger);
  const expected = expectedResearchSteps(doc);
  const failed = [];
  const done = [];
  for (const step of expected) {
    if (stepFailed(findings, step)) failed.push(step);
    else if (legacyDone(doc, step)) done.push(step);
  }
  const missing = expected.filter((step) => !done.includes(step) && !failed.includes(step));
  if (failed.length) return finish("failed", [...failed, ...missing], ledger);
  if (missing.length) return finish("incomplete", missing, ledger);
  return finish("complete", [], ledger);
}

export function uiResearchState(doc = {}, ledger = null) {
  return planResearch(doc, ledger).researchState;
}

function finish(researchState, steps, ledger) {
  const priced = steps.map((step) => ({ step, usd: stepCostUsd(step, ledger) }));
  const usd = priced.reduce((sum, row) => sum + row.usd, 0);
  return {
    researchState,
    steps,
    internalSteps: steps.map((step) => INTERNAL[step]).filter(Boolean),
    usd,
    costSource: ledger ? "per-label ledger" : MEASURED_FRESH_IDEA.source,
  };
}

export function missingStepsCostPreview(steps = []) {
  const usd = steps.reduce((sum, step) => sum + stepCostUsd(step), 0);
  const list = steps.length ? steps.join(", ") : "none";
  return (
    `Run missing steps only: ${list}. Estimated list price $${usd.toFixed(2)}, ` +
    "from the measured fresh idea ($1.06 across 12 calls) until the per-label ledger has rows. " +
    "Steps that already have a result are not called again."
  );
}

export async function refuseModelCall() {
  throw new Error("Research planning does not call the model.");
}

/** Test double for Submit. Runs only the planned steps, then stamps the ledger. */
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
  if (calls.includes("F3")) findings.f3 = { ...(findings.f3 || {}), marginElasticityFound: true, researchFailed: false };
  if (calls.includes("F4")) findings.f4 = { ...(findings.f4 || {}), techShiftFound: true, researchFailed: false };
  if (calls.includes("F5")) findings.f5 = { ...(findings.f5 || {}), sizingFactorsFound: true, researchFailed: false };
  if (calls.includes("F1")) findings.f1 = { ...(findings.f1 || {}), benchmarkVerified: true, researchFailed: false };
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
