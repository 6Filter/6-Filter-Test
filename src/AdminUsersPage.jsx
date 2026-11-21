import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { SUBMITTER_DEPARTMENTS } from "../lib/propositionFields.js";
import { DISPLAY_TITLES, storedRoleLabel } from "../lib/displayTitle.js";

const DEFAULT_ROLES = ["BM", "CMI", "FINANCE", "R&D", "SALES", "PACKAGING", "BH FORUM", "ADMIN"];

const TABS = [
  { id: "users", label: "Users" },
  { id: "divisions", label: "Division queue" },
  { id: "roster", label: "Roster import" },
  { id: "scoring", label: "Scoring re-score" },
  { id: "comparison", label: "Scoring comparison" },
  { id: "audit", label: "Audit" },
];

export default function AdminUsersPage({ apiFetch }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [teams, setTeams] = useState(SUBMITTER_DEPARTMENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [rosterFilter, setRosterFilter] = useState("");
  const [busyId, setBusyId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);
  const [notInRoster, setNotInRoster] = useState([]);
  const [rosterRows, setRosterRows] = useState([]);
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [audit, setAudit] = useState([]);
  const [leadEmail, setLeadEmail] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [bhRows, setBhRows] = useState([]);
  const [bhLoaded, setBhLoaded] = useState(false);
  const [bhEmail, setBhEmail] = useState("");
  const [bhTeam, setBhTeam] = useState("");
  const [bhPreview, setBhPreview] = useState(null);
  const [bhBusy, setBhBusy] = useState(false);
  const [divisionQueue, setDivisionQueue] = useState([]);
  const [divisionBusy, setDivisionBusy] = useState("");
  const [scoringPreview, setScoringPreview] = useState([]);
  const [scoringRuleset, setScoringRuleset] = useState("");
  const [scoringBusy, setScoringBusy] = useState(false);
  const [scoringConfirm, setScoringConfirm] = useState("");
  const [scoringSelected, setScoringSelected] = useState(() => new Set());
  const [scoringShadow, setScoringShadow] = useState(true);
  const [scoringWeightNote, setScoringWeightNote] = useState("");
  const [sequencesOk, setSequencesOk] = useState(true);
  const [sequenceDrift, setSequenceDrift] = useState([]);

  const loadUsers = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/users");
      setUsers(data.users || []);
      if (data.roles?.length) setRoles(data.roles);
      if (data.teams?.length) setTeams(data.teams);
    } catch (e) {
      setError(e.message || "Could not load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const loadRoster = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch("/api/admin/users/roster");
      setRosterRows(data.roster || []);
      setNotInRoster(data.notInRoster || []);
    } catch (e) {
      setError(e.message || "Could not load roster.");
    }
  }, [apiFetch]);

  const loadBhMapping = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch("/api/admin/users/business-head-teams");
      setBhRows(Array.isArray(data.rows) ? data.rows.map((r) => ({ email: r.email, team: r.team, note: r.note || "" })) : []);
      setBhLoaded(true);
      setBhPreview(null);
    } catch (e) {
      setBhLoaded(false);
      setError(e.message || "Could not load business-head mapping.");
    }
  }, [apiFetch]);

  const loadAudit = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch("/api/admin/users/audit");
      setAudit(data.audit || []);
    } catch (e) {
      setError(e.message || "Could not load audit.");
    }
  }, [apiFetch]);

  const loadDivisionQueue = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch("/api/admin/division-confirmations");
      setDivisionQueue(data.items || []);
    } catch (e) {
      setError(e.message || "Could not load division queue.");
      setDivisionQueue([]);
    }
  }, [apiFetch]);

  const loadScoringPreview = useCallback(async () => {
    setError("");
    setScoringBusy(true);
    try {
      const data = await apiFetch("/api/admin/scoring-audit");
      setScoringPreview(data.preview || []);
      setScoringRuleset(data.rulesetVersion || "");
      setScoringShadow(data.shadowMode !== false);
      setScoringWeightNote(data.weightEffectNote || "");
      setScoringSelected(new Set((data.preview || []).filter((r) => r.wouldChange).map((r) => r.id)));
    } catch (e) {
      setError(e.message || "Could not load scoring preview.");
      setScoringPreview([]);
    } finally {
      setScoringBusy(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/health", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSequencesOk(data.sequencesOk !== false);
        setSequenceDrift(Array.isArray(data.sequenceDrift) ? data.sequenceDrift : []);
      } catch {
        if (!cancelled) setSequencesOk(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab === "roster") {
      loadRoster();
      loadBhMapping();
    }
    if (tab === "audit") loadAudit();
    if (tab === "divisions") loadDivisionQueue();
    if (tab === "scoring" || tab === "comparison") loadScoringPreview();
  }, [tab, loadRoster, loadBhMapping, loadAudit, loadDivisionQueue, loadScoringPreview]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (teamFilter && String(u.team || "") !== teamFilter) return false;
      if (
        roleFilter &&
        String(u.title || "") !== roleFilter &&
        String(u.role || "") !== roleFilter &&
        storedRoleLabel(u.role) !== roleFilter
      ) {
        return false;
      }
      if (rosterFilter === "in" && !u.inRoster) return false;
      if (rosterFilter === "out" && u.inRoster) return false;
      if (!needle) return true;
      return (
        String(u.email || "").toLowerCase().includes(needle) ||
        String(u.name || "").toLowerCase().includes(needle)
      );
    });
  }, [users, q, teamFilter, roleFilter, rosterFilter]);

  async function patchUser(id, patch) {
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadUsers();
    } catch (e) {
      setError(e.message || "Update failed.");
    } finally {
      setBusyId("");
    }
  }

  async function runPreview() {
    setError("");
    setPreview(null);
    try {
      const data = await apiFetch("/api/admin/users/roster/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      setPreview(data.preview || data);
    } catch (e) {
      setError(e.message || "Preview failed.");
      if (e.preview) setPreview(e.preview);
    }
  }

  async function runApply() {
    if (!preview?.ok) {
      setError("Preview must be clean before applying.");
      return;
    }
    if (!window.confirm("Apply this roster import? Roster rows update; account default teams stay as each person set them.")) return;
    setError("");
    try {
      await apiFetch("/api/admin/users/roster/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          confirm: true,
          deactivateMissing,
        }),
      });
      setPreview(null);
      await loadRoster();
      await loadUsers();
    } catch (e) {
      setError(e.message || "Apply failed.");
    }
  }

  async function runSetLead() {
    setError("");
    try {
      await apiFetch("/api/admin/users/roster/set-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail, leadEmail }),
      });
      setMemberEmail("");
      setLeadEmail("");
      await loadRoster();
    } catch (e) {
      setError(e.message || "Could not set lead.");
    }
  }

  async function downloadRosterTemplate() {
    setError("");
    try {
      const res = await fetch("/api/admin/users/roster/template", { credentials: "include" });
      if (!res.ok) throw new Error("Could not download the roster template.");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "Roster_Template.csv";
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e.message || "Could not download the roster template.");
    }
  }

  function addBhRow() {
    const email = String(bhEmail || "").trim().toLowerCase();
    const team = String(bhTeam || "").trim();
    if (!email || !team) return;
    if (bhRows.some((r) => r.email === email && r.team === team)) return;
    setBhRows([...bhRows, { email, team, note: "" }]);
    setBhEmail("");
    setBhPreview(null);
  }

  function removeBhRow(email, team) {
    setBhRows(bhRows.filter((r) => !(r.email === email && r.team === team)));
    setBhPreview(null);
  }

  async function previewBhMapping() {
    if (!bhLoaded) {
      setError("Load the current mapping before previewing. Save always sends the complete list.");
      return;
    }
    setBhBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/users/business-head-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewOnly: true, rows: bhRows }),
      });
      setBhPreview(data);
    } catch (e) {
      setError(e.message || "Could not preview the mapping.");
    } finally {
      setBhBusy(false);
    }
  }

  async function saveBhMapping() {
    if (!bhLoaded) {
      setError("Load the current mapping first. Saving replaces the whole list.");
      return;
    }
    if (!window.confirm(`Save ${bhRows.length} business-head mapping row(s)? This replaces the whole list.`)) return;
    setBhBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/users/business-head-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bhRows }),
      });
      setBhRows(Array.isArray(data.rows) ? data.rows : bhRows);
      setBhPreview(null);
      await loadUsers();
    } catch (e) {
      setError(e.message || "Could not save the mapping.");
    } finally {
      setBhBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-head">
        <h1>Admin</h1>
        <p>Users, org roster, and audit. ADMIN only.</p>
      </header>
      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`nav-tab${tab === t.id ? " active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {!sequencesOk ? (
        <p className="admin-error" role="alert" data-testid="sequence-drift-warning">
          Database serial counters are behind copied rows ({sequenceDrift.map((d) => `${d.table}.${d.column}`).join(", ") || "see /api/health"}).
          Deletes can fail until the app repairs them on start-up — or run repairSerialSequences / the setval SQL in the Hotfix note.
        </p>
      ) : null}

      {tab === "scoring" ? (
        <section className="admin-panel">
          <p className="admin-hint">
            Preview every sealed score against the current ruleset ({scoringRuleset || "…"}) using stored
            evidence only — no AI calls. Re-score writes a new sealed snapshot and keeps the old number in
            the audit trail.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <button type="button" className="ghost" onClick={loadScoringPreview} disabled={scoringBusy}>
              {scoringBusy ? <Loader2 size={14} className="spin" /> : null}
              Refresh preview
            </button>
            <input
              value={scoringConfirm}
              onChange={(e) => setScoringConfirm(e.target.value)}
              placeholder='Type RE-SCORE to confirm'
              style={{ minWidth: 180 }}
            />
            <button
              type="button"
              disabled={scoringBusy || scoringConfirm !== "RE-SCORE" || !scoringSelected.size}
              onClick={async () => {
                setScoringBusy(true);
                setError("");
                try {
                  await apiFetch("/api/admin/scoring-rescore", {
                    method: "POST",
                    body: JSON.stringify({
                      confirm: "RE-SCORE",
                      ids: [...scoringSelected],
                    }),
                  });
                  setScoringConfirm("");
                  await loadScoringPreview();
                } catch (e) {
                  setError(e.message || "Re-score failed.");
                } finally {
                  setScoringBusy(false);
                }
              }}
            >
              Re-score selected ({scoringSelected.size})
            </button>
            <button
              type="button"
              disabled={scoringBusy || scoringConfirm !== "RE-SCORE"}
              onClick={async () => {
                setScoringBusy(true);
                setError("");
                try {
                  await apiFetch("/api/admin/scoring-rescore", {
                    method: "POST",
                    body: JSON.stringify({ confirm: "RE-SCORE" }),
                  });
                  setScoringConfirm("");
                  await loadScoringPreview();
                } catch (e) {
                  setError(e.message || "Bulk re-score failed.");
                } finally {
                  setScoringBusy(false);
                }
              }}
            >
              Re-score all that change
            </button>
          </div>
          {!scoringPreview.length ? (
            <p>{scoringBusy ? "Loading…" : "No screened ideas found."}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th />
                  <th>Idea</th>
                  <th>Stored</th>
                  <th>Current rules</th>
                  <th>Status</th>
                  <th>Change?</th>
                </tr>
              </thead>
              <tbody>
                {scoringPreview.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={scoringSelected.has(row.id)}
                        onChange={(e) => {
                          setScoringSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{row.name || row.id}</td>
                    <td className="mono">
                      {row.storedClass} {row.storedPct}%
                    </td>
                    <td className="mono">
                      {row.liveClass} {row.livePct}%
                    </td>
                    <td>{row.scoreStatus}</td>
                    <td>{row.wouldChange ? "yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "comparison" ? (
        <section className="admin-panel">
          <p className="admin-hint">
            Part 133 shadow mode ({scoringShadow ? "ON" : "OFF"}): users still see the legacy binary
            verdict; relevance is stored for calibration. Ruleset {scoringRuleset || "…"}.{" "}
            {scoringWeightNote ||
              "Equal CHECK_WEIGHTS: Filter 4 is ~41% of the score; five judged Filter 1 checks are ~29%."}
          </p>
          <button type="button" className="ghost" onClick={loadScoringPreview} disabled={scoringBusy}>
            {scoringBusy ? <Loader2 size={14} className="spin" /> : null}
            Refresh comparison
          </button>
          {!scoringPreview.length ? (
            <p>{scoringBusy ? "Loading…" : "No screened ideas found."}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Idea</th>
                  <th>Legacy %</th>
                  <th>Legacy verdict</th>
                  <th>Relevance %</th>
                  <th>Relevance verdict</th>
                  <th>Checks moved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scoringPreview.map((row) => (
                  <tr key={`cmp-${row.id}`}>
                    <td>{row.name || row.id}</td>
                    <td className="mono">{row.legacyPct ?? "—"}%</td>
                    <td className="mono">{row.legacyClass || "—"}</td>
                    <td className="mono">{row.relevancePct ?? "—"}%</td>
                    <td className="mono">{row.relevanceClass || "—"}</td>
                    <td className="mono">
                      {(row.moved || []).length
                        ? (row.moved || [])
                            .map((m) => `${m.filter}: ${m.binary}→${m.credit}`)
                            .join("; ")
                        : "—"}
                    </td>
                    <td>{row.scoreStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "divisions" ? (
        <section className="admin-panel">
          <p className="admin-hint">
            Ideas where AI and keyword rules disagreed, confidence was low, or someone reported a wrong
            division. Only ADMIN can set the division.
          </p>
          <button type="button" className="ghost" onClick={loadDivisionQueue}>
            Refresh
          </button>
          {!divisionQueue.length ? (
            <p>No ideas need division confirmation.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Idea</th>
                  <th>Detected</th>
                  <th>Rules</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                  <th>Correct to</th>
                </tr>
              </thead>
              <tbody>
                {divisionQueue.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.id}</code>
                      <div>{row.name || "(untitled)"}</div>
                      {row.divisionReviewRequested ? (
                        <span className="admin-pill">Reporter asked</span>
                      ) : null}
                    </td>
                    <td>{row.division || "—"}</td>
                    <td>{row.rulesDivision || "—"}</td>
                    <td>{row.confidence || "—"}</td>
                    <td className="admin-reason">{row.reason || "—"}</td>
                    <td>
                      <select
                        aria-label={`Correct division for ${row.id}`}
                        disabled={divisionBusy === row.id}
                        defaultValue=""
                        onChange={async (e) => {
                          const division = e.target.value;
                          if (!division) return;
                          setDivisionBusy(row.id);
                          setError("");
                          try {
                            await apiFetch(
                              `/api/propositions/${encodeURIComponent(row.id)}/correct-division`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  division,
                                  reason: `ADMIN confirmed from division queue (${row.division || "none"} → ${division})`,
                                }),
                              }
                            );
                            await loadDivisionQueue();
                          } catch (err) {
                            setError(err.message || "Could not correct division.");
                          } finally {
                            setDivisionBusy("");
                          }
                        }}
                      >
                        <option value="">Set division…</option>
                        {[
                          "Professional Care",
                          "Personal Care",
                          "Foods",
                          "Snacks",
                          "Bakery",
                          "Ambient Dairy",
                          "Beverages",
                          "Dairy Craft — Non-UHT",
                          "Cold Chain Business",
                          "Dairy Craft — UHT Milk",
                          "International Business",
                        ].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="admin-panel">
          <div className="admin-filters">
            <input
              placeholder="Search name or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search users"
            />
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Team filter">
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Title filter">
              <option value="">All titles</option>
              {DISPLAY_TITLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {roles
                .filter((r) => !["BM", "BH FORUM", "ADMIN"].includes(r))
                .map((r) => (
                  <option key={r} value={r}>
                    {storedRoleLabel(r)}
                  </option>
                ))}
            </select>
            <select
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value)}
              aria-label="Roster filter"
            >
              <option value="">In or out of roster</option>
              <option value="in">In roster</option>
              <option value="out">Not in roster</option>
            </select>
            <button type="button" className="ghost" onClick={loadUsers} disabled={loading}>
              {loading ? <Loader2 size={14} className="spin" /> : null} Refresh
            </button>
          </div>
          {loading ? (
            <p>
              <Loader2 className="spin" size={16} /> Loading…
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Team</th>
                    <th>Title</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Roster</th>
                    <th>Last sign-in</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.team || ""}
                          disabled={busyId === u.id}
                          onChange={(e) => patchUser(u.id, { team: e.target.value })}
                          aria-label={`Team for ${u.email}`}
                        >
                          <option value="">—</option>
                          {teams.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.title || storedRoleLabel(u.role)}</td>
                      <td>
                        <select
                          value={u.role || "BM"}
                          disabled={busyId === u.id}
                          onChange={(e) => patchUser(u.id, { role: e.target.value })}
                          aria-label={`Title for ${u.email}`}
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {storedRoleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={u.status || "active"}
                          disabled={busyId === u.id}
                          onChange={(e) => patchUser(u.id, { status: e.target.value })}
                          aria-label={`Status for ${u.email}`}
                        >
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </td>
                      <td>
                        {u.inRoster ? (
                          <span>
                            {u.orgRole}
                            {u.rosterActive === false ? " (inactive)" : ""}
                          </span>
                        ) : (
                          <em>Not in roster</em>
                        )}
                      </td>
                      <td>{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          disabled={busyId === u.id}
                          onClick={() => patchUser(u.id, { signOutEverywhere: true })}
                        >
                          Sign out everywhere
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "roster" ? (
        <section className="admin-panel">
          <h2>Import org roster</h2>
          <p>
            CSV columns: <code>email,name,team,org_role,reports_to_email</code>. Preview first; apply only after
            confirm.{" "}
            <button type="button" className="ghost" onClick={downloadRosterTemplate}>
              Download roster template
            </button>
          </p>
          <textarea
            rows={10}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV…"
            aria-label="Roster CSV"
          />
          <div className="admin-actions">
            <button type="button" onClick={runPreview} disabled={!csvText.trim()}>
              Preview
            </button>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={deactivateMissing}
                onChange={(e) => setDeactivateMissing(e.target.checked)}
              />
              On apply, mark people missing from the file as inactive
            </label>
            <button type="button" onClick={runApply} disabled={!preview?.ok}>
              Apply import
            </button>
          </div>
          {preview ? (
            <div className="admin-preview">
              <p>
                {preview.ok ? "Ready to apply" : preview.error} · rows {preview.rowCount ?? 0} · would change{" "}
                {preview.wouldChange ?? 0} · unchanged {preview.unchanged ?? 0}
              </p>
              {(preview.issues || []).length ? (
                <ul>
                  {preview.issues.map((it, i) => (
                    <li key={`${it.email}-${i}`}>
                      Line {it.line}: {it.email} — {(it.reasons || []).join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {(preview.bhDisagreements || []).length ? (
                <ul>
                  {preview.bhDisagreements.map((d, i) => (
                    <li key={`${d.email}-${i}`}>
                      BH map: {d.email} / {d.team} — {d.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {(preview.missingFromFile || []).length ? (
                <div>
                  <h3>Not in file (still active)</h3>
                  <ul>
                    {preview.missingFromFile.map((m) => (
                      <li key={m.email}>
                        {m.name} ({m.email}) — {m.team}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <h2>Not in the roster</h2>
          {notInRoster.length === 0 ? (
            <p>Everyone who has signed in is on the roster.</p>
          ) : (
            <ul>
              {notInRoster.map((u) => (
                <li key={u.id}>
                  {u.name} ({u.email}) — team {u.team || "—"}
                </li>
              ))}
            </ul>
          )}

          <h2>Business head teams</h2>
          <p>
            A Business Head has one roster team. Extra teams they cover are mapped here. Saving{" "}
            <strong>replaces the whole list</strong>, so the screen loads every current row first and sends
            the complete list.
          </p>
          {!bhLoaded ? (
            <p className="admin-muted">Mapping not loaded. Open this tab again or refresh.</p>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Team</th>
                      <th>Signed in</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bhRows.length === 0 ? (
                      <tr>
                        <td colSpan={4}>No mapping rows. Business Heads currently see only their own ideas.</td>
                      </tr>
                    ) : (
                      bhRows.map((r) => {
                        const signed = users.find((u) => String(u.email || "").toLowerCase() === r.email);
                        const warn = !signed || !signed.lastSignInAt;
                        return (
                          <tr key={`${r.email}|${r.team}`}>
                            <td>{r.email}</td>
                            <td>{r.team}</td>
                            <td>
                              {warn ? (
                                <em>This Business Head has not signed in yet.</em>
                              ) : (
                                new Date(signed.lastSignInAt).toLocaleString()
                              )}
                            </td>
                            <td>
                              <button type="button" className="ghost" onClick={() => removeBhRow(r.email, r.team)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="admin-filters">
                <input
                  placeholder="Business Head email"
                  value={bhEmail}
                  onChange={(e) => setBhEmail(e.target.value)}
                  aria-label="Business Head email"
                />
                <select value={bhTeam} onChange={(e) => setBhTeam(e.target.value)} aria-label="Mapped team">
                  <option value="">Team</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addBhRow} disabled={!bhEmail.trim() || !bhTeam}>
                  Add row
                </button>
                <button type="button" className="ghost" onClick={previewBhMapping} disabled={bhBusy}>
                  Preview
                </button>
                <button type="button" onClick={saveBhMapping} disabled={bhBusy || !bhLoaded}>
                  Save mapping
                </button>
              </div>
              {bhPreview ? (
                <div className="admin-preview">
                  <p>
                    Preview {bhPreview.count ?? (bhPreview.preview || []).length} row(s). Invalid teams or
                    emails are marked not ok.
                  </p>
                  <ul>
                    {(bhPreview.preview || []).map((p, i) => (
                      <li key={`${p.email}-${p.team}-${i}`}>
                        {p.email} — {p.team}
                        {p.ok ? "" : " (not ok)"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          <h2>Set lead</h2>
          <div className="admin-filters">
            <input
              placeholder="Member email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
            />
            <input placeholder="Lead email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
            <button type="button" onClick={runSetLead} disabled={!memberEmail || !leadEmail}>
              Set lead
            </button>
          </div>
          <p className="admin-muted">{rosterRows.filter((r) => r.active).length} active roster rows.</p>
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="admin-panel">
          <button type="button" className="ghost" onClick={loadAudit}>
            Refresh
          </button>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}</td>
                    <td>{a.action}</td>
                    <td>{a.targetEmail || a.targetUserId || "—"}</td>
                    <td>
                      <code>{JSON.stringify(a.detail || {})}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <style>{`
.admin-page{padding:28px 32px 64px;max-width:1200px;margin:0 auto;color:var(--ink,#f3eaf8);}
.admin-head h1{font-size:1.6rem;margin:0 0 4px;}
.admin-head p{opacity:.75;margin:0 0 16px;}
.admin-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.admin-error{color:#f5a3a3;margin:8px 0 16px;}
.admin-panel{display:grid;gap:12px;}
.admin-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.admin-filters input,.admin-filters select,.admin-panel textarea,.admin-table select{
  background:#1a1224;color:#f3eaf8;border:1px solid rgba(201,160,232,.28);border-radius:8px;padding:8px 10px;
}
.admin-table-wrap{overflow:auto;border:1px solid rgba(201,160,232,.2);border-radius:10px;}
.admin-table{width:100%;border-collapse:collapse;font-size:13px;}
.admin-table th,.admin-table td{padding:8px 10px;border-bottom:1px solid rgba(201,160,232,.12);text-align:left;vertical-align:top;}
.admin-table th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.7;}
.admin-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;}
.admin-check{display:flex;gap:8px;align-items:center;font-size:13px;}
.admin-preview{padding:12px;border:1px solid rgba(201,160,232,.25);border-radius:10px;background:rgba(0,0,0,.2);}
.admin-muted{opacity:.65;font-size:13px;}
.admin-panel textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px;}
`}</style>
    </main>
  );
}
