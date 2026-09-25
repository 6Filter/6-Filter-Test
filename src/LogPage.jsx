import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  exportPropositionsToExcel,
  resolveFullPropositions,
} from "../lib/logExport.js";
import {
  applyLogStatusFilter,
  applyScopedFilters,
  filterSegments,
  filterStageLabel,
  isUntouchedDraft,
  logStats,
  propositionStatus,
  researchWasUsed,
  rowPerson,
  rowTeam,
  submittedParts,
  uniqueLogValues,
} from "../lib/logStatus.js";
import { LOG_UNLOCK_OPTIONS, isMasterUnlock } from "../lib/departmentAuthConstants.js";
import { formatIdeaWipeLabel, ideaWipeAt } from "../lib/lockedConstants.js";
import { ideaSizeForResult } from "../lib/ideaScale.js";

const PILLS = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "CLEARED", label: "Cleared" },
  { id: "STOPPED", label: "Stopped" },
  { id: "REVIEW", label: "Review" },
  { id: "ai-used", label: "AI used" },
];

const CHIP = {
  OPEN: { label: "Open", cls: "chip-open" },
  CLEARED: { label: "Cleared", cls: "chip-cleared" },
  STOPPED: { label: "Stopped", cls: "chip-stopped" },
  REVIEW: { label: "Review", cls: "chip-review" },
};

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
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [personFilter, setPersonFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingId, setExportingId] = useState("");
  const [exportError, setExportError] = useState("");
  const [gateReady, setGateReady] = useState(unlockedDepartmentProp !== undefined);
  const [unlockedDepartmentLocal, setUnlockedDepartmentLocal] = useState(null);
  const [selectedDept, setSelectedDept] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const unlockedDepartment =
    unlockedDepartmentProp !== undefined ? unlockedDepartmentProp : unlockedDepartmentLocal;
  const uniqueSubmitters = useMemo(() => uniqueLogValues(rows, rowPerson), [rows]);
  const stats = useMemo(() => logStats(rows), [rows]);
  const scopedRows = useMemo(
    () => applyScopedFilters(rows, { personFilter, searchText: query }),
    [rows, personFilter, query]
  );
  const filteredRows = useMemo(
    () => applyLogStatusFilter(scopedRows, status),
    [scopedRows, status]
  );
  const aiUsedCount = useMemo(
    () => scopedRows.filter((r) => researchWasUsed(r)).length,
    [scopedRows]
  );
  const untouchedCount = useMemo(() => rows.filter((r) => isUntouchedDraft(r)).length, [rows]);
  const busy = loading || deletingAll || deletingUntouched || exporting;
  const masterView = isMasterUnlock(unlockedDepartment);
  const allowDelete = masterView;
  const scopedStats = useMemo(() => logStats(scopedRows), [scopedRows]);
  const pillCounts = useMemo(
    () => ({
      ALL: scopedStats.total,
      OPEN: scopedStats.open,
      CLEARED: scopedStats.cleared,
      STOPPED: scopedStats.stopped,
      REVIEW: scopedStats.review,
      "ai-used": aiUsedCount,
    }),
    [scopedStats, aiUsedCount]
  );

  function exportHint() {
    if (personFilter) return `propositions-${personFilter}`;
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
    if (!row?.id || exporting) return;
    setExportingId(row.id);
    const hint = String(row.name || "idea").trim() || "idea";
    await handleExport([row], hint);
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
      <div className="log-stats">
        <article className="log-stat-card">
          <div className="mono log-stat-kicker">Submitted</div>
          <div className="log-stat-value">{stats.submittedThisMonth}</div>
          <p>Propositions created this month</p>
        </article>
        <article className="log-stat-card">
          <div className="mono log-stat-kicker">Cleared all six</div>
          <div className="log-stat-value">{stats.cleared}</div>
          <p>{stats.clearedRate}% pass rate of {stats.total} on the log</p>
        </article>
        <article className="log-stat-card">
          <div className="mono log-stat-kicker">Open drafts</div>
          <div className="log-stat-value">{stats.open}</div>
          <p>{stats.staleOpen} not touched in 7+ days</p>
        </article>
      </div>

      <section className="log-card">
        <div className="log-card-head">
          <div>
            <h2 className="log-title">Proposition log</h2>
            <p className="log-sub">
              {isMasterUnlock(unlockedDepartment)
                ? "Viewing all department submissions. Search, filter, or export across teams."
                : `Viewing ${unlockedDepartment} submissions. Search, filter, or export this department only.`}{" "}
              Click a row to open the form.
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
            >
              {exporting && !exportingId ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              {personFilter || query.trim() || status !== "ALL"
                ? `Export (${filteredRows.length} matching)`
                : "Export all"}
            </button>
            <button
              type="button"
              className="log-btn"
              onClick={onCleanupUntouched}
              disabled={busy || untouchedCount === 0 || !canCleanup || !allowDelete}
              title={masterView ? undefined : "Only Master can delete"}
            >
              {deletingUntouched ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              Clean up untouched drafts ({untouchedCount})
            </button>
            <button
              type="button"
              className="log-btn log-btn-danger"
              onClick={onDeleteAll}
              disabled={busy || rows.length === 0 || !canDeleteAll || !allowDelete}
              title={masterView ? undefined : "Only Master can delete"}
            >
              {deletingAll ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              Delete all
            </button>
          </div>
        </div>

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
              <span className="sr-only">Submitter</span>
              <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
                <option value="">All submitters</option>
                {uniqueSubmitters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="log-pills" role="tablist" aria-label="Status filter">
            {PILLS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={status === p.id}
                className={`log-pill${status === p.id ? " is-active" : ""}`}
                onClick={() => setStatus(p.id)}
              >
                {p.label}
                <span className="mono">{pillCounts[p.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="log-toolbar-meta">
            <span className="mono log-sort">Sorted by last updated</span>
            <div className="log-legend" aria-label="Filter bar colour key">
              <span><i className="tone-pass" /> Pass</span>
              <span><i className="tone-fail" /> Fail</span>
              <span><i className="tone-review" /> In review</span>
              <span><i className="tone-none" /> Locked</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> {error}
          </div>
        ) : null}
        {exportError ? (
          <div className="log-err" role="alert">
            <AlertTriangle size={14} /> {exportError}
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
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
                  <th>Idea</th>
                  <th>Filters</th>
                  <th>Submitted</th>
                  <th className="log-th-del"><span className="sr-only">Actions</span></th>
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
                  const usedAi = researchWasUsed(h);
                  const isExportingRow = exportingId === h.id;
                  const rowBusy = openingDisabled || Boolean(deletingId) || deletingAll || deletingUntouched || exporting;
                  const screened = Boolean(h.goNoGo?.classification || h.classification);
                  const sizeTier = screened ? ideaSizeForResult(h) : null;
                  const wipeLabel = formatIdeaWipeLabel(ideaWipeAt(h));
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
                            <span className={`research-badge ${usedAi ? "used" : "unused"}`}>
                              {usedAi ? "AI used" : "No API calls"}
                            </span>
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
                        <span className="log-dept-team">{team}</span>
                        {division && division !== team ? (
                          <span className="log-dept-division">{division}</span>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="log-open log-idea-cell"
                          title={idea || undefined}
                          onClick={() => onOpen(h)}
                          disabled={rowBusy}
                        >
                          {idea || "—"}
                        </button>
                      </td>
                      <td>
                        <FilterBar segments={segs} stage={stage} />
                      </td>
                      <td className="mono log-submitted">
                        <span>{when.date}</span>
                        <span>{when.time}</span>
                      </td>
                      <td>
                        <div className="log-row-actions">
                          <button
                            type="button"
                            className="log-del log-export-row"
                            aria-label="Export this idea"
                            title="Export this idea"
                            disabled={rowBusy}
                            onClick={() => handleExportRow(h)}
                          >
                            {isExportingRow ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                          </button>
                          {allowDelete && canDeleteRow ? (
                          <button
                            type="button"
                            className="log-del"
                            aria-label="Delete this proposition"
                            title="Delete proposition"
                            disabled={rowBusy}
                            onClick={() => onDeleteRow(h)}
                          >
                            {isDeleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
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

export const LOG_PAGE_CSS = `
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
  max-width:1180px;margin:0 auto;padding:16px 28px 40px;
  display:flex;flex-direction:column;gap:18px;
}
.log-page .mono{font-family:'IBM Plex Mono',monospace;}
.log-page .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;}
.log-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
.log-stat-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px 18px;}
.log-stat-kicker{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 6px;}
.log-stat-value{font-size:32px;font-weight:700;letter-spacing:-.8px;line-height:1.1;}
.log-stat-card p{margin:6px 0 0;font-size:13px;color:var(--ink-secondary);}
.log-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;padding:22px 22px 8px;}
.log-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin:0 0 16px;}
.log-page .log-title{margin:0 0 6px;font-size:22px;color:var(--ink);}
.log-page .log-sub{margin:0;font-size:13px;color:var(--ink-secondary);max-width:560px;line-height:1.45;}
.log-page .log-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
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
.log-legend .tone-none,.log-seg-bit.tone-none{background:var(--none);}
.log-err{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--danger-hover-bg);color:var(--danger-text);font-size:13px;}
.log-page .log-empty{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 12px;color:var(--ink-muted);font-size:14px;}
.log-table-wrap{overflow:auto;margin:0;}
.log-table{width:100%;border-collapse:collapse;border-spacing:0;min-width:880px;}
.log-table th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);background:var(--table-header-bg);padding:10px 12px;border-bottom:1px solid var(--table-border);font-weight:700;}
.log-table td{padding:12px;border-bottom:1px solid var(--table-border);vertical-align:top;background:var(--card-bg);}
.log-tr:hover td{background:var(--table-row-hover);}
.log-open{display:block;width:100%;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.log-open:disabled{opacity:.6;cursor:wait;}
.log-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 10px;border-radius:999px;}
.log-chip.chip-open{background:var(--chip-open-bg);color:var(--chip-open-fg);}
.log-chip.chip-cleared{background:var(--chip-cleared-bg);color:var(--chip-cleared-fg);}
.log-chip.chip-stopped{background:var(--chip-stopped-bg);color:var(--chip-stopped-fg);}
.log-chip.chip-review{background:var(--chip-review-bg);color:var(--chip-review-fg);}
.log-scale-cell{white-space:nowrap;vertical-align:middle;}
.log-scale-chip{
  display:inline-flex;align-items:center;font-size:11px;font-weight:700;letter-spacing:.04em;
  padding:5px 10px;border-radius:999px;background:#E8E4D6;color:#3A3428;
}
.log-scale-chip[data-provisional="true"]{opacity:.9;}
.log-scale-empty{color:var(--ink-muted);font-size:12px;}
.log-status-cell{display:flex;flex-direction:column;align-items:flex-start;gap:6px;}
.research-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:650;letter-spacing:.02em;padding:3px 8px;border-radius:999px;white-space:nowrap;}
.research-badge.used{background:var(--chip-cleared-bg);color:var(--chip-cleared-fg);}
.research-badge.unused{background:var(--none);color:var(--ink-muted);}
.log-prop-cell{display:flex;flex-direction:column;gap:2px;}
.log-prop-name{font-weight:650;color:var(--ink);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.log-wipe-chip{display:inline-block;margin:0 8px 2px 0;padding:2px 8px;border-radius:999px;background:#FBF1EE;border:1px solid var(--danger-border);color:var(--danger-text);font-size:10px;font-weight:700;letter-spacing:.02em;vertical-align:middle;white-space:nowrap;}
.log-prop-owner{font-size:12px;color:var(--ink-secondary);}
.log-dept-cell{font-size:12px;color:var(--ink-secondary-2);white-space:nowrap;}
.log-dept-team{display:block;font-weight:650;color:var(--ink);}
.log-dept-division{display:block;font-size:11px;color:var(--ink-muted);margin-top:2px;}
.log-idea-cell{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-secondary);font-size:13px;}
.log-filters-cell{min-width:140px;}
.log-seg{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;height:8px;margin:0 0 6px;}
.log-seg-bit{display:block;height:100%;border-radius:999px;background:var(--none);}
.log-stage{font-size:11px;color:var(--ink-muted-2);line-height:1.35;}
.log-submitted{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--ink-secondary);white-space:nowrap;}
.log-th-del,.log-table td:last-child{width:84px;text-align:right;}
.log-row-actions{display:inline-flex;align-items:center;justify-content:flex-end;gap:2px;}
.log-page .log-del{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;background:transparent;color:var(--ink-muted);border-radius:8px;cursor:pointer;}
.log-page .log-del:hover:not(:disabled){background:var(--danger-hover-bg);color:var(--danger-text);}
.log-page .log-del:disabled{opacity:.45;cursor:not-allowed;}
@media (max-width:860px){
  .log-stats{grid-template-columns:1fr;}
  .log-page{padding:16px 16px 32px;}
}
`;
