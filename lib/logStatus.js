/**
 * Log page status, filter-bar segments, stats, and CSV — browser-safe.
 */
import { isFilterUnlocked } from "./filterUnlock.js";
import { rowCategoryGroup } from "./categoryGroup.js";
import { uiResearchState } from "./researchProgress.js";
import { teamIsLegacy } from "./propositionFields.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];

export const LOG_STATUSES = ["OPEN", "CLEARED", "STOPPED", "REVIEW"];

export function classificationOf(doc = {}) {
  return String(doc.classification || doc.goNoGo?.output?.classification || doc.goNoGo?.classification || "").trim();
}

/** Part 136 — list/row evaluation state from API annotation. */
export function rowEvaluationState(row = {}) {
  const fromApi = String(row.evaluationState || "").trim();
  if (fromApi) return fromApi;
  if (row?.goNoGo?.output?.sealedAt) return "evaluated";
  const go = row?.goNoGo;
  if (Boolean(String(go?.classification || "").trim()) && Number(go?.score?.total) > 0) return "legacy";
  if (Boolean(String(row.classification || "").trim()) && !row.evaluationMissing?.length) return "legacy";
  const ui = uiResearchState(row);
  if (ui === "incomplete") return "incomplete";
  if (researchWasUsed(row)) return "incomplete";
  return "not-evaluated";
}

/** Status pill text for the log table (not the OPEN/CLEARED chip). */
export function rowEvaluationPill(row = {}) {
  const state = rowEvaluationState(row);
  if (state === "not-evaluated") return { state, label: "Not evaluated", verdict: "" };
  if (state === "incomplete") return { state, label: "Incomplete", verdict: "" };
  const verdict = classificationOf(row);
  if (state === "legacy" || state === "evaluated") {
    const pct = Number(row.goNoGo?.output?.score?.pct ?? row.goNoGo?.score?.pct);
    return {
      state,
      label: verdict || "—",
      verdict,
      pct: Number.isFinite(pct) ? pct : null,
      legacy: state === "legacy",
    };
  }
  return { state, label: verdict || "Not evaluated", verdict: "" };
}

export function rowCanExportOutputPdf(row = {}) {
  const state = rowEvaluationState(row);
  return state === "evaluated" || state === "legacy";
}

/** Hard-stop filters only — Part 134/135: F2 and F3 are mark-downs, never floor stops. */
const FLOOR_FAILURE_KEYS = ["f1", "f4"];

export function hasAnyFloorFailure(doc = {}) {
  const checks = doc.advisoryChecks && typeof doc.advisoryChecks === "object" ? doc.advisoryChecks : {};
  if (FLOOR_FAILURE_KEYS.some((k) => checks[k]?.checkLabel === "Below floor")) return true;
  const labels = doc.checkLabels || doc.goNoGo?.checkLabels || {};
  return FLOOR_FAILURE_KEYS.some((k) => {
    const raw = labels[k];
    const label = typeof raw === "string" ? raw : raw?.checkLabel;
    return label === "Below floor";
  });
}

export function hasManagerApprovalOn(doc = {}) {
  return Boolean(String(doc.managerApproval?.comment || doc.managerReview?.comment || "").trim());
}

export function managerReviewRequestedOn(doc = {}) {
  return Boolean(doc.managerReviewRequested || doc.managerReview?.requestedAt);
}

export function propositionStatus(doc = {}) {
  if (doc.finalSummary?.summaryText || doc.finalSummary) return "CLEARED";
  if (classificationOf(doc) === "NO-GO" || hasAnyFloorFailure(doc)) return "STOPPED";
  if (classificationOf(doc) === "WATCH" && managerReviewRequestedOn(doc) && !hasManagerApprovalOn(doc)) {
    return "REVIEW";
  }
  return "OPEN";
}

export function compactAdvisoryForLog(doc = {}, advisoryChecks = {}) {
  const out = {};
  for (const key of FILTER_KEYS) {
    if ((key === "f5" || key === "f6") && !isFilterUnlocked(key, doc)) {
      out[key] = { checkLabel: key === "f6" ? "Awaiting panels" : "Locked" };
      continue;
    }
    out[key] = { checkLabel: advisoryChecks[key]?.checkLabel || "Evidence missing" };
  }
  return out;
}

export function checkLabelsFromAdvisory(advisoryChecks = {}) {
  const out = {};
  for (const key of FILTER_KEYS) {
    const label = advisoryChecks[key]?.checkLabel;
    if (label) out[key] = label;
  }
  return out;
}

