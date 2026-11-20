/**
 * Counts of unfinished research, for an Admin diagnostic.
 * No idea text, names, files or secrets — only counts by filter, cause and date.
 */
import { planResearch } from "./researchProgress.js";
import { propositionEvaluationState } from "./evaluationStatus.js";
import { redactSecrets } from "./http.js";

export const CAUSES = Object.freeze([
  "provider_error",
  "rate_limit",
  "timeout",
  "malformed_output",
  "guard_refusal",
  "never_started",
]);

export const FILTERS = Object.freeze(["F1", "F2", "F3", "F4", "F5"]);

const STEP_FILTER = Object.freeze({
  F1: "F1",
  f1Benchmark: "F1",
  f1Claims: "F1",
  f1Plan: "F1",
  f1Route: "F1",
  noCompetitor: "F1",
  evidence: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
});

const ERROR_KEYS = new Set([
  "error",
  "researchFailed",
  "parseFailed",
  "failureKind",
  "stopReason",
  "status",
  "code",
  "message",
  "reason",
]);

function isErrorKey(key) {
  return ERROR_KEYS.has(key) || /fail|error|refus|timeout|limit|invalid|guard|malform/i.test(key);
}

function keepSignal(key, value) {
  if (value == null || value === false) return false;
  if (key === "status") return /fail|error/i.test(String(value));
  if (key === "stopReason") return /max_tokens|length/i.test(String(value));
  if (typeof value === "boolean") return value === true;
  return true;
}

function zeroMap(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

function filterOf(step) {
  return STEP_FILTER[step] || "";
}

/** Pull only error-shaped fields so idea text and quotes never enter the classifier. */
export function errorSignals(value, depth = 0, out = []) {
  if (depth > 6 || value == null) return out;
  if (typeof value === "string") {
    out.push(value.slice(0, 240));
    return out;
  }
  if (typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) errorSignals(item, depth + 1, out);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    if (!isErrorKey(key)) continue;
    if (!keepSignal(key, child)) continue;
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      out.push(String(child).slice(0, 240));
    } else {
      errorSignals(child, depth + 1, out);
    }
  }
  return out;
}

export function classifyCause(signals = []) {
  const joined = signals.filter(Boolean).join(" ");
  if (!joined.trim()) return "never_started";
  const blob = redactSecrets(joined).toLowerCase();
  if (/\b429\b|rate limit|too many requests|overloaded|slow_down|resource_exhausted/.test(blob)) return "rate_limit";
  if (/\btimeout\b|timed out|etimedout|aborted|deadline exceeded/.test(blob)) return "timeout";
  if (/malformed|parsefailed|parse failed|truncated|max_tokens|json_fail|not valid json/.test(blob)) return "malformed_output";
  if (/placeholder|input-invalid|guard|refused|junk|not a real answer/.test(blob)) return "guard_refusal";
  return "provider_error";
}

function signalsForStep(findings, step) {
  if (!findings || typeof findings !== "object") return [];
  if (step === "noCompetitor") return errorSignals(findings.f1?.noCompetitorCheck);
  if (step === "evidence") return errorSignals(findings.evidenceRead || findings.f1?.evidenceRead);
  if (step === "F1" || step.startsWith("f1")) return errorSignals(findings.f1);
  if (step === "F2") return errorSignals(findings.f2 || findings.cost);
  if (step === "F3") return errorSignals(findings.f3 || findings.margin);
  if (step === "F4") return errorSignals(findings.f4);
  if (step === "F5") return errorSignals(findings.f5);
  return errorSignals(findings);
}

export function indiaDay(iso) {
  if (!iso) return "unknown";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function classifyDoc(doc = {}) {
  const plan = planResearch(doc);
  const unfinished = plan.researchState === "incomplete" || plan.researchState === "failed";
  const filters = new Set();
  const causes = new Set();
  if (unfinished) {
    const steps = Array.isArray(plan.steps) && plan.steps.length ? plan.steps : ["F1"];
    for (const step of steps) {
      const filter = filterOf(step);
      if (filter) filters.add(filter);
      causes.add(classifyCause(signalsForStep(doc.researchFindings, step)));
    }
    if (!filters.size) filters.add("F1");
    if (!causes.size) causes.add("never_started");
  }
  const evalState = propositionEvaluationState(doc);
  return {
    unfinished,
    researchState: plan.researchState,
    evaluated: evalState === "evaluated" || evalState === "legacy",
    filters: [...filters],
    causes: [...causes],
    day: indiaDay(doc.researchRunAt || doc.updatedAt || doc.createdAt),
  };
}

export function summariseIncomplete(docs = []) {
  const byFilter = zeroMap(FILTERS);
  const byCause = zeroMap(CAUSES);
  const byDate = {};
  const byFilterAndCause = Object.fromEntries(FILTERS.map((f) => [f, zeroMap(CAUSES)]));
  let incomplete = 0;
  let healthIncomplete = 0;
  let failed = 0;
  let evaluated = 0;
  let incompleteAmongEvaluated = 0;
  for (const doc of docs) {
    const row = classifyDoc(doc);
    if (row.evaluated) evaluated += 1;
    if (row.researchState === "incomplete") healthIncomplete += 1;
    if (row.researchState === "failed") failed += 1;
    if (!row.unfinished) continue;
    incomplete += 1;
    if (row.evaluated) incompleteAmongEvaluated += 1;
    for (const filter of row.filters) {
      if (byFilter[filter] != null) byFilter[filter] += 1;
      for (const cause of row.causes) {
        if (byFilterAndCause[filter]?.[cause] != null) byFilterAndCause[filter][cause] += 1;
      }
    }
    for (const cause of row.causes) {
      if (byCause[cause] != null) byCause[cause] += 1;
    }
    byDate[row.day] = (byDate[row.day] || 0) + 1;
  }
  const shareOfEvaluated = evaluated ? incompleteAmongEvaluated / evaluated : 0;
  return {
    timezone: "Asia/Kolkata",
    incomplete,
    healthIncomplete,
    failed,
    evaluated,
    incompleteAmongEvaluated,
    shareOfEvaluated,
    byFilter,
    byCause,
    byDate,
    byFilterAndCause,
  };
}
