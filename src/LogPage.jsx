import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileDown, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  exportPropositionsToExcel,
  resolveFullPropositions,
} from "../lib/logExport.js";
import { exportMonthPropositionsPdf, exportPropositionOutputPdf } from "./exportGoNoGoPdf.jsx";
import { exportMonthInputsPdf, exportPropositionInputsPdf } from "./exportInputsPdf.jsx";
import {
  applyLogStatusFilter,
  applyMonthFilter,
  applyScopedFilters,
  classificationOf,
  filterSegments,
  filterStageLabel,
  formatMonthLabel,
  isSubmitted,
  isUntouchedDraft,
  logStats,
  propositionStatus,
  databaseUnavailableMessage,
  researchWasUsed,
  rowCanExportOutputPdf,
  rowEvaluationPill,
  rowEvaluationState,
  rowDateIso,
  rowPerson,
  rowTeam,
  submittedParts,
  uniqueLogValues,
  uniqueMonthKeys,
} from "../lib/logStatus.js";
/* Part 136 — evaluationState drives Log pills (via rowEvaluationState). */
import { LOG_UNLOCK_OPTIONS, isMasterUnlock } from "../lib/departmentAuthConstants.js";
import { formatIdeaWipeLabel } from "../lib/lockedConstants.js";
import { ideaWipeAt } from "../lib/dbExpiry.js";
import { ideaSizeForResult } from "../lib/ideaScale.js";
import { CATEGORY_GROUPS, rowCategoryGroup } from "../lib/categoryGroup.js";
import { SUBMITTER_DEPARTMENTS, teamIsLegacy } from "../lib/propositionFields.js";
import { reviewDisplayState } from "../lib/managerReview.js";
import { inRange, istParts } from "../lib/istTime.js";
import {
  PERIOD_OPTIONS,
  SUMMARY_TABS,
  generateInsights,
  insightRuleLines,
  monthlyTrend,
  periodRange,
  summarize,
  summaryToCsv,
  dashboardStats,
} from "../lib/logInsights.js";
import { InsightsList, MonthTrendChart, SimpleBars, StackedBars, SummaryTable, topWithOthers } from "./LogCharts.jsx";
import { LOG_CHART_CSS } from "./logChartsCss.js";

const STATUS_PILLS = [
  { id: "SUBMITTED", label: "Ideas submitted" },
  { id: "DRAFTS", label: "Drafts" },
  { id: "ai-used", label: "AI used" },
  { id: "GO", label: "GO" },
  { id: "NO-GO", label: "NO-GO" },
  { id: "WATCH", label: "WATCH" },
  { id: "INCOMPLETE", label: "INCOMPLETE" },
];

const CHIP = {
  OPEN: { label: "Open", cls: "chip-open" },
  CLEARED: { label: "Cleared", cls: "chip-cleared" },
  STOPPED: { label: "Stopped", cls: "chip-stopped" },
  REVIEW: { label: "Review", cls: "chip-review" },
};

