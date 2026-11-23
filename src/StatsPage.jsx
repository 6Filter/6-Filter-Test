import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import TextSizeControl, { TEXT_SIZE_DEFAULT, readStoredTextSize } from "./TextSizeControl.jsx";
import {
  applyScopedFilters,
  applyMonthFilter,
  databaseUnavailableMessage,
  formatMonthLabel,
  rowDateIso,
  rowTeam,
} from "../lib/logStatus.js";
import { LOG_UNLOCK_OPTIONS } from "../lib/departmentAuthConstants.js";
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

function StatsLoadingOverlay({ label }) {
  return (
    <div className="log-loading-overlay" role="status" aria-live="polite" data-testid="log-loading-overlay">
      <span className="log-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export default function StatsPage({
  rows = [],
  loading = false,
  error = "",
  onRefresh,
  unlockedDepartment: unlockedDepartmentProp = undefined,
  onSwitchDepartment = null,
  currentUser = null,
}) {
  const [viewScope, setViewScope] = useState("all");
  const [personFilter, setPersonFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [analyticsTab, setAnalyticsTab] = useState("team");
  const [periodId, setPeriodId] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [gateReady, setGateReady] = useState(unlockedDepartmentProp !== undefined);
  const [unlockedDepartmentLocal, setUnlockedDepartmentLocal] = useState(null);
  const [selectedDept, setSelectedDept] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [textSize, setTextSize] = useState(() => readStoredTextSize());
  const [headerSlot, setHeaderSlot] = useState(() =>
    typeof document !== "undefined" ? document.getElementById("primus-masthead-slot") : null
  );
  useEffect(() => {
    const el = document.getElementById("primus-masthead-slot");
    if (el !== headerSlot) setHeaderSlot(el);
  }, [headerSlot]);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  const unlockedDepartment =
    unlockedDepartmentProp !== undefined ? unlockedDepartmentProp : unlockedDepartmentLocal;
  const logRows = useMemo(() => rows.filter((row) => !row.probe), [rows]);
  const dash = useMemo(() => dashboardStats(logRows), [logRows]);
  const dashMonths = useMemo(() => monthlyTrend(logRows), [logRows]);
  const unavailable = databaseUnavailableMessage(error);
  const period = useMemo(
    () => periodRange(periodId, Date.now(), { from: customFrom, to: customTo }),
    [periodId, customFrom, customTo]
  );
  const scopedRows = useMemo(() => {
    const base = applyMonthFilter(
      applyScopedFilters(logRows, {
        teamFilter,
        personFilter,
        categoryGroupFilter: "",
        searchText: "",
      }),
      monthFilter
    );
    if (!period.from && !period.to) return base;
    return base.filter((row) => inRange(istParts(rowDateIso(row))?.ymd, period));
  }, [logRows, teamFilter, personFilter, monthFilter, period]);
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

  const textSizeControl = <TextSizeControl value={textSize} onChange={setTextSize} />;
  const pageZoom = textSize / TEXT_SIZE_DEFAULT;

  if (!gateReady) {
    return (
      <main className="log-page stats-page">
        <StatsLoadingOverlay label="Opening stats…" />
      </main>
    );
  }

  if (!unlockedDepartment) {
    return (
      <main className="log-page stats-page">
        <form className="log-lock-screen" onSubmit={handleUnlock}>
          <p className="mono log-stat-kicker">Stats</p>
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
    <main
      className="log-page stats-page"
      data-text-scale={textSize}
      style={pageZoom === 1 ? undefined : { zoom: pageZoom }}
    >
      {headerSlot ? createPortal(textSizeControl, headerSlot) : textSizeControl}
      {loading ? <StatsLoadingOverlay label="Loading stats…" /> : null}

      <header className="stats-head">
        <div>
          <p className="mono log-stat-kicker">Screening</p>
          <h1 className="stats-title">Stats</h1>
          <p className="log-sub">
            Counts use India time (IST). Charts and insights count screened ideas only: a GO, WATCH or NO-GO.
            Drafts and incomplete ideas are left out of those figures.
          </p>
        </div>
        <div className="stats-head-actions">
          <label>
            <span className="sr-only">View</span>
            <select value={viewScope} onChange={(e) => setViewScope(e.target.value)} aria-label="View">
              <option value="mine">Mine</option>
              <option value="team">My team's</option>
              <option value="all">All I can see</option>
            </select>
          </label>
          <span className="mono log-unlock-badge">{unlockedDepartment}</span>
          <button type="button" className="log-btn" onClick={handleSwitchDepartment}>
            Switch department
          </button>
          <button type="button" className="log-btn" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>
      </header>

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
                {dash.drafts} {dash.drafts === 1 ? "draft is" : "drafts are"} not yet submitted.
              </p>
            </article>
            <article className="log-stat-card" data-testid="dash-screened">
              <div className="mono log-stat-kicker">Screened</div>
              <div className="log-stat-value" style={{ color: "var(--chart-go)" }}>
                {dash.screened}
              </div>
              <p>
                {dash.screenedThisMonth} this month (India time)
                {dash.screenedLastMonth > 0 || dash.screenedThisMonth > 0
                  ? `, ${dash.screenedThisMonth >= dash.screenedLastMonth ? "up" : "down"} from ${dash.screenedLastMonth} in ${dash.prevMonthName}`
                  : ""}
                . Incomplete ideas are not included.
              </p>
            </article>
            <article className="log-stat-card" data-testid="dash-go">
              <div className="mono log-stat-kicker">Verdict · GO</div>
              <div className="log-stat-value" style={{ color: "var(--chart-go)" }}>
                {dash.GO}
              </div>
            </article>
            <article className="log-stat-card" data-testid="dash-nogo">
              <div className="mono log-stat-kicker">Verdict · NO-GO</div>
              <div className="log-stat-value" style={{ color: "var(--chart-nogo)" }}>
                {dash["NO-GO"]}
              </div>
            </article>
            <article className="log-stat-card" data-testid="dash-watch">
              <div className="mono log-stat-kicker">Verdict · Watch</div>
              <div className="log-stat-value" style={{ color: "var(--chart-watch)" }}>
                {dash.WATCH}
              </div>
            </article>
            <article className="log-stat-card" data-testid="dash-waiting">
              <div className="mono log-stat-kicker">Waiting for approval</div>
              <div className="log-stat-value" style={{ color: "var(--chart-watch)" }}>
                {dash.waiting}
              </div>
              <p>Business head review pending</p>
            </article>
          </>
        )}
      </div>

      {!unavailable ? (
        <section className="stats-block" aria-labelledby="stats-overview-heading">
          <h2 id="stats-overview-heading" className="stats-block-title">
            Overview
          </h2>
          <section
            className="log-dash-charts"
            data-testid="dash-charts"
            aria-label="Screened ideas: by month, top people and teams"
          >
            <div className="log-dash-main">
              <MonthTrendChart title="Ideas screened per month" months={dashMonths} />
            </div>
            <div className="log-dash-side">
              <SimpleBars
                title={`Top 5 people by screened ideas in ${dash.monthName || "this month"}`}
                unit="screened ideas"
                items={dash.topPeople.map((g) => ({ key: g.key, label: g.label, value: g.verdicted }))}
                emptyText="No ideas screened this month yet."
              />
              <StackedBars
                title={`Ideas screened by team in ${dash.monthName || "this month"}`}
                groups={dash.teams}
                onSelect={(g) => {
                  setTeamFilter(g.filterValue || "");
                  if (dash.monthKey) setMonthFilter(dash.monthKey);
                }}
                emptyText="No ideas screened this month yet."
              />
            </div>
          </section>
        </section>
      ) : null}

      {!unavailable ? (
        <section className="log-analytics" aria-label="Ideas by team, month, person and date">
          <div className="stats-block-title-row">
            <h2 className="stats-block-title">Breakdown</h2>
          </div>
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
            A submitted idea is counted on the day of its first Submit; a draft on the day it was created. Click a row
            or bar to filter the table and charts on this page.
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
                <StackedBars title="Ideas screened by team" groups={summary.groups} onSelect={selectGroup} />
              ) : null}
              {activeTab === "person" ? (
                <StackedBars
                  title="Ideas screened by person (top 10)"
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
    </main>
  );
}

export const STATS_PAGE_CSS = `
.stats-page .stats-head{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;}
.stats-page .stats-title{margin:0;font-size:28px;letter-spacing:-.6px;line-height:1.15;}
.stats-head-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.stats-head-actions select{background:#fff;border:1px solid var(--card-border);border-radius:12px;padding:8px 10px;font-family:inherit;font-size:13px;color:var(--ink);}
.stats-block{display:flex;flex-direction:column;gap:12px;}
.stats-block-title-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;}
.stats-block-title{margin:0;font-size:16px;font-weight:700;letter-spacing:-.2px;}
.stats-page .log-analytics{padding-top:16px;}
`;