export function advisoryChecksFromLabels(labels) {
  if (!labels || typeof labels !== "object") return {};
  const out = {};
  for (const key of FILTER_KEYS) {
    const raw = labels[key];
    const label = typeof raw === "string" ? raw : raw?.checkLabel;
    if (label) out[key] = { checkLabel: label };
  }
  return out;
}

export function filterSegments(doc, advisoryChecks) {
  const checks = advisoryChecks || doc?.advisoryChecks || {};
  return FILTER_KEYS.map((key) => {
    const check = checks[key];
    if (!check || check.checkLabel === "Locked" || check.checkLabel === "Awaiting panels") return "none";
    // F2/F3 never hard-stop; "Marked down" / legacy "Below floor" on them are review, not fail.
    if (
      (key === "f2" || key === "f3") &&
      (check.checkLabel === "Below floor" || check.checkLabel === "Marked down")
    ) {
      return "review";
    }
    if (check.checkLabel === "Below floor") return "fail";
    if (check.checkLabel === "Cleared") return "pass";
    return "review";
  });
}

const FAIL_STAGE = {
  f1: "Stopped at F1 — gap below floor",
  f4: "Stopped at F4 — tech-shift floor",
};

export function filterStageLabel(doc = {}, advisoryChecks, segments) {
  const checks = advisoryChecks || doc.advisoryChecks || {};
  const segs = segments || filterSegments(doc, checks);
  const status = propositionStatus(doc);
  if (status === "CLEARED") return "Cleared all six";
  const failIdx = segs.findIndex((s) => s === "fail");
  if (failIdx >= 0) {
    return FAIL_STAGE[FILTER_KEYS[failIdx]] || `Stopped at ${FILTER_KEYS[failIdx].toUpperCase()}`;
  }
  if (status === "REVIEW") return "Waiting on manager review";
  const reviewIdx = segs.findIndex((s) => s === "review");
  if (reviewIdx >= 0) return `${FILTER_KEYS[reviewIdx].toUpperCase()} in review`;
  const noneIdx = segs.findIndex((s) => s === "none");
  if (noneIdx === 5) return "At prototype panel";
  if (noneIdx === 4) return "At revenue target";
  if (noneIdx >= 0) return `${FILTER_KEYS[noneIdx].toUpperCase()} not yet open`;
  if (segs.every((s) => s === "pass")) return "Filters cleared — awaiting close";
  return "In progress";
}

export function logStats(rows = [], now = Date.now()) {
  const monthStart = new Date(now);
  monthStart.setFullYear(monthStart.getFullYear(), monthStart.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthMs = monthStart.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let submittedThisMonth = 0;
  let cleared = 0;
  let open = 0;
  let staleOpen = 0;
  let stopped = 0;
  let review = 0;
  for (const row of rows) {
    const created = new Date(row.createdAt || row.updatedAt || 0).getTime();
    if (Number.isFinite(created) && created >= monthMs) submittedThisMonth += 1;
    const status = propositionStatus(row);
    if (status === "CLEARED") cleared += 1;
    else if (status === "STOPPED") stopped += 1;
    else if (status === "REVIEW") review += 1;
    else {
      open += 1;
      const updated = new Date(row.updatedAt || row.createdAt || 0).getTime();
      if (Number.isFinite(updated) && now - updated >= weekMs) staleOpen += 1;
    }
  }
  return {
    submittedThisMonth,
    cleared,
    clearedRate: rows.length ? Math.round((100 * cleared) / rows.length) : 0,
    open,
    staleOpen,
    stopped,
    review,
    total: rows.length,
  };
}

export function matchesLogQuery(doc = {}, query = "") {
  const s = String(query || "").trim().toLowerCase();
  if (!s) return true;
  return [
    doc.name,
    doc.submitterName,
    doc.submitterDepartment,
    doc.division,
    doc.category,
    rowCategoryGroup(doc),
    doc.ideaDescription,
  ].some((v) => String(v || "").toLowerCase().includes(s));
}

/** True only after the once-only Submit research pass (Part 25). */
export function researchWasUsed(doc = {}) {
  return Boolean(doc.researchRunAt);
}

/** Blank name, blank idea, and never researched — safe to bulk-remove. */
export function isUntouchedDraft(doc = {}) {
  if (researchWasUsed(doc)) return false;
  const name = String(doc.name || "").trim();
  const idea = String(doc.ideaDescription || "").trim();
  return !name && !idea;
}

export function rowTeam(doc = {}) {
  return String(doc.submitterDepartment || doc.department || "").trim();
}

/** Temporary: September 2026 submissions stay visible on every team's Log. */
export function isSeptember2026Submission(doc = {}) {
  const created = Date.parse(doc.createdAt || doc.ts || "");
  if (!Number.isFinite(created)) return false;
  const label = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(created));
  return label === "2026-09";
}

