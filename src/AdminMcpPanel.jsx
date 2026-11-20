import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** "Everyone signed in", "2 people" or "Nobody": what MCP_ALLOWED_EMAILS currently allows. */
export function allowlistText(allowlist) {
  if (!allowlist) return "…";
  if (allowlist.mode === "everyone") return "Everyone signed in";
  if (allowlist.mode === "list") return `${allowlist.count} ${allowlist.count === 1 ? "person" : "people"}`;
  return "Nobody";
}

/**
 * Settings, MCP connector (ADMIN only; the server refuses everyone else): is the connector on, who may sign in,
 * how many connector tokens exist, who holds one with a Revoke button, and the last 50 audit rows.
 * It never shows a token.
 */
export default function AdminMcpPanel({ apiFetch }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setStatus(await apiFetch("/api/admin/mcp/status"));
    } catch (e) {
      setError(e.message || "Could not load the connector status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(person) {
    setBusyId(person.userId);
    setError("");
    setNote("");
    try {
      const out = await apiFetch("/api/admin/mcp/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.userId }),
      });
      setNote(`Revoked ${out.email || person.email || person.userId}. Their connector token now fails on its next call.`);
      await load();
    } catch (e) {
      setError(e.message || "Revoke failed.");
    } finally {
      setBusyId("");
    }
  }

  const people = status?.people || [];
  const records = status?.records || [];

  return (
    <section className="admin-panel" data-testid="mcp-panel">
      <p className="admin-hint">
        The read-only Claude connector. Turn it on or off with MCP_ENABLED in Render, and choose who may sign in with
        MCP_ALLOWED_EMAILS. Revoke cuts a person off at their next call.
      </p>
      <div className="admin-actions">
        <button type="button" className="ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : null} Refresh
        </button>
      </div>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      {note ? <p className="admin-hint" role="status" data-testid="mcp-revoke-note">{note}</p> : null}

      {status ? (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <tbody>
                <tr>
                  <th>Connector</th>
                  <td data-testid="mcp-enabled">{status.enabled ? "On" : "Off"}</td>
                </tr>
                <tr>
                  <th>Who may sign in</th>
                  <td data-testid="mcp-allowlist">{allowlistText(status.allowlist)}</td>
                </tr>
                <tr>
                  <th>Tokens issued</th>
                  <td data-testid="mcp-tokens-issued">{status.tokens?.issued ?? 0}</td>
                </tr>
                <tr>
                  <th>Tokens still valid</th>
                  <td data-testid="mcp-tokens-valid">{status.tokens?.valid ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="admin-sub">People holding a token</h2>
          {people.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table" data-testid="mcp-people">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Valid tokens</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.userId}>
                      <td>{p.email || p.userId}{p.name ? ` (${p.name})` : ""}</td>
                      <td>{p.validTokens}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          data-testid="mcp-revoke"
                          disabled={busyId === p.userId}
                          onClick={() => revoke(p)}
                        >
                          {busyId === p.userId ? <Loader2 size={14} className="spin" /> : null} Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-muted">Nobody holds a valid token.</p>
          )}

          <h2 className="admin-sub">Last 50 audit rows (kept {status.retentionDays} days)</h2>
          <div className="admin-table-wrap">
            <table className="admin-table" data-testid="mcp-audit">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Idea</th>
                  <th>Results</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={`${r.created_at}-${i}`}>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                    <td>{r.email || r.user_id || "—"}</td>
                    <td>{r.tool_name}</td>
                    <td>{r.idea_id || "—"}</td>
                    <td>{r.result_count}</td>
                    <td>{r.ok ? "Done" : "Refused or failed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.length ? null : <p className="admin-muted">Nothing recorded yet.</p>}
        </>
      ) : null}
    </section>
  );
}
