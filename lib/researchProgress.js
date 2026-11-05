/**
 * Whether a research pass finished every filter it was supposed to run.
 * researchRunAt only separates a draft from a submitted idea.
 * A step counts as done only when it has a result, never because it failed to record an error.
 */
import { isClaimingNoCompetitor } from "./filterChecks.js";
import { usdFromUsage } from "./goldBudget.js";
import { resolveF2Price } from "./mrpFormula.js";
import { isTechShiftRiskUnfilled } from "./techShiftRisk.js";

export const EXPECTED_STEPS = [
  "F1",
  "f1Benchmark",
  "f1Claims",
  "f1Plan",
  "f1Route", // legacy alias kept for old ledgers
  "noCompetitor",
  "F2",
  "F3",
  "F4",
  "F5",
  "evidence",
];

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
  // Part 133: three extra F1 calls (~$0.15–$0.35). Mid estimate folded into list price.
  listPriceUsd: 1.31278715,
  calls: 15,
  callsByStep: {
    F1: 2,
    f1Benchmark: 1,
    f1Claims: 1,
    f1Plan: 1,
    f1Route: 1,
    noCompetitor: 1,
    F2: 2,
    F3: 4,
    F4: 2,
    F5: 2,
    evidence: 1,
  },
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
  if (name.startsWith("f1-benchmark")) return "f1Benchmark";
  if (name.startsWith("f1-claim")) return "f1Claims";
  if (name.startsWith("f1-plan")) return "f1Plan";
  if (name.startsWith("f1-route")) return "f1Route";
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
  if (
    step === "f1Benchmark" ||
    step === "f1Claims" ||
    step === "f1Plan" ||
    step === "f1Route" ||
    step === "F1"
  ) {
    const part = findings?.f1;
    return part && typeof part === "object" ? part : null;
  }
  const key = step.toLowerCase();
  const part = findings?.[key];
  return part && typeof part === "object" ? part : null;
}

/**
 * Part 137 D42 — slots each research step writes. Every expectedResearchSteps
 * name must appear here (f1Route is a legacy alias of f1Plan).
 */
export const STEP_SLOTS = Object.freeze({
  F1: Object.freeze([
    "f1.benchmarkVerified",
    "f1.benchmarkEvidence",
    "f1.categorySizeFound",
    "f1.categorySizeEvidence",
    "f1.attributeValidation",
    "f1.evidence",
    "f1.researchFailed",
    "f1.error",
    "f1.parseFailed",
  ]),
  f1Benchmark: Object.freeze([
    "f1.assessments.benchmark",
    "f1.benchmarkCheck",
    "f1.benchmarkVerified",
    "f1.benchmarkEvidence",
  ]),
  f1Claims: Object.freeze(["f1.assessments.derivation", "f1.assessments.argument", "f1.claimChecks"]),
  f1Plan: Object.freeze([
    "f1.assessments.attributes",
    "f1.assessments.route",
    "f1.routeCheck",
    "f2.assessments.qcom",
  ]),
  f1Route: Object.freeze([
    "f1.assessments.attributes",
    "f1.assessments.route",
    "f1.routeCheck",
    "f2.assessments.qcom",
  ]),
  noCompetitor: Object.freeze(["f1.noCompetitorCheck"]),
  F2: Object.freeze(["f2.costEstimate", "f2.researchFailed", "f2.error", "f2.parseFailed"]),
  F3: Object.freeze([
    "f3.priceEvents",
    "f3.priceEventsFound",
    "f3.priceEvidence",
    "f3.marginElasticityFound",
    "f3.competitiveNote",
    "f3.researchFailed",
    "f3.error",
  ]),
  F4: Object.freeze([
    "f4.techShiftFound",
    "f4.overallRisk",
    "f4.obsolescenceVerdict",
    "f4.threatEvidence",
    "f4.researchFailed",
    "f4.error",
  ]),
  F5: Object.freeze(["f5.sizingFactorsFound", "f5.researchFailed", "f5.error"]),
  evidence: Object.freeze(["evidenceRead", "f1.evidenceRead"]),
});

