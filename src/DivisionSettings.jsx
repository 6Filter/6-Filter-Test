import { useEffect, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";

function blankDraft() {
  return {
    division_name: "",
    min_net_margin_pct: "",
    revenue_target_all_channels_cr: "",
    revenue_target_ecom_mt_cr: "",
    note: "",
  };
}

function toInput(value) {
  return value == null || value === "" ? "" : String(value);
}

function fromInput(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function DivisionSettings({ apiFetch }) {
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(blankDraft);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/division-thresholds");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load division thresholds.");
      const list = Array.isArray(data.thresholds) ? data.thresholds : [];
      setRows(list);
      const next = {};
      for (const row of list) {
        next[row.id] = {
          division_name: row.division_name || "",
          min_net_margin_pct: toInput(row.min_net_margin_pct),
          revenue_target_all_channels_cr: toInput(row.revenue_target_all_channels_cr),
          revenue_target_ecom_mt_cr: toInput(row.revenue_target_ecom_mt_cr),
          note: row.note || "",
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e.message || "Could not load division thresholds.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function patchDraft(id, key, value) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function saveRow(id) {
    const draft = drafts[id];
    if (!draft || savingId) return;
    setSavingId(id);
    setError("");
    setFlash("");
    try {
      const res = await apiFetch(`/api/division-thresholds/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_name: draft.division_name,
          min_net_margin_pct: fromInput(draft.min_net_margin_pct),
          revenue_target_all_channels_cr: fromInput(draft.revenue_target_all_channels_cr),
          revenue_target_ecom_mt_cr: fromInput(draft.revenue_target_ecom_mt_cr),
          note: draft.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setFlash(`Saved ${data.threshold?.division_name || "division"}.`);
      await load();
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSavingId("");
    }
  }

  async function addDivision() {
    if (adding) return;
    if (!String(newRow.division_name || "").trim()) {
      setError("Division name is required.");
      return;
    }
    setAdding(true);
    setError("");
    setFlash("");
    try {
      const res = await apiFetch("/api/division-thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_name: newRow.division_name,
          min_net_margin_pct: fromInput(newRow.min_net_margin_pct),
          revenue_target_all_channels_cr: fromInput(newRow.revenue_target_all_channels_cr),
          revenue_target_ecom_mt_cr: fromInput(newRow.revenue_target_ecom_mt_cr),
          note: newRow.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add division.");
      setNewRow(blankDraft());
      setFlash(`Added ${data.threshold?.division_name || "division"}.`);
      await load();
    } catch (e) {
      setError(e.message || "Could not add division.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="div-settings">
      <style>{CSS}</style>
      <section className="panel div-panel">
        <div className="panel-tab">Settings · Division thresholds</div>
        <p className="div-lede">
          Margin floors and year-3 revenue targets used by F2 and F5. Edits apply within about a
          minute (cache TTL) — no redeploy. Anyone who can reach the app can edit these until auth
          ships.
        </p>
        {error ? <div className="div-err">{error}</div> : null}
        {flash ? <div className="div-ok">{flash}</div> : null}
        {loading ? (
          <p className="div-loading">
            <Loader2 size={16} className="spin" /> Loading…
          </p>
        ) : (
          <div className="div-table-wrap">
            <table className="div-table">
              <thead>
                <tr>
                  <th>Division</th>
                  <th>Margin floor %</th>
                  <th>Revenue ₹ Cr</th>
                  <th>Ecom/MT ₹ Cr</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = drafts[row.id] || blankDraft();
                  return (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={d.division_name}
                          onChange={(e) => patchDraft(row.id, "division_name", e.target.value)}
                          aria-label={`${row.division_name} name`}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={d.min_net_margin_pct}
                          onChange={(e) => patchDraft(row.id, "min_net_margin_pct", e.target.value)}
                          placeholder="—"
                          aria-label={`${row.division_name} margin floor`}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={d.revenue_target_all_channels_cr}
                          onChange={(e) =>
                            patchDraft(row.id, "revenue_target_all_channels_cr", e.target.value)
                          }
                          placeholder="—"
                          aria-label={`${row.division_name} revenue target`}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={d.revenue_target_ecom_mt_cr}
                          onChange={(e) =>
                            patchDraft(row.id, "revenue_target_ecom_mt_cr", e.target.value)
                          }
                          placeholder="—"
                          aria-label={`${row.division_name} ecom target`}
                        />
                      </td>
                      <td>
                        <input
                          value={d.note}
                          onChange={(e) => patchDraft(row.id, "note", e.target.value)}
                          aria-label={`${row.division_name} note`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="div-save"
                          disabled={Boolean(savingId)}
                          onClick={() => saveRow(row.id)}
                        >
                          {savingId === row.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="div-new">
                  <td>
                    <input
                      value={newRow.division_name}
                      onChange={(e) => setNewRow((p) => ({ ...p, division_name: e.target.value }))}
                      placeholder="New division name"
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={newRow.min_net_margin_pct}
                      onChange={(e) =>
                        setNewRow((p) => ({ ...p, min_net_margin_pct: e.target.value }))
                      }
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={newRow.revenue_target_all_channels_cr}
                      onChange={(e) =>
                        setNewRow((p) => ({
                          ...p,
                          revenue_target_all_channels_cr: e.target.value,
                        }))
                      }
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={newRow.revenue_target_ecom_mt_cr}
                      onChange={(e) =>
                        setNewRow((p) => ({ ...p, revenue_target_ecom_mt_cr: e.target.value }))
                      }
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <input
                      value={newRow.note}
                      onChange={(e) => setNewRow((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Optional note"
                    />
                  </td>
                  <td>
                    <button type="button" className="div-save" disabled={adding} onClick={addDivision}>
                      {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                      Add
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const CSS = `
.div-settings{max-width:1180px;margin:0 auto;padding:0 28px 72px;}
.div-panel{padding:18px 20px 22px;}
.div-lede{margin:0 0 14px;font-size:13.5px;line-height:1.45;color:var(--muted-2, rgba(243,234,248,.62));}
.div-err{margin:0 0 12px;color:#E2716B;font-size:13px;}
.div-ok{margin:0 0 12px;color:#7EDCA8;font-size:13px;}
.div-loading{display:flex;align-items:center;gap:8px;color:var(--muted);}
.div-table-wrap{overflow-x:auto;}
.div-table{width:100%;border-collapse:collapse;font-size:13px;}
.div-table th{text-align:left;font-family:var(--fm);font-size:11px;letter-spacing:.04em;
  color:rgba(243,234,248,.55);padding:8px 8px 10px;border-bottom:1px solid rgba(243,234,248,.12);}
.div-table td{padding:8px;border-bottom:1px solid rgba(243,234,248,.08);vertical-align:middle;}
.div-table input{width:100%;min-width:72px;background:var(--bg-soft,#22113A);border:1px solid var(--line,rgba(243,234,248,.14));
  border-radius:10px;color:var(--ink,#F3EAF8);font-family:var(--fd);font-size:13px;padding:8px 10px;}
.div-save{display:inline-flex;align-items:center;gap:6px;background:#C9AEEF;color:#170C25;border:none;
  border-radius:999px;padding:8px 12px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:var(--fd);
  white-space:nowrap;}
.div-save:disabled{opacity:.55;cursor:not-allowed;}
.div-new td{padding-top:14px;}
`;
