import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { SUBMITTER_DEPARTMENTS } from "../lib/propositionFields.js";

export default function AdminUsersPage({ apiFetch }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [selectedLegacy, setSelectedLegacy] = useState({});
  const [reassignTeam, setReassignTeam] = useState("");
  const [bhRows, setBhRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [bhText, setBhText] = useState("");
  const [bhPreview, setBhPreview] = useState(null);
  const [reassignBusy, setReassignBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/users");
      setUsers(data.users || []);
      setRoles(data.roles || []);
      const ua = await apiFetch("/api/admin/users/unassigned");
      setUnassigned(ua.propositions || []);
      setLegacy(ua.legacy || []);
      setSelectedLegacy({});
      const bh = await apiFetch("/api/admin/users/business-head-teams");
      setBhRows(bh.rows || []);
    } catch (e) {
      setError(e.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchUser(id, body) {
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setError(e.message || "Update failed.");
    } finally {
      setBusyId("");
    }
  }

  function parseBhCsv(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^email\s*,/i.test(line))
      .map((line) => {
        const [email, team, note] = line.split(",").map((p) => p.trim());
        return { email, team, note };
      });
  }

  async function previewBh() {
    setError("");
    try {
      const rows = parseBhCsv(bhText);
      const data = await apiFetch("/api/admin/users/business-head-teams", {
        method: "POST",
        body: JSON.stringify({ previewOnly: true, rows }),
      });
      setBhPreview(data.preview || []);
    } catch (e) {
      setError(e.message || "Preview failed.");
    }
  }

  async function importBh() {
    setError("");
    try {
      const rows = parseBhCsv(bhText);
      await apiFetch("/api/admin/users/business-head-teams", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setBhPreview(null);
      setBhText("");
      await load();
    } catch (e) {
      setError(e.message || "Import failed.");
    }
  }

  function toggleLegacy(id) {
    setSelectedLegacy((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function reassignSelected() {
    const propositionIds = Object.keys(selectedLegacy).filter((id) => selectedLegacy[id]);
    if (!propositionIds.length || !reassignTeam) {
      setError("Select legacy ideas and a target team.");
      return;
    }
    setReassignBusy(true);
    setError("");
    try {
      await apiFetch("/api/admin/users/reassign-team", {
        method: "POST",
        body: JSON.stringify({ propositionIds, team: reassignTeam }),
      });
      setReassignTeam("");
      await load();
    } catch (e) {
      setError(e.message || "Reassign failed.");
    } finally {
      setReassignBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <style>{ADMIN_CSS}</style>
      <header className="admin-head">
        <div>
          <h1>Admin</h1>
          <p>Users, business-head mapping, and unassigned ideas.</p>
        </div>
        <button type="button" className="admin-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </header>
      {error ? (
        <p className="admin-err" role="alert">
          <AlertTriangle size={14} /> {error}
        </p>
      ) : null}

      <section className="admin-card">
        <h2>Users</h2>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={u.team || ""}
                      disabled={busyId === u.id}
                      onChange={(e) => patchUser(u.id, { team: e.target.value })}
                    >
                      <option value="">—</option>
                      {SUBMITTER_DEPARTMENTS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.status}</td>
                  <td className="mono">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "—"}</td>
                  <td className="admin-actions">
                    {u.status === "active" ? (
                      <button type="button" onClick={() => patchUser(u.id, { status: "disabled" })}>
                        Disable
                      </button>
                    ) : (
                      <button type="button" onClick={() => patchUser(u.id, { status: "active" })}>
                        Re-enable
                      </button>
                    )}
                    <button type="button" onClick={() => patchUser(u.id, { signOutEverywhere: true })}>
                      Sign out everywhere
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2>Business head mapping</h2>
        <p className="admin-sub">
          Paste CSV with columns email,team,note. Preview before import. File stays local — do not commit.
        </p>
        <p className="admin-sub mono">{bhRows.length} mapped rows currently stored.</p>
        <textarea
          value={bhText}
          onChange={(e) => setBhText(e.target.value)}
          rows={6}
          placeholder={"email,team,note\nname@cavinkare.com,Manufacturing,"}
        />
        <div className="admin-actions">
          <button type="button" className="admin-btn" onClick={previewBh}>
            Preview
          </button>
          <button type="button" className="admin-btn" onClick={importBh} disabled={!bhPreview?.length}>
            Import
          </button>
        </div>
        {bhPreview ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Team</th>
                  <th>OK</th>
                </tr>
              </thead>
              <tbody>
                {bhPreview.map((r, i) => (
                  <tr key={`${r.email}-${i}`}>
                    <td className="mono">{r.email}</td>
                    <td>{r.team}</td>
                    <td>{r.ok ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="admin-card">
        <h2>Unassigned ideas</h2>
        <p className="admin-sub">{unassigned.length} ideas with no creator email.</p>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Submitter</th>
                <th>Team</th>
                <th>Id</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((p) => (
                <tr key={p.id}>
                  <td>{p.name || "Untitled"}</td>
                  <td>{p.submitterName || "—"}</td>
                  <td>
                    {p.teamIsLegacy ? `Legacy: ${p.submitterDepartment}` : p.submitterDepartment || "—"}
                  </td>
                  <td className="mono">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2>Legacy teams (NPD, Marketing, …)</h2>
        <p className="admin-sub">
          {legacy.length} ideas still on a retired team name. Visible to ADMIN only until reassigned.
          Select rows and choose one of the 18 teams — nothing is deleted.
        </p>
        <div className="admin-actions" style={{ marginBottom: 10 }}>
          <select
            value={reassignTeam}
            onChange={(e) => setReassignTeam(e.target.value)}
            aria-label="Reassign to team"
          >
            <option value="">— reassign to team —</option>
            {SUBMITTER_DEPARTMENTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn"
            disabled={reassignBusy || !reassignTeam}
            onClick={reassignSelected}
          >
            {reassignBusy ? <Loader2 size={15} className="spin" /> : null}
            Reassign team
          </button>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Submitter</th>
                <th>Stored team</th>
                <th>Id</th>
              </tr>
            </thead>
            <tbody>
              {legacy.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedLegacy[p.id])}
                      onChange={() => toggleLegacy(p.id)}
                      aria-label={`Select ${p.name || p.id}`}
                    />
                  </td>
                  <td>{p.name || "Untitled"}</td>
                  <td>{p.submitterName || "—"}</td>
                  <td>{`Legacy: ${p.submitterDepartment || "—"}`}</td>
                  <td className="mono">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const ADMIN_CSS = `
.admin-page{max-width:1100px;margin:0 auto;padding:20px 24px 48px;color:#16202B;font-family:'Plus Jakarta Sans',system-ui,sans-serif;}
.admin-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
.admin-head h1{margin:0;font-size:24px;}
.admin-head p{margin:4px 0 0;color:#5C5647;}
.admin-card{background:#FFFDF8;border:1px solid #E6E1D1;border-radius:14px;padding:16px;margin-bottom:16px;}
.admin-card h2{margin:0 0 8px;font-size:16px;}
.admin-sub{margin:0 0 10px;font-size:13px;color:#5C5647;}
.admin-table-wrap{overflow:auto;}
.admin-card table{width:100%;border-collapse:collapse;font-size:13px;}
.admin-card th,.admin-card td{text-align:left;padding:8px 6px;border-bottom:1px solid #F1ECDD;vertical-align:top;}
.admin-card select,.admin-card textarea{
  width:100%;font:inherit;padding:6px 8px;border:1px solid #E6E1D1;border-radius:8px;background:#fff;
}
.admin-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.admin-actions button,.admin-btn{
  display:inline-flex;align-items:center;gap:6px;border:1px solid #E6E1D1;background:#fff;
  border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;
}
.admin-err{color:#A3402F;display:flex;align-items:center;gap:6px;}
.mono{font-family:'IBM Plex Mono',monospace;font-size:12px;}
.spin{animation:admin-spin .8s linear infinite;}
@keyframes admin-spin{to{transform:rotate(360deg)}}
`;