function pathGet(obj, path) {
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pathSet(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    else cur[p] = { ...cur[p] };
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function cloneFindings(src) {
  if (!src || typeof src !== "object") return {};
  return JSON.parse(JSON.stringify(src));
}

/** Map internal runner names (f1, cost, margin, …) onto ledger step names. */
export function ledgerStepsFromLimited(limited = []) {
  const out = [];
  for (const name of limited) {
    const ledger = STEP_BY_INTERNAL[name] || (EXPECTED_STEPS.includes(name) ? name : "");
    if (ledger && !out.includes(ledger)) out.push(ledger);
  }
  return out;
}

/**
 * Part 137 — key-level merge. A limited run writes only the slots for steps it ran;
 * a result computed in this run is never overwritten by an older one.
 */
export function mergeFindingsByStep(newFindings, previous, limited = [], doc = null) {
  const neu = newFindings && typeof newFindings === "object" ? newFindings : {};
  const prev = previous && typeof previous === "object" ? previous : {};
  const ran = ledgerStepsFromLimited(limited);

  let out;
  if (!ran.length) {
    // Full pass: new findings are authoritative; keep previous slots only when new omitted them.
    out = cloneFindings(neu);
    for (const step of Object.keys(STEP_SLOTS)) {
      for (const slot of STEP_SLOTS[step]) {
        const n = pathGet(neu, slot);
        const p = pathGet(prev, slot);
        if (n === undefined && p !== undefined) pathSet(out, slot, p);
      }
    }
  } else {
    out = cloneFindings(prev);
    for (const step of ran) {
      const slots = STEP_SLOTS[step];
      if (!slots) continue;
      for (const slot of slots) {
        const n = pathGet(neu, slot);
        if (n !== undefined) pathSet(out, slot, n);
      }
    }
    // Preserve non-slot top-level bookkeeping from the new run when present.
    for (const key of ["autofillStatus", "autofillReport", "sources", "inputReview"]) {
      if (neu[key] !== undefined) out[key] = neu[key];
    }
  }
  return stampResearchSteps(out, doc);
}

/** @deprecated name — use mergeFindingsByStep (Part 137). */
export function stampKeptFindings(findings, previous, limited = [], doc = null) {
  return mergeFindingsByStep(findings, previous, limited, doc);
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
  // Part 135 — cliff research is never hand-entered; always runs when a price exists.
  if (step === "F3") return false;
  if (step === "F4") return !isTechShiftRiskUnfilled(doc.f4?.techShiftRisk);
  if (step === "F5") return F5_KEYS.every((key) => filled(doc.f5?.[key]));
  return false;
}

/**
 * Steps a Submit would call. See docs/RESEARCH_STEPS.md.
 * noCompetitor is expected only for an explicit gap of 0 with an empty benchmark (Part 133).
 */
export function expectedResearchSteps(doc = {}) {
  const f1 = doc.f1 || {};
  const steps = [];
  if (!handEntered(doc, "F1")) steps.push("F1");
  const firstMover = isClaimingNoCompetitor(f1, doc.researchFindings?.f1 || {});
  if (firstMover) steps.push("noCompetitor");
  else if (String(f1.benchmark || "").trim()) steps.push("f1Benchmark");
  if (
    String(f1.gapDerivation || "").trim() ||
    String(f1.parityExceptions || "").trim() ||
    String(f1.growthArgument || "").trim()
  ) {
    steps.push("f1Claims");
  }
  if (
    String(f1.growthRoute || "").trim() ||
    String(f1.declaredAttribute || "").trim() ||
    String(doc.f2?.qcomTrajectory || "").trim()
  ) {
    steps.push("f1Plan");
  }
  if (!handEntered(doc, "F2")) steps.push("F2");
  // Part 135 — F3 cliff research only when Filter 2 has a price to test.
  {
    const priced = resolveF2Price(doc.f2 || {});
    if (priced.ok && Number(priced.mrp) > 0) steps.push("F3");
  }
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

function assessmentPresent(a) {
  if (!a || typeof a !== "object") return false;
  if (a.status === "failed") return false;
  if (a.status === "ok") return true;
  return a.raw != null || a.relevance != null;
}

function assessmentFailedSlot(a) {
  return Boolean(a && typeof a === "object" && a.status === "failed");
}

function positiveFinding(findings, step) {
  if (step === "noCompetitor") {
    const check = findings?.f1?.noCompetitorCheck;
    if (!check) return false;
    if (check.researchFailed || check.error || check.parseFailed) return false;
    return true;
  }
  if (step === "evidence") {
    const er = findings?.evidenceRead || findings?.f1?.evidenceRead;
    if (!er) return false;
    if (er.status === "failed" || er.status === "error") return false;
    return er.status === "read" || er.status === "unreadable" || er.status === "none" || er.status === "empty";
  }
  const part = findingsPart(findings, step);
  if (!part) return false;
  if (step === "F1") {
    return (
      part.benchmarkVerified === true ||
      part.benchmarkCheck != null ||
      part.categorySizeFound === true ||
      (Array.isArray(part.attributeValidation) && part.attributeValidation.length > 0) ||
      Boolean(part.benchmarkEvidence || part.categorySizeEvidence || part.evidence)
    );
  }
  if (step === "f1Benchmark") {
    return assessmentPresent(part.assessments?.benchmark) || Boolean(part.benchmarkCheck);
  }
  if (step === "f1Claims") {
    return (
      assessmentPresent(part.assessments?.derivation) ||
      assessmentPresent(part.assessments?.argument) ||
      Boolean(part.claimChecks)
    );
  }
  if (step === "f1Plan" || step === "f1Route") {
    return (
      assessmentPresent(part.assessments?.route) ||
      assessmentPresent(part.assessments?.attributes) ||
      Boolean(part.routeCheck)
    );
  }
  if (step === "F2") {
    const ce = part.costEstimate;
    if (!ce) return false;
    if (ce.status === "failed") return false;
    return true;
  }
  if (step === "F3") {
    if (part.researchFailed || part.error) return false;
    return part.priceEventsFound === true || part.priceEvents != null || part.marginElasticityFound === true;
  }
  if (step === "F4") return part.techShiftFound === true;
  if (step === "F5") return part.sizingFactorsFound === true;
  return false;
}

function stepFailed(findings, step) {
  if (step === "noCompetitor") {
    const check = findings?.f1?.noCompetitorCheck;
    return Boolean(check && (check.researchFailed || check.error || check.parseFailed));
  }
  if (step === "evidence") {
    const er = findings?.evidenceRead || findings?.f1?.evidenceRead;
    return Boolean(er && (er.status === "failed" || er.status === "error" || er.researchFailed));
  }
  const part = findingsPart(findings, step);
  if (step === "f1Benchmark") {
    return assessmentFailedSlot(part?.assessments?.benchmark);
  }
  if (step === "f1Claims") {
    return (
      assessmentFailedSlot(part?.assessments?.derivation) ||
      assessmentFailedSlot(part?.assessments?.argument)
    );
  }
  if (step === "f1Plan" || step === "f1Route") {
    return (
      assessmentFailedSlot(part?.assessments?.attributes) ||
      assessmentFailedSlot(part?.assessments?.route)
    );
  }
  if (step === "F2" && part?.costEstimate?.status === "failed") return true;
  if (step === "F3" && (part?.priceEvents?.status === "failed" || part?.researchFailed)) return true;
  return partFailed(part);
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
