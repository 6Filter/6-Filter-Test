import { useRef, useState } from "react";
import { AlertTriangle, Download, FileUp, Layers, Loader2 } from "lucide-react";
import { MEASURED_FRESH_IDEA } from "../lib/researchProgress.js";

/**
 * Part 140 E — "Upload your idea (Excel, Word or PDF)" for the new-idea page.
 * The file is read on the server (POST /api/propositions/import); every idea becomes a draft owned by
 * the uploader. Nothing is scored until Submit. `result` / `setResult` live in App so the review list
 * survives "Open draft".
 */

export const IMPORT_TEMPLATE_URL = "/api/propositions/import-template";
export const IMPORT_URL = "/api/propositions/import";
const MAX_BYTES = 5 * 1024 * 1024;

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const at = text.indexOf("base64,");
      resolve(at >= 0 ? text.slice(at + 7) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/** Part 141 D — cell provenance per idea: [{ path, cell }] from fieldSources ("upload" → the cell it was read from). */
export function provenanceRows(fieldSources) {
  if (!fieldSources || typeof fieldSources !== "object") return [];
  return Object.entries(fieldSources).map(([path, src]) => ({
    path,
    cell: String(src?.cell || "").trim() || "file",
    aiSuggested: Boolean(src?.aiSuggested),
  }));
}

/** The words for the Submit-all price confirm (list price per idea from the measured fresh idea). */
export function submitAllConfirmText(count) {
  const each = MEASURED_FRESH_IDEA.listPriceUsd;
  return (
    `Submit ${count} ${plural(count, "idea", "ideas")}? Each one runs the full research, one after another. ` +
    `Estimated list price about $${(each * count).toFixed(2)} (about $${each.toFixed(2)} each).\n\nContinue?`
  );
}

/** Part 151 — the bulk summary: name, verdict and score for every idea that was tested. */
export function bulkSummaryRows(created = []) {
  return created
    .filter((idea) => idea.submitState === "submitted" || idea.submitState === "failed")
    .map((idea) => ({
      id: idea.id,
      name: idea.name || "Untitled idea",
      verdict: idea.verdict || (idea.submitState === "failed" ? "Not tested" : "—"),
      score: Number.isFinite(Number(idea.pct)) && idea.pct !== null && idea.pct !== "" ? `${Math.round(Number(idea.pct))}%` : "—",
      state: idea.submitState,
    }));
}

export default function IdeaImportPanel({ result, setResult, llmProvider = "claude", onOpenDraft, onSubmitIdea, onOpenLog }) {
  const fileRef = useRef(null);
  const modeRef = useRef("single");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittingAll, setSubmittingAll] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_BYTES) {
      setError("That file is over 5 MB. Remove pictures or split it into smaller files.");
      return;
    }
    setBusy(true);
    try {
      const data = await readAsBase64(file);
      const res = await fetch(IMPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachment: { name: file.name, data, mediaType: file.type || "" },
          provider: llmProvider,
          mode: modeRef.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not read that file.");
        return;
      }
      const createdIdeas = (body.created || []).map((idea) => ({ ...idea, submitState: "", submitMessage: "" }));
      setResult({
        fileName: file.name,
        mode: modeRef.current,
        created: createdIdeas,
        rejected: body.rejected || [],
        ignoredColumns: body.ignoredColumns || [],
        usedAi: Boolean(body.usedAi),
      });
      // One idea: show it straight away in the form with every value already entered.
      if (modeRef.current === "single" && createdIdeas.length === 1 && typeof onOpenDraft === "function") {
        onOpenDraft(createdIdeas[0].id, { form: true });
      }
    } catch (err) {
      setError(err.message || "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function patchIdea(id, patch) {
    setResult((prev) =>
      prev ? { ...prev, created: prev.created.map((idea) => (idea.id === id ? { ...idea, ...patch } : idea)) } : prev
    );
  }

  async function submitOne(idea) {
    if (typeof onSubmitIdea !== "function") return;
    patchIdea(idea.id, { submitState: "submitting", submitMessage: "" });
    const out = await onSubmitIdea(idea.id);
    if (out?.ok) {
      patchIdea(idea.id, {
        submitState: "submitted",
        submitMessage: out.message || "Submitted.",
        verdict: out.verdict || "",
        pct: out.pct ?? null,
      });
    } else {
      patchIdea(idea.id, { submitState: "failed", submitMessage: out?.error || "Could not submit this idea." });
    }
  }

  const created = result?.created || [];
  const rejected = result?.rejected || [];
  const summaryRows = bulkSummaryRows(created);
  const ready = created.filter((i) => !i.missingRequired?.length && i.submitState !== "submitted" && i.submitState !== "submitting");

  async function submitAll() {
    if (!ready.length || submittingAll) return;
    if (!window.confirm(submitAllConfirmText(ready.length))) return;
    setSubmittingAll(true);
    setProgress({ done: 0, total: ready.length });
    try {
      let done = 0;
      for (const idea of ready) {
        // eslint-disable-next-line no-await-in-loop
        await submitOne(idea);
        done += 1;
        setProgress({ done, total: ready.length });
      }
    } finally {
      setSubmittingAll(false);
    }
  }

  return (
    <div className="import-panel" data-testid="import-panel">
      <div className="import-actions-row">
        <input
          ref={fileRef}
          type="file"
          hidden
          data-testid="import-file"
          accept=".xlsx,.xlsm,.csv,.doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={handleFile}
        />
        <button
          type="button"
          className="import-upload-btn"
          data-testid="import-upload"
          disabled={busy || submittingAll}
          title="One idea: the form opens with every value from the file already entered."
          onClick={() => {
            modeRef.current = "single";
            fileRef.current?.click();
          }}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <FileUp size={16} />}
          Upload your idea (Excel, Word or PDF)
        </button>
        <button
          type="button"
          className="import-bulk-btn"
          data-testid="import-upload-bulk"
          disabled={busy || submittingAll}
          title="Many ideas: one idea per row in the Excel template."
          onClick={() => {
            modeRef.current = "bulk";
            fileRef.current?.click();
          }}
        >
          <Layers size={16} />
          Bulk upload (many ideas)
        </button>
        <a className="import-template-link" data-testid="import-template-link" href={IMPORT_TEMPLATE_URL} download>
          <Download size={14} /> Download the Excel template
        </a>
      </div>
      <p className="import-bulk-cap" data-testid="import-bulk-cap">
        Cap: 200 ideas and 5 MB per file
      </p>
      {error ? (
        <div className="prop-err" role="alert" data-testid="import-error">
          <AlertTriangle size={14} /> {error}
        </div>
      ) : null}

      {result ? (
        <section className="import-review" data-testid="import-review" aria-live="polite">
          <h2 className="import-review-title">
            <span data-testid="import-count-created">{created.length}</span> {plural(created.length, "idea", "ideas")} imported as drafts
            {rejected.length ? (
              <>
                {", "}
                <span data-testid="import-count-rejected">{rejected.length}</span> not imported
              </>
            ) : null}
          </h2>
          <p className="prop-helper import-file-name">From {result.fileName}</p>
          {result.usedAi ? (
            <p className="prop-helper" data-testid="import-ai-note">
              Read by AI from a free-form document. Only values the document states were kept — check each one.
            </p>
          ) : null}
          {result.ignoredColumns?.length ? (
            <p className="prop-helper" data-testid="import-ignored">
              Columns not used: {result.ignoredColumns.join(", ")}
            </p>
          ) : null}

          <ul className="import-list">
            {created.map((idea) => {
              const missing = idea.missingRequired || [];
              const busyIdea = idea.submitState === "submitting";
              return (
                <li className="import-idea" key={idea.id} data-testid="import-idea" data-idea-id={idea.id}>
                  <div className="import-idea-head">
                    <strong className="import-idea-name">{idea.name || "Untitled idea"}</strong>
                    <span className="import-idea-filled">
                      {(idea.filled || []).length} {plural((idea.filled || []).length, "box", "boxes")} filled
                    </span>
                  </div>
                  {missing.length ? (
                    <p className="import-idea-missing" data-testid="import-missing">
                      Still needed before Submit: {missing.join(", ")}
                    </p>
                  ) : (
                    <p className="import-idea-ready">Ready to submit.</p>
                  )}
                  {(idea.warnings || []).length ? (
                    <ul className="import-idea-warnings" data-testid="import-warnings">
                      {idea.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {provenanceRows(idea.fieldSources).length ? (
                    <details className="import-idea-provenance" data-testid="import-provenance">
                      <summary>Where each value came from</summary>
                      <ul>
                        {provenanceRows(idea.fieldSources).map((row) => (
                          <li key={row.path} data-testid="import-provenance-row">
                            <code>{row.path}</code> → {row.cell}
                            {row.aiSuggested ? " (AI-read, check it)" : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {idea.submitMessage ? (
                    <p className={`import-idea-status ${idea.submitState}`} role="status">
                      {idea.submitMessage}
                    </p>
                  ) : null}
                  <div className="import-idea-actions">
                    <button type="button" className="ghost" data-testid="import-open" onClick={() => onOpenDraft?.(idea.id)}>
                      Open draft
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      data-testid="import-submit"
                      disabled={missing.length > 0 || busyIdea || submittingAll || idea.submitState === "submitted"}
                      title={missing.length ? "Open the draft and fill the boxes listed first." : ""}
                      onClick={() => submitOne(idea)}
                    >
                      {busyIdea ? <Loader2 size={14} className="spin" /> : null}
                      {idea.submitState === "submitted" ? "Submitted" : "Submit"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {rejected.length ? (
            <ul className="import-rejected" data-testid="import-rejected">
              {rejected.map((r, i) => (
                <li key={`${r.row}-${i}`}>
                  <AlertTriangle size={13} /> Row {r.row}: {r.reason}
                </li>
              ))}
            </ul>
          ) : null}

          {created.length > 1 ? (
            <div className="import-submit-all">
              <button
                type="button"
                className="ghost"
                data-testid="import-submit-all"
                disabled={!ready.length || submittingAll}
                onClick={submitAll}
              >
                {submittingAll ? <Loader2 size={14} className="spin" /> : null}
                Submit all ({ready.length})
              </button>
              <span className="prop-helper" data-testid="import-progress">
                {submittingAll
                  ? `Testing idea ${Math.min(progress.done + 1, progress.total)} of ${progress.total} …`
                  : "Ideas with required boxes still empty are skipped."}
              </span>
            </div>
          ) : null}

          {summaryRows.length ? (
            <div className="import-summary" data-testid="import-summary">
              <h3 className="import-summary-title">Verdicts for this upload</h3>
              <table className="import-summary-table">
                <thead>
                  <tr>
                    <th scope="col">Idea</th>
                    <th scope="col">Verdict</th>
                    <th scope="col">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.id} data-testid="import-summary-row" data-state={r.state}>
                      <td>{r.name}</td>
                      <td>{r.verdict}</td>
                      <td>{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {typeof onOpenLog === "function" ? (
                <button type="button" className="ghost" data-testid="import-open-log" onClick={() => onOpenLog()}>
                  See them in the Log
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Works on a narrow screen: the actions stack, buttons fill the width, nothing scrolls sideways. */
export const IDEA_IMPORT_CSS = `
.import-panel{display:flex;flex-direction:column;gap:8px;min-width:0;}
.import-actions-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;}
.import-upload-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:12px;border:1px solid var(--accent,#7c5cff);background:var(--accent,#7c5cff);color:#fff;font-weight:600;font-size:calc(15px * var(--ts, 1));cursor:pointer;min-height:44px;max-width:100%;}
.import-upload-btn:disabled{opacity:.6;cursor:default;}
.import-bulk-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:12px;border:1px solid var(--accent,#7c5cff);background:transparent;color:var(--accent,#7c5cff);font-weight:600;font-size:calc(15px * var(--ts, 1));cursor:pointer;min-height:44px;max-width:100%;}
.import-bulk-btn:disabled{opacity:.6;cursor:default;}
.import-summary{display:flex;flex-direction:column;gap:6px;min-width:0;}
.import-summary-title{margin:0;font-size:calc(15px * var(--ts, 1));}
.import-summary-table{width:100%;border-collapse:collapse;font-size:calc(13.5px * var(--ts, 1));}
.import-summary-table th,.import-summary-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--card-border,var(--c-border));overflow-wrap:anywhere;}
.import-template-link{display:inline-flex;align-items:center;gap:6px;font-size:calc(14px * var(--ts, 1));color:var(--ink-secondary,#a9a3b8);text-decoration:underline;min-height:44px;}
.import-bulk-cap{margin:0;font-size:calc(11.5px * var(--ts, 1));font-weight:400;line-height:1.35;color:var(--ink-secondary,#a9a3b8);}
.import-help{margin:0;}
.import-review{border:1px solid var(--card-border,var(--c-border));border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0;overflow-wrap:anywhere;}
.import-review-title{margin:0;font-size:calc(17px * var(--ts, 1));}
.import-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}
.import-idea{border:1px solid var(--card-border,var(--c-border));border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0;}
.import-idea-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;}
.import-idea-name{min-width:0;overflow-wrap:anywhere;}
.import-idea-filled{font-size:calc(13px * var(--ts, 1));color:var(--ink-secondary,#a9a3b8);}
.import-idea-missing,.import-idea-ready,.import-idea-status{margin:0;font-size:calc(13.5px * var(--ts, 1));}
.import-idea-missing,.import-idea-status.failed{color:var(--c-watch);}
.import-idea-status.submitted{color:var(--c-go);}
.import-idea-warnings,.import-rejected{margin:0;padding-left:18px;font-size:calc(13px * var(--ts, 1));color:var(--ink-secondary,#a9a3b8);}
.import-rejected{list-style:none;padding-left:0;}
.import-idea-provenance{font-size:calc(13px * var(--ts, 1));color:var(--ink-secondary,#a9a3b8);}
.import-idea-provenance summary{cursor:pointer;min-height:24px;}
.import-idea-provenance ul{margin:4px 0 0;padding-left:18px;}
.import-idea-actions,.import-submit-all{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
@media (max-width:640px){
  .import-actions-row{flex-direction:column;align-items:stretch;}
  .import-upload-btn{width:100%;}
  .import-idea-actions button,.import-submit-all button{flex:1 1 140px;min-height:44px;}
  .import-review{padding:10px;}
}
`;
