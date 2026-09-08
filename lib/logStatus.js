/**
 * Log page status, filter-bar segments, stats, and CSV — browser-safe.
 */
import { isFilterUnlocked } from "./filterUnlock.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6"];

export const LOG_STATUSES = ["OPEN", "CLEARED", "STOPPED", "REVIEW"];

export function classificationOf(doc = {}) {
  return String(doc.classification || doc.goNoGo?.classification || "").trim();
}

export function hasAnyFloorFailure(doc = {}) {
  const checks = doc.advisoryChecks && typeof doc.advisoryChecks === "object" ? doc.advisoryChecks : {};
  if (FILTER_KEYS.slice(0, 4).some((k) => checks[k]?.checkLabel === "Below floor")) return true;
  const labels = doc.checkLabels || doc.goNoGo?.checkLabels || {};
  return FILTER_KEYS.slice(0, 4).some((k) => {
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
    if (check.checkLabel === "Below floor") return "fail";
    if (check.checkLabel === "Cleared") return "pass";
    return "review";
  });
}

const FAIL_STAGE = {
  f1: "Stopped at F1 — gap below floor",
  f2: "Stopped at F2 — margin below floor",
  f3: "Stopped at F3 — price below floor",
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
  return [doc.name, doc.submitterName, doc.submitterDepartment, doc.division, doc.ideaDescription]
    .some((v) => String(v || "").toLowerCase().includes(s));
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

export function applyScopedFilters(rows = [], { teamFilter = "", personFilter = "", searchText = "" } = {}) {
  const team = String(teamFilter || "").trim();
  const person = String(personFilter || "").trim();
  const search = String(searchText || "").trim();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (team && rowTeam(row) !== team) return false;
    if (person && rowPerson(row) !== person) return false;
    if (search && !matchesLogQuery(row, search)) return false;
    return true;
  });
}

export function applyLogStatusFilter(rows = [], status = "ALL") {
  const raw = String(status || "ALL");
  const want = raw === "ai-used" ? "ai-used" : raw.toUpperCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (want === "ALL") return true;
    if (want === "ai-used") return researchWasUsed(row);
    return propositionStatus(row) === want;
  });
}

export function filterLogRows(
  rows = [],
  { query = "", status = "ALL", teamFilter = "", personFilter = "" } = {}
) {
  return applyLogStatusFilter(
    applyScopedFilters(rows, { teamFilter, personFilter, searchText: query }),
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