export function rowPerson(doc = {}) {
  return String(doc.submitterName || "").trim();
}

export function uniqueLogValues(rows = [], pick) {
  const seen = new Set();
  for (const row of rows) {
    const value = String(pick(row) || "").trim();
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function applyScopedFilters(
  rows = [],
  { teamFilter = "", personFilter = "", categoryGroupFilter = "", searchText = "" } = {}
) {
  const team = String(teamFilter || "").trim();
  const person = String(personFilter || "").trim();
  const group = String(categoryGroupFilter || "").trim();
  const search = String(searchText || "").trim();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (team === "__legacy__") {
      if (!teamIsLegacy(rowTeam(row))) return false;
    } else if (team && rowTeam(row) !== team) {
      return false;
    }
    if (person && rowPerson(row) !== person) return false;
    if (group && rowCategoryGroup(row) !== group) return false;
    if (search && !matchesLogQuery(row, search)) return false;
    return true;
  });
}

export function applyLogStatusFilter(rows = [], status = "ALL") {
  const raw = String(status || "ALL");
  const want = raw === "ai-used" || raw === "incomplete" ? raw : raw.toUpperCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (want === "ALL") return true;
    if (want === "ai-used") return researchWasUsed(row);
    if (want === "incomplete") return uiResearchState(row) === "incomplete";
    if (want === "GO" || want === "NO-GO" || want === "WATCH" || want === "INCOMPLETE") {
      const state = rowEvaluationState(row);
      if (state !== "evaluated" && state !== "legacy") return false;
      return classificationOf(row) === want;
    }
    return propositionStatus(row) === want;
  });
}

/** Filter by Go/No-Go/WATCH classification (empty classification only in ALL). */
export function applyVerdictFilter(rows = [], verdict = "ALL") {
  const want = String(verdict || "ALL").trim().toUpperCase();
  if (!want || want === "ALL") return Array.isArray(rows) ? rows : [];
  const normalized = want === "NOGO" ? "NO-GO" : want;
  return (Array.isArray(rows) ? rows : []).filter((row) => classificationOf(row) === normalized);
}

export function rowSubmittedMonthKey(row = {}) {
  const iso = row.createdAt || row.created_at || row.updatedAt || row.updated_at || "";
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey) {
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(monthKey || "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(m[2]) - 1;
  return `${months[idx] || m[2]} ${m[1]}`;
}

export function uniqueMonthKeys(rows = []) {
  const set = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = rowSubmittedMonthKey(row);
    if (key) set.add(key);
  }
  return [...set].sort().reverse();
}

export function applyMonthFilter(rows = [], monthKey = "") {
  const want = String(monthKey || "").trim();
  if (!want) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => rowSubmittedMonthKey(row) === want);
}

export function filterLogRows(
  rows = [],
  { query = "", status = "ALL", teamFilter = "", personFilter = "", categoryGroupFilter = "" } = {}
) {
  return applyLogStatusFilter(
    applyScopedFilters(rows, { teamFilter, personFilter, categoryGroupFilter, searchText: query }),
    status
  );
}

export function submittedParts(iso, nowTz) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const date = d.toLocaleDateString(nowTz, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(nowTz, { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

export function propositionsToCsv(rows) {
  const header = ["Status", "Research", "Proposition", "Owner", "Department", "Idea", "Stage", "Submitted"];
  const lines = rows.map((r) =>
    [r.status, r.research, r.name, r.owner, r.dept, r.idea, r.stage, `${r.date} ${r.time}`]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function logRowForCsv(doc) {
  const checks = doc.advisoryChecks || advisoryChecksFromLabels(doc.goNoGo?.checkLabels);
  const when = submittedParts(doc.createdAt || doc.updatedAt);
  return {
    status: propositionStatus(doc),
    research: researchWasUsed(doc) ? "AI used" : "No API calls",
    name: doc.name || "Untitled idea",
    owner: doc.submitterName || "",
    dept: doc.division || doc.submitterDepartment || "",
    idea: doc.ideaDescription || "",
    stage: filterStageLabel(doc, checks),
    date: when.date,
    time: when.time,
  };
}

export function databaseUnavailableMessage(error) {
  return /database unavailable/i.test(String(error || ""));
}