/** Mine / My team's / All I can see — shared by the list and the analytics so their numbers always agree. */
function applyViewScope(rows, viewScope, myEmail, myTeam) {
  const ownerOf = (row) =>
    String(row.createdByEmail || row.created_by_email || "")
      .trim()
      .toLowerCase();
  if (viewScope === "mine" && myEmail) return rows.filter((row) => ownerOf(row) && ownerOf(row) === myEmail);
  if (viewScope === "team" && myTeam) {
    return rows.filter((row) => (ownerOf(row) && ownerOf(row) === myEmail) || rowTeam(row) === myTeam);
  }
  return rows;
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return false;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

function isWaitingForBusinessHead(row) {
  return reviewDisplayState(row).statusKey === "waiting";
}

function FilterBar({ segments, stage }) {
  return (
    <div className="log-filters-cell">
      <div className="log-seg" aria-hidden="true">
        {segments.map((tone, i) => (
          <span key={i} className={`log-seg-bit tone-${tone}`} />
        ))}
      </div>
      <div className="log-stage">{stage}</div>
    </div>
  );
}

export default function LogPage({
  rows = [],
  loading = false,
  error = "",
  onRefresh,
  onDeleteAll,
  onCleanupUntouched,
  onDeleteRow,
  onOpen,
  deletingAll = false,
  deletingUntouched = false,
  deletingId = "",
  openingId = "",
  canDeleteAll = true,
  canDeleteRow = true,
  canCleanup = true,
  openingDisabled = false,
  onFetchFull,
  unlockedDepartment: unlockedDepartmentProp = undefined,
  onSwitchDepartment = null,
  currentUser = null,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [viewScope, setViewScope] = useState("all"); // mine | team | all
  const [personFilter, setPersonFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [categoryGroupFilter, setCategoryGroupFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [analyticsTab, setAnalyticsTab] = useState("team");
  const [periodId, setPeriodId] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingMonthPdf, setExportingMonthPdf] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllTyped, setDeleteAllTyped] = useState("");
  const [exportingId, setExportingId] = useState("");
  const [exportingPdfId, setExportingPdfId] = useState("");
  const [exportError, setExportError] = useState("");
  const [gateReady, setGateReady] = useState(unlockedDepartmentProp !== undefined);
  const [unlockedDepartmentLocal, setUnlockedDepartmentLocal] = useState(null);
  const [selectedDept, setSelectedDept] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [ideasWipeLabel, setIdeasWipeLabel] = useState("");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const label = formatIdeaWipeLabel(data?.ideasWipeAt, { long: true });
        setIdeasWipeLabel(label || "");
      })
      .catch(() => {
        if (!cancelled) setIdeasWipeLabel("");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const unlockedDepartment =
    unlockedDepartmentProp !== undefined ? unlockedDepartmentProp : unlockedDepartmentLocal;
  const logRows = useMemo(() => rows.filter((row) => !row.probe), [rows]);
  const uniqueSubmitters = useMemo(() => uniqueLogValues(logRows, rowPerson), [logRows]);
  const stats = useMemo(() => logStats(logRows), [logRows]);
  // Part 150 — the dashboard always counts the whole log, whatever the period picker below says.
  const dash = useMemo(() => dashboardStats(logRows), [logRows]);
  const dashMonths = useMemo(() => monthlyTrend(logRows), [logRows]);
  const unavailable = databaseUnavailableMessage(error);
  // Part 148 D121 — the period (India dates) narrows the list and the analytics together.
  const period = useMemo(
    () => periodRange(periodId, Date.now(), { from: customFrom, to: customTo }),
    [periodId, customFrom, customTo]
  );
  const scopedRows = useMemo(() => {
    const base = applyMonthFilter(
      applyScopedFilters(logRows, {
        teamFilter,
        personFilter,
        categoryGroupFilter,
        searchText: query,
      }),
      monthFilter
    );
    if (!period.from && !period.to) return base;
    return base.filter((row) => inRange(istParts(rowDateIso(row))?.ymd, period));
  }, [logRows, teamFilter, personFilter, categoryGroupFilter, query, monthFilter, period]);
  const monthKeys = useMemo(() => uniqueMonthKeys(logRows), [logRows]);
  const isAdminUser = String(currentUser?.role || "").trim() === "ADMIN";
  const showCreatedBy =
    isAdminUser ||
    String(currentUser?.role || "").trim() === "BH FORUM" ||
    viewScope === "team" ||
    viewScope === "all";
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();
  const myTeam = String(currentUser?.team || "").trim();

  const viewRows = useMemo(
    () => applyViewScope(scopedRows, viewScope, myEmail, myTeam),
    [scopedRows, viewScope, myEmail, myTeam]
  );
  const filteredRows = useMemo(() => {
    const rowsForView = viewRows;
    if (status === "bh-waiting") {
      return rowsForView.filter((row) => isWaitingForBusinessHead(row));
    }
    return applyLogStatusFilter(rowsForView, status);
  }, [viewRows, status]);

  // Part 148 — analytics are computed only from rows this Log already holds (D125).
  const summary = useMemo(
    () => summarize(viewRows, analyticsTab, { range: period }),
    [viewRows, analyticsTab, period]
  );
  const monthTrend = useMemo(() => monthlyTrend(viewRows, { range: period }), [viewRows, period]);
  const insights = useMemo(
    () => generateInsights(applyViewScope(logRows, viewScope, myEmail, myTeam)),
    [logRows, viewScope, myEmail, myTeam]
  );
  const insightRules = useMemo(() => insightRuleLines(), []);
  const analyticsTabs = useMemo(
    () => SUMMARY_TABS.filter((t) => t.id !== "person" || showCreatedBy),
    [showCreatedBy]
  );
  const activeTab = analyticsTabs.some((t) => t.id === analyticsTab) ? analyticsTab : "team";
  function selectGroup(g) {
    if (activeTab === "team") setTeamFilter(g.filterValue || "");
    else if (activeTab === "person") setPersonFilter(g.filterValue || "");
    else if (activeTab === "month") setMonthFilter(g.key);
    else if (activeTab === "date") {
      setPeriodId("custom");
      setCustomFrom(g.key);
      setCustomTo(g.key);
    }
  }
  function handleDownloadSummaryCsv() {
    const column = SUMMARY_TABS.find((t) => t.id === activeTab)?.column;
    const safe = String(period.label || "all").replace(/[^A-Za-z0-9._-]+/g, "-");
    downloadTextFile(`primus-log-by-${activeTab}-${safe}.csv`, summaryToCsv(summary, { column }));
  }
  const untouchedCount = useMemo(() => logRows.filter((r) => isUntouchedDraft(r)).length, [logRows]);
  const busy =
    loading ||
    deletingAll ||
    deletingUntouched ||
    exporting ||
    exportingMonthPdf ||
    Boolean(exportingPdfId);
  const masterView = isMasterUnlock(unlockedDepartment);
  // Part 129 — Log delete is role ADMIN only (Master unlock grants no admin rights).
  const allowDelete =
    canDeleteRow ||
    canDeleteAll ||
    String(currentUser?.role || "").trim() === "ADMIN";
  const pillCounts = useMemo(() => {
    const base = {
      ALL: scopedRows.length,
      SUBMITTED: 0,
      DRAFTS: 0,
      "ai-used": 0,
      GO: 0,
      "NO-GO": 0,
      WATCH: 0,
      INCOMPLETE: 0,
      "bh-waiting": 0,
    };
    for (const row of scopedRows) {
      if (isSubmitted(row)) base.SUBMITTED += 1;
      else base.DRAFTS += 1;
      if (researchWasUsed(row)) base["ai-used"] += 1;
      const evalState = rowEvaluationState(row);
      if (evalState === "evaluated" || evalState === "legacy") {
        const cls = classificationOf(row);
        if (cls === "GO" || cls === "NO-GO" || cls === "WATCH" || cls === "INCOMPLETE") base[cls] += 1;
      }
      if (isWaitingForBusinessHead(row)) base["bh-waiting"] += 1;
    }
    return base;
  }, [scopedRows]);
  const monthRows = useMemo(() => {
    if (!monthFilter) return [];
    return applyMonthFilter(logRows, monthFilter);
  }, [logRows, monthFilter]);

  function exportHint() {
    if (monthFilter) return `propositions-${monthFilter}`;
    if (personFilter) return `propositions-${personFilter}`;
    if (categoryGroupFilter) return `propositions-${categoryGroupFilter}`;
    if (teamFilter) return `propositions-${teamFilter}`;
    if (unlockedDepartment) return `propositions-${unlockedDepartment}`;
    return "propositions";
  }

  async function handleExport(rowsToExport, hint) {
    if (!rowsToExport?.length || exporting) return;
    setExportError("");
    setExporting(true);
    try {
      const full = await resolveFullPropositions(rowsToExport, onFetchFull);
      exportPropositionsToExcel(full, hint || exportHint());
    } catch (e) {
      setExportError(e.message || "Could not export Excel.");
    } finally {
      setExporting(false);
      setExportingId("");
    }
  }

  async function handleExportRow(row) {
    if (!row?.id || exporting || exportingPdfId) return;
    setExportingId(row.id);
    const hint = String(row.name || "idea").trim() || "idea";
    await handleExport([row], hint);
  }

  function rowIsScreened(row) {
    return rowCanExportOutputPdf(row);
  }

  async function handleExportInputsPdfRow(row) {
    if (!row?.id || exporting || exportingPdfId || exportingMonthPdf) return;
    if (!onFetchFull) {
      setExportError("Could not load the full idea for PDF export.");
      return;
    }
    setExportError("");
    setExportingPdfId(row.id);
    try {
      const full = await onFetchFull(row.id);
      if (!full) throw new Error("Could not load this idea.");
      await exportPropositionInputsPdf(full);
    } catch (e) {
      setExportError(e.message || "Could not export inputs PDF.");
    } finally {
      setExportingPdfId("");
    }
  }

  async function handleExportOutputPdfRow(row) {
    if (!row?.id || exporting || exportingPdfId || exportingMonthPdf) return;
    const rowState = rowEvaluationState(row);
    if (!rowCanExportOutputPdf(row)) {
      setExportError(
        rowState === "incomplete"
          ? "Evaluation is incomplete — finish Evaluate before exporting Output PDF."
          : "Not evaluated yet — run Evaluate before exporting Output PDF."
      );
      return;
    }
    if (!onFetchFull) {
      setExportError("Could not load the full idea for PDF export.");
      return;
    }
    setExportError("");
    setExportingPdfId(row.id);
    try {
      const full = await onFetchFull(row.id);
      const fullState = rowEvaluationState(full);
      if (fullState !== "evaluated" && fullState !== "legacy") {
        throw new Error(
          fullState === "incomplete"
            ? "Evaluation is incomplete — finish Evaluate before exporting Output PDF."
            : "Not evaluated yet — run Evaluate before exporting Output PDF."
        );
      }
      const doc = full.goNoGo?.classification
        ? full
        : { ...full, goNoGo: full.goNoGo || { classification: full.classification } };
      await exportPropositionOutputPdf(doc, { currentUser });
    } catch (e) {
      setExportError(e.message || "Could not export PDF.");
    } finally {
      setExportingPdfId("");
    }
  }

  async function handleExportMonthExcel() {
    if (!isAdminUser || !monthFilter || !monthRows.length || exporting || exportingMonthPdf) return;
    await handleExport(monthRows, `propositions-${monthFilter}-inputs`);
  }

  async function handleExportMonthInputsPdf() {
    if (!isAdminUser || !monthFilter || exporting || exportingMonthPdf || exportingPdfId) return;
    if (!onFetchFull) {
      setExportError("Could not load ideas for month inputs PDF export.");
      return;
    }
    if (!monthRows.length) {
      setExportError("No ideas in this month to export as inputs PDF.");
      return;
    }
    setExportError("");
    setExportingMonthPdf(true);
    try {
      const fullDocs = [];
      for (const row of monthRows) {
        const full = await onFetchFull(row.id);
        if (full) fullDocs.push(full);
      }
      if (!fullDocs.length) throw new Error("Could not load ideas for this month.");
      await exportMonthInputsPdf(fullDocs, { monthKey: monthFilter });
    } catch (e) {
      setExportError(e.message || "Could not export month inputs PDF.");
    } finally {
      setExportingMonthPdf(false);
    }
  }

  async function handleExportMonthOutputPdf() {
    if (!isAdminUser || !monthFilter || exporting || exportingMonthPdf || exportingPdfId) return;
    if (!onFetchFull) {
      setExportError("Could not load ideas for month output PDF export.");
      return;
    }
    const screened = monthRows.filter((row) => rowIsScreened(row));
    if (!screened.length) {
      setExportError("No screened ideas in this month to export as output PDF.");
      return;
    }
    setExportError("");
    setExportingMonthPdf(true);
    try {
      const fullDocs = [];
      for (const row of screened) {
        const full = await onFetchFull(row.id);
        if (full?.goNoGo?.classification || full?.classification) fullDocs.push(full);
      }
      await exportMonthPropositionsPdf(fullDocs, { monthKey: monthFilter, currentUser });
    } catch (e) {
      setExportError(e.message || "Could not export month output PDF.");
    } finally {
      setExportingMonthPdf(false);
    }
  }

  useEffect(() => {
    if (unlockedDepartmentProp !== undefined) {
      setGateReady(true);
      if (unlockedDepartmentProp) refreshRef.current?.();
      return undefined;
    }
    let cancelled = false;
    fetch("/api/department-auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const dept = data.department || null;
        setUnlockedDepartmentLocal(dept);
        setGateReady(true);
        if (dept) refreshRef.current?.();
      })
      .catch(() => {
        if (!cancelled) setGateReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [unlockedDepartmentProp]);

  async function handleUnlock(e) {
    e?.preventDefault?.();
    if (!selectedDept || !password || unlocking) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch("/api/department-auth/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: selectedDept, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not unlock.");
      setPassword("");
      setUnlockedDepartmentLocal(data.department);
      refreshRef.current?.();
    } catch (err) {
      setUnlockError(err.message || "Could not unlock.");
      setUnlockedDepartmentLocal(null);
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSwitchDepartment() {
    if (typeof onSwitchDepartment === "function") {
      await onSwitchDepartment();
      return;
    }
    try {
      await fetch("/api/department-auth/lock", { method: "POST", credentials: "include" });
    } catch {
      /* still lock locally */
    }
    setUnlockedDepartmentLocal(null);
    setPassword("");
    setUnlockError("");
  }

  if (!gateReady) {
    return (
      <main className="log-page">
        <div className="log-empty">
          <Loader2 size={18} className="spin" /> Opening log…
        </div>
      </main>
    );
  }

  if (!unlockedDepartment) {
    return (
      <main className="log-page">
        <form className="log-lock-screen" onSubmit={handleUnlock}>
          <p className="mono log-stat-kicker">Proposition log</p>
          <h2 className="log-title">Unlock with your department password</h2>
          <p className="log-sub">
            This is a shared team password, not a personal login. It lasts for this browser session only.
          </p>
          <label className="log-lock-label">
            Department
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              disabled={unlocking}
              required
            >
              <option value="">Select your department</option>
              {LOG_UNLOCK_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="log-lock-label">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={unlocking}
              required
            />
          </label>
          {unlockError ? (
            <div className="log-err" role="alert">
              <AlertTriangle size={14} /> {unlockError}
            </div>
          ) : null}
          <button type="submit" className="log-btn" disabled={unlocking || !selectedDept || !password}>
            {unlocking ? <Loader2 size={15} className="spin" /> : null}
            Unlock
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="log-page">
      <p className="log-export-notice" role="status">
        Kindly export your ideas to make sure you always have a copy — ideas will be wiped out
        {ideasWipeLabel ? (
          <>
            {" "}
            on <strong>{ideasWipeLabel}</strong>
          </>
        ) : (
          " because of no storage"
        )}
        .
      </p>
      <div className="log-stats">
        {unavailable ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> Database unavailable
          </div>
        ) : (
          <>
            <article className="log-stat-card" data-testid="dash-submitted">
              <div className="mono log-stat-kicker">Ideas submitted</div>
              <div className="log-stat-value">{dash.submitted}</div>
              <p>
                {dash.thisMonth} this month (India time)
                {dash.lastMonth > 0 || dash.thisMonth > 0
                  ? `, ${dash.thisMonth >= dash.lastMonth ? "up" : "down"} from ${dash.lastMonth} in ${dash.prevMonthName}`
                  : ""}
                . {dash.drafts} {dash.drafts === 1 ? "draft is" : "drafts are"} not yet submitted.
              </p>
            </article>
            <article className="log-stat-card" data-testid="dash-screened">
              <div className="mono log-stat-kicker">Screened</div>
              <div className="log-stat-value" style={{ color: "var(--chart-go)" }}>{dash.screened}</div>
            </article>
            <article className="log-stat-card" data-testid="dash-go">
              <div className="mono log-stat-kicker">Verdict · GO</div>
              <div className="log-stat-value" style={{ color: "var(--chart-go)" }}>{dash.GO}</div>
            </article>
            <article className="log-stat-card" data-testid="dash-nogo">
              <div className="mono log-stat-kicker">Verdict · NO-GO</div>
              <div className="log-stat-value" style={{ color: "var(--chart-nogo)" }}>{dash["NO-GO"]}</div>
            </article>
            <article className="log-stat-card" data-testid="dash-watch">
              <div className="mono log-stat-kicker">Verdict · Watch</div>
              <div className="log-stat-value" style={{ color: "var(--chart-watch)" }}>{dash.WATCH}</div>
            </article>
            <article className="log-stat-card" data-testid="dash-waiting">
              <div className="mono log-stat-kicker">Waiting for approval</div>
              <div className="log-stat-value" style={{ color: "var(--chart-watch)" }}>{dash.waiting}</div>
              <p>Business head review pending</p>
            </article>
          </>
        )}
      </div>

      {!unavailable ? (
        <section className="log-dash-charts" data-testid="dash-charts" aria-label="Ideas submitted: by month, top submitters and teams">
          <div className="log-dash-main">
            <MonthTrendChart title="Ideas submitted per month" months={dashMonths} />
          </div>
          <div className="log-dash-side">
            <SimpleBars
              title={`Top 5 submitters in ${dash.monthName || "this month"}`}
              unit="ideas"
              items={dash.topPeople.map((g) => ({ key: g.key, label: g.label, value: g.submitted }))}
              emptyText="No ideas submitted this month yet."
            />
            <StackedBars
              title={`Ideas submitted by team in ${dash.monthName || "this month"}`}
              groups={dash.teams}
              onSelect={(g) => {
                setTeamFilter(g.filterValue || "");
                if (dash.monthKey) setMonthFilter(dash.monthKey);
              }}
              emptyText="No ideas submitted this month yet."
            />
          </div>
        </section>
      ) : null}

      {!unavailable ? (
        <section className="log-analytics" aria-label="Ideas by team, month, person and date">
          <div className="log-analytics-head">
            <div className="log-tabs" role="tablist" aria-label="Group ideas by">
              {analyticsTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`log-pill${activeTab === t.id ? " is-active" : ""}`}
                  onClick={() => setAnalyticsTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="log-analytics-controls">
              <label>
                <span className="sr-only">Period</span>
                <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Period">
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === "this-fy" || p.id === "last-fy" ? periodRange(p.id).label : p.label}
                    </option>
                  ))}
                </select>
              </label>
              {periodId === "custom" ? (
                <>
                  <label>
                    <span className="sr-only">From</span>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
                  </label>
                  <label>
                    <span className="sr-only">To</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
                  </label>
                </>
              ) : null}
              <button type="button" className="log-btn" onClick={handleDownloadSummaryCsv} disabled={summary.groups.length === 0}>
                <Download size={15} />
                Download CSV
              </button>
            </div>
          </div>
          <p className="log-analytics-note">
            Counts use India time (IST). Submitted ideas are counted on the day of their first Submit; drafts on the day
            they were created and never inside the submitted figures. Ideas screened before this release may sit in a
            later month if they were screened again afterwards. Click a row or bar to filter the list below.
          </p>
          {teamFilter || monthFilter || personFilter || period.from || period.to ? (
            <div className="log-active-filters" aria-label="Active analytics filters">
              <span>Showing:</span>
              {teamFilter ? (
                <button type="button" onClick={() => setTeamFilter("")}>
                  Team {teamFilter === "__legacy__" ? "Legacy" : teamFilter} ✕
                </button>
              ) : null}
              {monthFilter ? (
                <button type="button" onClick={() => setMonthFilter("")}>
                  Month {formatMonthLabel(monthFilter)} ✕
                </button>
              ) : null}
              {personFilter ? (
                <button type="button" onClick={() => setPersonFilter("")}>
                  Person {personFilter} ✕
                </button>
              ) : null}
              {period.from || period.to ? <span>Period: {period.label}</span> : null}
            </div>
          ) : null}
          <div className="log-analytics-grid">
            <div>
              {activeTab === "team" ? (
                <StackedBars title="Ideas submitted by team" groups={summary.groups} onSelect={selectGroup} />
              ) : null}
              {activeTab === "person" ? (
                <StackedBars
                  title="Ideas submitted by person (top 10)"
                  groups={topWithOthers(summary.groups, 10)}
                  onSelect={selectGroup}
                />
              ) : null}
              {activeTab === "month" ? (
                <MonthTrendChart months={monthTrend} onSelect={(m) => setMonthFilter(m.key)} />
              ) : null}
              {activeTab === "date" ? (
                <p className="log-analytics-note">Daily counts are shown in the table below.</p>
              ) : null}
            </div>
            <InsightsList insights={insights} rules={insightRules} />
          </div>
          <SummaryTable
            summary={summary}
            columnLabel={SUMMARY_TABS.find((t) => t.id === activeTab)?.column || "Group"}
            onSelect={selectGroup}
            newestFirst={activeTab === "date"}
          />
        </section>
      ) : null}

      <section className="log-card">
        <div className="log-card-head">
          <div>
            <h2 className="log-title">Proposition log</h2>
            <p className="log-sub">
              {isMasterUnlock(unlockedDepartment)
                ? "Viewing every idea entered so far, across all teams. Search, filter, or export."
                : `Viewing every idea entered so far. Search, filter, or export.`}{" "}
              Click a row to open its GO/NO-GO output (or the input form if it is not screened yet). From
              output you can open the entered inputs without typing them again.
            </p>
          </div>
          <div className="log-head-actions">
            <span className="mono log-unlock-badge">{unlockedDepartment}</span>
            <button type="button" className="log-btn" onClick={handleSwitchDepartment} disabled={busy}>
              Switch department
            </button>
            <button type="button" className="log-btn" onClick={onRefresh} disabled={busy}>
              {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              Refresh
            </button>
            <button
              type="button"
              className="log-btn"
              onClick={() => handleExport(filteredRows)}
              disabled={busy || filteredRows.length === 0}
              title="Export matching ideas to Excel"
            >
              {exporting && !exportingId && !exportingMonthPdf ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Download size={15} />
              )}
              {filteredRows.length &&
              (personFilter || categoryGroupFilter || query.trim() || status !== "ALL" || monthFilter || teamFilter)
                ? `Export Excel (${filteredRows.length})`
                : "Export Excel"}
            </button>
            {isAdminUser ? (
              <>
                <button
                  type="button"
                  className="log-btn"
                  onClick={handleExportMonthExcel}
                  disabled={busy || !monthFilter || monthRows.length === 0}
                  title={
                    monthFilter
                      ? `Export all ${formatMonthLabel(monthFilter)} entered inputs to Excel`
                      : "Choose a month first"
                  }
                >
                  {exporting && !exportingId ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                  Month Inputs Excel{monthFilter ? ` (${monthRows.length})` : ""}
                </button>
                <button
                  type="button"
                  className="log-btn"
                  onClick={handleExportMonthInputsPdf}
                  disabled={busy || !monthFilter || monthRows.length === 0}
                  title={
                    monthFilter
                      ? `Export all ${formatMonthLabel(monthFilter)} entered inputs as one PDF`
                      : "Choose a month first"
                  }
                >
                  {exportingMonthPdf ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />}
                  Month Inputs PDF{monthFilter ? ` (${monthRows.length})` : ""}
                </button>
                <button
                  type="button"
                  className="log-btn"
                  onClick={handleExportMonthOutputPdf}
                  disabled={busy || !monthFilter || !monthRows.some((r) => rowIsScreened(r))}
                  title={
                    monthFilter
                      ? `Export screened ${formatMonthLabel(monthFilter)} Go/No-Go outputs as one PDF`
                      : "Choose a month first"
                  }
                >
                  {exportingMonthPdf ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />}
                  Month Output PDF
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="log-btn"
              onClick={onCleanupUntouched}
              disabled={busy || untouchedCount === 0 || !canCleanup || !allowDelete}
              title={allowDelete ? undefined : "Only ADMIN or Master can delete"}
            >
              {deletingUntouched ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              Clean up untouched drafts ({untouchedCount})
            </button>
            <button
              type="button"
              className="log-btn log-btn-danger"
              onClick={() => {
                setDeleteAllTyped("");
                setDeleteAllOpen(true);
              }}
              disabled={busy || rows.length === 0 || !canDeleteAll || !allowDelete}
              title={allowDelete ? undefined : "Only ADMIN or Master can delete"}
            >
              {deletingAll ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              Delete all
            </button>
          </div>
        </div>

        {deleteAllOpen && (
          <form
            className="log-delete-all"
            onSubmit={(e) => {
              e.preventDefault();
              const phrase = `DELETE ALL ${rows.length}`;
              if (deleteAllTyped !== phrase) return;
              setDeleteAllOpen(false);
              setDeleteAllTyped("");
              onDeleteAll(phrase);
            }}
          >
            <p>
              This removes every idea in the log. Export a copy first, then type{" "}
              <strong>{`DELETE ALL ${rows.length}`}</strong> to enable delete.
            </p>
            <button
              type="button"
              className="log-btn"
              onClick={() => handleExport(logRows)}
              disabled={exporting || rows.length === 0}
            >
              {exporting && !exportingId ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              Export all
            </button>
            <label className="log-lock-label">
              Confirmation
              <input
                value={deleteAllTyped}
                onChange={(e) => setDeleteAllTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label="Type DELETE ALL and the row count"
              />
            </label>
            <div className="log-delete-all-actions">
              <button
                type="submit"
                className="log-btn log-btn-danger"
                disabled={deleteAllTyped !== `DELETE ALL ${rows.length}` || deletingAll}
              >
                {deletingAll ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                Delete all
              </button>
              <button
                type="button"
                className="log-btn"
                onClick={() => {
                  setDeleteAllOpen(false);
                  setDeleteAllTyped("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="log-toolbar">
          <label className="log-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, department, or idea"
              aria-label="Search name, department, or idea"
            />
          </label>
          <div className="log-scoped-filters">
            <label>
              <span className="sr-only">View</span>
              <select
                value={viewScope}
                onChange={(e) => setViewScope(e.target.value)}
                aria-label="View"
              >
                <option value="mine">Mine</option>
                <option value="team">My team's</option>
                <option value="all">All I can see</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Team-wise ideas</span>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                aria-label="Team-wise ideas submitted"
              >
                <option value="">Team-wise ideas — all teams</option>
                {SUBMITTER_DEPARTMENTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {isAdminUser ? <option value="__legacy__">Legacy team</option> : null}
              </select>
            </label>
            <label>
              <span className="sr-only">Month-wise ideas</span>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                aria-label="Month-wise ideas submitted"
              >
                <option value="">Month-wise ideas — all months</option>
                {monthKeys.map((key) => (
                  <option key={key} value={key}>
                    {formatMonthLabel(key)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Submitter</span>
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                aria-label="Filter by submitter"
              >
                <option value="">All submitters</option>
                {uniqueSubmitters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Category</span>
              <select
                value={categoryGroupFilter}
                onChange={(e) => setCategoryGroupFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {CATEGORY_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="log-pills" role="tablist" aria-label="Log status filter">
            {STATUS_PILLS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={status === p.id}
                className={`log-pill${status === p.id ? " is-active" : ""}`}
                onClick={() => setStatus(p.id === "SUBMITTED" || p.id === "DRAFTS" ? (status === p.id ? "ALL" : p.id) : p.id)}
              >
                {p.label}
                <span className="mono">{pillCounts[p.id] ?? 0}</span>
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={status === "bh-waiting"}
              className={`log-pill${status === "bh-waiting" ? " is-active" : ""}`}
              onClick={() => setStatus("bh-waiting")}
            >
              Waiting for business head&apos;s approval
              <span className="mono">{pillCounts["bh-waiting"] ?? 0}</span>
            </button>
          </div>
          <div className="log-toolbar-meta">
            <span className="mono log-sort">Sorted by last updated</span>
            <div className="log-legend" aria-label="Filter bar colour key">
              <span><i className="tone-pass" /> Pass</span>
              <span><i className="tone-fail" /> Fail</span>
              <span><i className="tone-review" /> In review</span>
              <span><i className="tone-incomplete" /> Incomplete</span>
              <span><i className="tone-none" /> Locked</span>
            </div>
          </div>
        </div>

        {unavailable ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> Database unavailable
          </div>
        ) : error ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> {error}
          </div>
        ) : null}
        {exportError ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> {exportError}
          </div>
        ) : null}

        {unavailable ? (
          <div className="log-empty">Database unavailable</div>
        ) : loading && rows.length === 0 ? (
          <div className="log-empty">
            <Loader2 size={18} className="spin" /> Loading propositions…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="log-empty">
            {rows.length === 0
              ? "No propositions yet. Use NPD Screen or Enter your proposition here to start one."
              : "No rows match this search or filter."}
          </div>
        ) : (
          <div className="log-table-wrap">
            <table className="log-table" aria-rowcount={filteredRows.length}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Proposition</th>
                  <th>Scale</th>
                  <th>Team</th>
                  {showCreatedBy ? <th>Created by</th> : null}
                  <th title="Manager review">Mgr review</th>
                  <th>Filters</th>
                  <th>Submitted</th>
                  <th className="log-th-actions">Export</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((h) => {
                  const isOpening = openingId === h.id;
                  const isDeleting = deletingId === h.id;
                  const st = propositionStatus(h);
                  const chip = CHIP[st] || CHIP.OPEN;
                  const checks = h.advisoryChecks || {};
                  const segs = filterSegments(h, checks);
                  const stage = filterStageLabel(h, checks, segs);
                  const when = submittedParts(h.createdAt || h.updatedAt);
                  const idea = String(h.ideaDescription || "").trim();
                  const team = rowTeam(h) || "—";
                  const division = String(h.division || "").trim();
                  const isExportingRow = exportingId === h.id;
                  const isExportingPdf = exportingPdfId === h.id;
                  const rowBusy =
                    openingDisabled ||
                    Boolean(deletingId) ||
                    Boolean(exportingPdfId) ||
                    deletingAll ||
                    deletingUntouched ||
                    exporting;
                  const evalPill = rowEvaluationPill(h);
                  const screened = rowCanExportOutputPdf(h);
                  const lockedVerdict = evalPill.verdict;
                  const lockedPct = evalPill.pct;
                  const sizeTier = screened ? ideaSizeForResult(h) : null;
                  const wipeLabel = formatIdeaWipeLabel(ideaWipeAt(h));
                  const categoryGroup = rowCategoryGroup(h);
                  return (
                    <tr key={h.id} className="log-tr">
                      <td>
                        <button
                          type="button"
                          className="log-open"
                          onClick={() => onOpen(h)}
                          disabled={rowBusy}
                        >
                          <div className="log-status-cell">
                            <span className={`log-chip ${chip.cls}`}>
                              {isOpening ? <Loader2 size={12} className="spin" /> : chip.label}
                            </span>
                            {evalPill.label ? (
                              <span
                                className={`research-badge ${
                                  evalPill.state === "not-evaluated" || evalPill.state === "incomplete"
                                    ? "incomplete"
                                    : lockedVerdict === "INCOMPLETE"
                                      ? "incomplete"
                                      : "used"
                                }`}
                                title={
                                  evalPill.state === "not-evaluated"
                                    ? "Research steps not finished — Evaluate to score"
                                    : evalPill.state === "incomplete"
                                      ? "Some evaluation steps still missing"
                                      : "Stored gate verdict"
                                }
                              >
                                {evalPill.label}
                                {Number.isFinite(lockedPct) ? ` ${lockedPct}%` : ""}
                                {lockedVerdict === "INCOMPLETE" &&
                                Number.isFinite(Number(h.goNoGo?.score?.done ?? h.goNoGo?.output?.score?.done))
                                  ? ` · ${h.goNoGo?.score?.done ?? h.goNoGo?.output?.score?.done} of ${
                                      h.goNoGo?.score?.total ?? h.goNoGo?.output?.score?.total ?? 15
                                    }`
                                  : ""}
                              </span>
                            ) : null}
                            {evalPill.legacy ? (
                              <span className="research-badge incomplete" title="Scored under an older release">
                                older release
                              </span>
                            ) : null}
                            {h.goNoGo?.scoreStatus === "edited-since-evaluation" ||
                            h.goNoGo?.scoreStatus === "edited-since-screening" ? (
                              <span className="research-badge incomplete" title="Inputs changed since evaluation">
                                edited since evaluation
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="log-open log-prop-cell"
                          onClick={() => onOpen(h)}
                          disabled={rowBusy}
                        >
                          <span className="log-prop-name">
                            {wipeLabel ? <span className="log-wipe-chip">Wipes {wipeLabel}</span> : null}
                            {h.name || "Untitled idea"}
                          </span>
                          <span className="log-prop-owner">{h.submitterName || "—"}</span>
                          {categoryGroup ? (
                            <span className="log-prop-group">
                              {h.category ? `${h.category} · ${categoryGroup}` : categoryGroup}
                            </span>
                          ) : null}
                          {idea ? (
                            <span className="log-prop-idea" title={idea}>
                              {idea}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td className="mono log-scale-cell">
                        {sizeTier ? (
                          <span
                            className="log-scale-chip"
                            data-provisional={sizeTier.provisional ? "true" : "false"}
                            title={sizeTier.derivation || sizeTier.label}
                          >
                            {sizeTier.tier}
                          </span>
                        ) : (
                          <span className="log-scale-empty">—</span>
                        )}
                      </td>
                      <td className="mono log-dept-cell">
                        <span className="log-dept-team">
                          {teamIsLegacy(team) ? `Legacy: ${team}` : team}
                        </span>
                        {division && division !== team ? (
                          <span className="log-dept-division">{division}</span>
                        ) : null}
                      </td>
                      {showCreatedBy ? <td>{rowPerson(h) || h.submitterName || "—"}</td> : null}
                      <td>
                        {(() => {
                          const ui = reviewDisplayState(h);
                          return (
                            <span className="log-mgr-review" title={ui.comment || undefined}>
                              {ui.label}
                              {ui.comment ? (
                                <details className="log-mgr-comment">
                                  <summary>Comment</summary>
                                  <p>{ui.comment}</p>
                                </details>
                              ) : null}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <FilterBar segments={segs} stage={stage} />
                      </td>
                      <td className="mono log-submitted">
                        <span>{when.date}</span>
                        <span>{when.time}</span>
                      </td>
                      <td className="log-actions-cell">
                        <div className="log-row-actions">
                          <button
                            type="button"
                            className="log-export-btn log-export-btn-output"
                            aria-label="Export Go/No-Go output as PDF"
                            title={
                              screened
                                ? "Export Go/No-Go output page as PDF"
                                : evalPill.state === "incomplete"
                                  ? "Evaluation incomplete — finish Evaluate first"
                                  : "Not evaluated yet — run Evaluate first"
                            }
                            disabled={rowBusy || !screened}
                            onClick={() => handleExportOutputPdfRow(h)}
                          >
                            {isExportingPdf ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />}
                            <span>Output PDF</span>
                          </button>
                          <button
                            type="button"
                            className="log-export-btn"
                            aria-label="Export entered input fields as PDF screenshot"
                            title="Export entered inputs as PDF"
                            disabled={rowBusy}
                            onClick={() => handleExportInputsPdfRow(h)}
                          >
                            {isExportingPdf ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />}
                            <span>Inputs PDF</span>
                          </button>
                          <button
                            type="button"
                            className="log-export-btn"
                            aria-label="Export entered input fields to Excel"
                            title="Export entered inputs to Excel"
                            disabled={rowBusy}
                            onClick={() => handleExportRow(h)}
                          >
                            {isExportingRow ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                            <span>Inputs Excel</span>
                          </button>
                          {allowDelete ? (
                            <button
                              type="button"
                              className="log-del"
                              aria-label="Delete this idea"
                              title="Delete this idea"
                              disabled={rowBusy}
                              onClick={() => onDeleteRow(h)}
                            >
                              {isDeleting ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                              <span>Delete</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export const LOG_PAGE_CSS = LOG_CHART_CSS + `
.log-page{
  --bg:#F2EFE5; --card-bg:#FFFDF8; --card-border:#E6E1D1;
  --table-header-bg:#FBF8EF; --table-row-hover:#FBF8EF; --table-border:#F1ECDD;
  --ink:#16202B; --ink-secondary:#5C5647; --ink-secondary-2:#4A4636;
  --ink-muted:#8C8574; --ink-muted-2:#6E6858; --ink-muted-3:#A39C8B;
  --pass:#2F7A54; --fail:#A3402F; --review:#C7962A; --none:#E2DCC8;
  --chip-open-bg:#F2E6C4; --chip-open-fg:#8A6A12;
  --chip-cleared-bg:#DDEBE1; --chip-cleared-fg:#26603F;
  --chip-stopped-bg:#EFE9E7; --chip-stopped-fg:#8A5348;
  --chip-review-bg:#E5E8EC; --chip-review-fg:#3A4A5C;
  --pill-active-bg:#16202B; --pill-active-fg:#FFFDF8;
  --danger-text:#A3402F; --danger-border:#EBD3CC; --danger-hover-bg:#FBF1EE;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
  color:var(--ink); background:var(--bg);
  width:100%;max-width:100%;margin:0 auto;padding:16px 20px 40px;
  display:flex;flex-direction:column;gap:18px;
  box-sizing:border-box;overflow-x:visible;
}
.log-page .mono{font-family:'IBM Plex Mono',monospace;}
.log-page .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;}
.log-export-notice{
  margin:0;padding:12px 16px;border-radius:12px;
  background:#FBF1EE;border:1px solid var(--danger-border);color:var(--danger-text);
  font-size:13px;line-height:1.45;font-weight:600;
}
.log-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;}
.log-dash-charts{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px;align-items:start;}
.log-dash-main,.log-dash-side{display:flex;flex-direction:column;gap:14px;min-width:0;}
.log-dash-charts .log-chart{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:14px 16px;margin:0;}
@media (max-width:1000px){.log-dash-charts{grid-template-columns:minmax(0,1fr);}}
.log-stat-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px 18px;}
.log-stat-kicker{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 6px;}
.log-stat-value{font-size:32px;font-weight:700;letter-spacing:-.8px;line-height:1.1;}
.log-stat-card p{margin:6px 0 0;font-size:13px;color:var(--ink-secondary);}
.log-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;padding:22px 22px 8px;max-width:100%;overflow:visible;}
.log-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin:0 0 16px;}
.log-page .log-title{margin:0 0 6px;font-size:22px;color:var(--ink);}
.log-page .log-sub{margin:0;font-size:13px;color:var(--ink-secondary);max-width:560px;line-height:1.45;}
.log-page .log-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:100%;}
.log-unlock-badge{font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:var(--chip-cleared-bg);color:var(--chip-cleared-fg);}
.log-lock-screen{max-width:420px;margin:48px auto;background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;padding:28px 24px;display:flex;flex-direction:column;gap:14px;}
.log-lock-label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--ink);}
.log-lock-label select,.log-lock-label input{
  background:#fff;border:1px solid var(--card-border);border-radius:12px;padding:10px 12px;
  font-family:inherit;font-size:14px;font-weight:500;color:var(--ink);
}
.log-btn{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--card-border);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit;}
.log-btn:hover{background:var(--table-row-hover);}
.log-btn:disabled{opacity:.5;cursor:not-allowed;}
.log-delete-all{margin:0 0 14px;padding:14px 16px;border:1px solid var(--danger-border);border-radius:14px;background:var(--card-bg);display:flex;flex-direction:column;gap:10px;}
.log-delete-all p{margin:0;font-size:13px;line-height:1.45;color:var(--ink);}
.log-delete-all-actions{display:flex;gap:8px;flex-wrap:wrap;}
.log-btn-danger{color:var(--danger-text);border-color:var(--danger-border);}
.log-btn-danger:hover:not(:disabled){background:var(--danger-hover-bg);}
.log-toolbar{display:flex;flex-direction:column;gap:12px;margin:0 0 12px;}
.log-search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--card-border);border-radius:12px;padding:0 12px;color:var(--ink-muted);}
.log-search input{flex:1;border:0;background:transparent;padding:10px 0;font-family:inherit;font-size:14px;color:var(--ink);outline:none;}
.log-scoped-filters{display:flex;flex-wrap:wrap;gap:8px;}
.log-scoped-filters select{
  min-width:180px;background:#fff;border:1px solid var(--card-border);border-radius:12px;
  padding:9px 12px;font-family:inherit;font-size:13px;color:var(--ink);cursor:pointer;
}
.log-pills{display:flex;flex-wrap:wrap;gap:6px;}
.log-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--card-border);background:transparent;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--ink-secondary-2);cursor:pointer;font-family:inherit;}
.log-pill span{font-size:11px;color:var(--ink-muted);}
.log-pill.is-active{background:var(--pill-active-bg);color:var(--pill-active-fg);border-color:var(--pill-active-bg);}
.log-pill.is-active span{color:var(--pill-active-fg);opacity:.75;}
.log-toolbar-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;}
.log-sort{font-size:11px;color:var(--ink-muted);letter-spacing:.04em;}
.log-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--ink-muted-2);}
.log-legend span{display:inline-flex;align-items:center;gap:6px;}
.log-legend i{width:14px;height:6px;border-radius:999px;display:inline-block;}
.log-legend .tone-pass,.log-seg-bit.tone-pass{background:var(--pass);}
.log-legend .tone-fail,.log-seg-bit.tone-fail{background:var(--fail);}
.log-legend .tone-review,.log-seg-bit.tone-review{background:var(--review);}
.log-legend .tone-incomplete,.log-seg-bit.tone-incomplete{background:#8a7a4a;}
.log-legend .tone-none,.log-seg-bit.tone-none{background:var(--none);}
.log-err{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--danger-hover-bg);color:var(--danger-text);font-size:13px;}
.log-page .log-empty{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 12px;color:var(--ink-muted);font-size:14px;}
.log-table-wrap{margin:0;width:100%;max-width:100%;overflow-x:visible;}
.log-table{width:100%;max-width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;}
.log-table th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);background:var(--table-header-bg);padding:8px 6px;border-bottom:1px solid var(--table-border);font-weight:700;overflow:hidden;text-overflow:ellipsis;}
.log-table td{padding:8px 6px;border-bottom:1px solid var(--table-border);vertical-align:top;background:var(--card-bg);overflow:hidden;}
.log-table th:nth-child(1),.log-table td:nth-child(1){width:9%;}
.log-table th:nth-child(2),.log-table td:nth-child(2){width:20%;}
.log-table th:nth-child(3),.log-table td:nth-child(3){width:5%;}
.log-table th:nth-child(4),.log-table td:nth-child(4){width:8%;}
.log-table th:nth-child(5),.log-table td:nth-child(5){width:10%;}
.log-table th:nth-child(6),.log-table td:nth-child(6){width:10%;}
.log-table th:nth-child(7),.log-table td:nth-child(7){width:9%;}
.log-th-actions,.log-actions-cell{
  width:24%;min-width:220px;text-align:right;
  overflow:visible !important;
}
.log-table th.log-th-actions{background:var(--table-header-bg);}
.log-actions-cell{background:var(--card-bg);}
.log-tr:hover td{background:var(--table-row-hover);}
.log-tr:hover .log-actions-cell{background:var(--table-row-hover);}
.log-open{display:block;width:100%;max-width:100%;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.log-open:disabled{opacity:.6;cursor:wait;}
.log-chip{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;border-radius:999px;max-width:100%;}
.log-chip.chip-open{background:var(--chip-open-bg);color:var(--chip-open-fg);}
.log-chip.chip-cleared{background:var(--chip-cleared-bg);color:var(--chip-cleared-fg);}
.log-chip.chip-stopped{background:var(--chip-stopped-bg);color:var(--chip-stopped-fg);}
.log-chip.chip-review{background:var(--chip-review-bg);color:var(--chip-review-fg);}
.log-scale-cell{vertical-align:middle;}
.log-scale-chip{
  display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:4px 8px;border-radius:999px;background:#E8E4D6;color:#3A3428;
}
.log-scale-chip[data-provisional="true"]{opacity:.9;}
.log-scale-empty{color:var(--ink-muted);font-size:12px;}
.log-status-cell{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;}
.research-badge{display:inline-flex;align-items:center;font-size:9px;font-weight:650;letter-spacing:.02em;padding:2px 6px;border-radius:999px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.research-badge.used{background:var(--chip-cleared-bg);color:var(--chip-cleared-fg);}
.research-badge.unused{background:var(--none);color:var(--ink-muted);}
.research-badge.incomplete{background:var(--chip-watch-bg, #f3e7c3);color:var(--chip-watch-fg, #6b4e00);}
.log-prop-cell{display:flex;flex-direction:column;gap:2px;min-width:0;}
.log-prop-name{font-weight:650;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}
.log-wipe-chip{display:inline-block;margin:0 6px 2px 0;padding:2px 6px;border-radius:999px;background:#FBF1EE;border:1px solid var(--danger-border);color:var(--danger-text);font-size:9px;font-weight:700;letter-spacing:.02em;vertical-align:middle;}
.log-prop-owner{font-size:11px;color:var(--ink-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-prop-group{font-size:10px;color:var(--ink-muted);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-prop-idea{font-size:11px;color:var(--ink-secondary);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}
.log-dept-cell{font-size:11px;color:var(--ink-secondary-2);min-width:0;}
.log-dept-team{display:block;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-dept-division{display:block;font-size:10px;color:var(--ink-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-mgr-review{min-width:0;font-size:11px;line-height:1.35;color:var(--ink-secondary-2);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}
.log-mgr-comment{margin-top:4px;font-size:11px;color:var(--ink-muted);}
.log-mgr-comment summary{cursor:pointer;font-weight:600;}
.log-mgr-comment p{margin:4px 0 0;line-height:1.35;word-break:break-word;}
.log-filters-cell{min-width:0;}
.log-seg{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;height:7px;margin:0 0 4px;max-width:100%;}
.log-seg-bit{display:block;height:100%;border-radius:999px;background:var(--none);min-width:0;}
.log-stage{font-size:10px;color:var(--ink-muted-2);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.log-submitted{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--ink-secondary);min-width:0;}
.log-submitted span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-row-actions{
  display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%;
  justify-items:stretch;align-items:stretch;
}
.log-export-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  min-height:28px;padding:4px 6px;width:100%;box-sizing:border-box;
  border:1px solid var(--card-border);border-radius:8px;background:#fff;
  color:var(--ink);font:inherit;font-size:10px;font-weight:650;cursor:pointer;
  white-space:nowrap;line-height:1.2;
}
.log-export-btn:hover:not(:disabled){background:var(--table-row-hover);border-color:#d5cfb8;}
.log-export-btn:disabled{opacity:.4;cursor:not-allowed;}
.log-export-btn-output:not(:disabled){
  border-color:#16202B;background:#16202B;color:#FFFDF8;
}
.log-export-btn-output:not(:disabled):hover{background:#2a3542;border-color:#2a3542;color:#FFFDF8;}
.log-page .log-del{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  min-height:28px;padding:4px 6px;width:100%;box-sizing:border-box;
  border:1px solid var(--danger-border);background:transparent;color:var(--danger-text);
  border-radius:8px;cursor:pointer;font-size:10px;font-weight:650;font-family:inherit;
}
.log-page .log-del:hover:not(:disabled){background:var(--danger-hover-bg);}
.log-page .log-del:disabled{opacity:.45;cursor:not-allowed;}
@media (max-width:1100px){
  .log-page{padding:16px 12px 32px;}
  .log-table th,.log-table td{padding:8px 4px;}
  .log-table th:nth-child(2),.log-table td:nth-child(2){width:18%;}
  .log-th-actions,.log-actions-cell{width:24%;min-width:180px;}
  .log-export-btn,.log-page .log-del{font-size:9.5px;padding:4px 5px;}
}
@media (max-width:860px){
  .log-stats{grid-template-columns:repeat(2,minmax(0,1fr));}
  .log-page{padding:12px 10px 28px;}
  .log-card{padding:14px 10px 6px;}
}
`;
