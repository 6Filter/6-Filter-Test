import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, FileUp, Loader2, Sparkles, X } from "lucide-react";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import {
  OWNER_COLORS,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  mergeProposition,
} from "../lib/propositionFields.js";
import { canWriteField, ownerLabel } from "../lib/fieldOwnership.js";

function OwnerTag({ role }) {
  const c = OWNER_COLORS[role] || { bg: "#333", fg: "#ccc" };
  return (
    <span className="owner-tag" style={{ background: c.bg, color: c.fg }}>
      {role}
    </span>
  );
}

function filterSubtitle(spec, division) {
  if (spec.key === "f2") {
    return division
      ? `path to the ${division} division floor (v4)`
      : "division not yet determined — no floor until matched (v4)";
  }
  if (spec.key === "f5") {
    return division
      ? `credible year-3 path for ${division} (v4)`
      : "division not yet determined — no revenue target until matched (v4)";
  }
  return spec.subtitle || "";
}

function fieldHelper(field) {
  if (typeof field.helperFromDivision === "function") {
    return "Division floor: matched automatically on first Submit (v4, non-negotiable)";
  }
  return field.helper || "";
}

const SUGGEST_BLOCKLIST = new Set([
  "finalVerdict",
  "finalVerdictNote",
  "forumVerdict",
  "verdictNote",
  "name",
]);

function isEmptyField(value) {
  if (value == null) return true;
  if (typeof value === "boolean") return value === false;
  return String(value).trim() === "";
}

function formatSuggestion(field, value) {
  if (field?.type === "select" && Array.isArray(field.options)) {
    const opt = field.options.find((o) => String(o.v) === String(value));
    if (opt) return opt.l;
  }
  const s = String(value ?? "");
  return s.length > 180 ? `${s.slice(0, 177)}…` : s;
}

function lookupSuggestion(suggestions, dismissed, filterKey, fieldKey, currentValue) {
  if (SUGGEST_BLOCKLIST.has(fieldKey)) return null;
  if (!isEmptyField(currentValue)) return null;
  const path = filterKey ? `${filterKey}.${fieldKey}` : fieldKey;
  if (dismissed[path]) return null;
  const raw = filterKey
    ? suggestions?.[filterKey]?.[fieldKey]
    : suggestions?.top?.[fieldKey] ?? suggestions?.[fieldKey];
  if (raw == null || (typeof raw === "string" && !raw.trim())) return null;
  return raw;
}

function SuggestionChip({ field, suggestion, onAccept, onDismiss }) {
  return (
    <div className="ai-suggestion-chip">
      <Sparkles size={12} />
      <span>
        AI suggests: <strong>{formatSuggestion(field, suggestion)}</strong>
      </span>
      <button type="button" onClick={onAccept}>Accept</button>
      <button type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function isImageUpload(name, mime) {
  return (
    String(mime || "").startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|heic|heif|tif|tiff|avif|svg)$/i.test(String(name || ""))
  );
}

async function rasterizeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height, 1));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (typeof bitmap.close === "function") bitmap.close();
  const dataUrl = canvas.toDataURL("image/png");
  const data = sanitizeImageBase64(dataUrl);
  if (!data) throw new Error("empty png");
  return {
    name: String(file.name || "upload").replace(/\.[^.]+$/, "") + ".png",
    mediaType: "image/png",
    data,
    preview: dataUrl,
  };
}

function readFileAsAttachment(file, isImage) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = sanitizeImageBase64(result.includes("base64,") ? result : result.split(",")[1] || "");
      resolve({
        name: file.name,
        mediaType: isImage
          ? sniffImageMediaType(data, file.name, file.type)
          : file.type ||
            (String(file.name).toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : String(file.name).toLowerCase().endsWith(".docx")
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : String(file.name).toLowerCase().endsWith(".doc")
                  ? "application/msword"
                  : "application/octet-stream"),
        data,
        preview: isImage ? result : null,
      });
    };
    reader.readAsDataURL(file);
  });
}

function FieldControl({ field, value, onChange, suggestion, onAcceptSuggestion, onDismissSuggestion, currentUser }) {
  const helper = fieldHelper(field);
  const owners = Array.isArray(field.owners) ? field.owners : [];
  const full = field.type === "textarea" || field.type === "checkbox" || field.type === "computed";
  const locked = Boolean(currentUser && !canWriteField(currentUser.role, field.key));
  const lockTitle = locked ? `Owned by ${ownerLabel(field.key) || owners.join(" / ") || "another role"}` : undefined;
  const chip =
    !locked && suggestion != null ? (
      <SuggestionChip
        field={field}
        suggestion={suggestion}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
      />
    ) : null;

  if (field.type === "computed") {
    return (
      <div className={`prop-field span-2`}>
        <div className="prop-label">
          {field.label}
          {owners.map((role) => (
            <OwnerTag key={role} role={role} />
          ))}
        </div>
        {helper ? <p className="prop-helper">{helper}</p> : null}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className={`prop-check span-2${locked ? " is-locked" : ""}`} title={lockTitle}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={locked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {field.label}
          {owners.map((role) => (
            <OwnerTag key={role} role={role} />
          ))}
        </span>
      </label>
    );
  }

  const input =
    field.type === "select" ? (
      <select value={value ?? ""} disabled={locked} title={lockTitle} onChange={(e) => onChange(e.target.value)}>
        {(field.options || []).map((opt) => (
          <option key={`${opt.v}::${opt.l}`} value={opt.v}>
            {opt.l}
          </option>
        ))}
      </select>
    ) : field.type === "textarea" ? (
      <textarea
        rows={3}
        value={value ?? ""}
        placeholder={field.placeholder || ""}
        disabled={locked}
        title={lockTitle}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input
        type={field.type === "number" ? "number" : "text"}
        step={field.type === "number" ? "any" : undefined}
        value={value ?? ""}
        placeholder={field.placeholder || ""}
        disabled={locked}
        title={lockTitle}
        onChange={(e) => onChange(e.target.value)}
      />
    );

  return (
    <div className={`prop-field${full ? " span-2" : ""}${locked ? " is-locked" : ""}`} title={lockTitle}>
      <label className="prop-field-inner">
        <span className="prop-label">
          {field.label}
          {owners.map((role) => (
            <OwnerTag key={role} role={role} />
          ))}
        </span>
        {input}
      </label>
      {helper ? <span className="prop-helper">{helper}</span> : null}
      {chip}
    </div>
  );
}

function AiPassResultBanner({ meta }) {
  if (!meta) return null;
  const sources = Array.isArray(meta.sources) ? meta.sources.filter((s) => s?.title || s?.url) : [];
  const notCovered = Array.isArray(meta.notCovered) ? meta.notCovered : [];
  return (
    <div className="ai-pass-banner">
      <p className="ai-pass-kicker">Research assist · not a Forum verdict</p>
      {notCovered.length ? (
        <ul className="ai-not-covered">
          {notCovered.map((item) => (
            <li key={item.filter}>
              <strong>{item.filter}</strong> — {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {sources.length ? (
        <details className="ai-pass-sources">
          <summary>Sources cited ({sources.length})</summary>
          <ul>
            {sources.map((s, i) => (
              <li key={`${s.url || s.title || "s"}-${i}`}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title || s.url}
                  </a>
                ) : (
                  s.title
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function toneFor(label) {
  if (label === "Cleared") return "pass";
  if (label === "Below floor") return "fail";
  return "watch";
}

function AnalysisSummary({ advisoryChecks, visible, stale }) {
  if (!visible || !advisoryChecks) return null;
  return (
    <section className={`analysis-summary${stale ? " is-stale" : ""}`} aria-live="polite">
      <h2 className="summary-heading">Analysis</h2>
      <p className="summary-lede">
        {stale
          ? "Based on the previous submit — resubmit to refresh."
          : "Based on everything currently entered."}
      </p>
      <div className="summary-grid">
        {SIX_FILTERS_FORM.map((f) => {
          const check = advisoryChecks[f.key] || { checkLabel: "Evidence missing" };
          return (
            <div className="summary-row" key={f.key}>
              <span className="summary-num">{f.num}</span>
              <span className="summary-title">{f.title}</span>
              <span className="check-pill" data-tone={toneFor(check.checkLabel)}>
                {check.checkLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatSavedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PropositionForm({
  initial,
  onSave,
  saving,
  savedFlash,
  error,
  currentUser,
}) {
  const [doc, setDoc] = useState(() => mergeProposition(initial));
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiDismissed, setAiDismissed] = useState({});
  const [aiPassMeta, setAiPassMeta] = useState(null);
  const [fileError, setFileError] = useState("");
  const [localError, setLocalError] = useState("");
  const [advisoryChecks, setAdvisoryChecks] = useState(() => initial?.advisoryChecks || null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [summaryStale, setSummaryStale] = useState(false);
  const [summaryChecks, setSummaryChecks] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setDoc(mergeProposition(initial));
    if (initial?.advisoryChecks) setAdvisoryChecks(initial.advisoryChecks);
  }, [initial?.id, initial?.version]);

  useEffect(() => {
    setAiSuggestions(null);
    setAiDismissed({});
    setAiPassMeta(null);
    setFileError("");
    setLocalError("");
    setJustSubmitted(false);
    setSummaryStale(false);
    setSummaryChecks(null);
  }, [initial?.id]);

  const propositionId = doc.id || initial?.id;
  const attachmentLocked = Boolean(currentUser && !canWriteField(currentUser.role, "attachment"));
  const hasIdeaMaterial = Boolean(String(doc.ideaDescription || "").trim() || doc.attachment?.data);
  const canSubmit = Boolean(doc.researchRunAt) || hasIdeaMaterial;

  useEffect(() => {
    if (!propositionId) return undefined;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/check`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            division: doc.division,
            f1: doc.f1,
            f2: doc.f2,
            f3: doc.f3,
            f4: doc.f4,
            f5: doc.f5,
            f6: doc.f6,
          }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.advisoryChecks) setAdvisoryChecks(data.advisoryChecks);
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [propositionId, doc]);

  function noteEdit() {
    if (justSubmitted) setSummaryStale(true);
  }

  function setTop(key, value) {
    noteEdit();
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function setFilter(filterKey, fieldKey, value) {
    noteEdit();
    setDoc((prev) => ({
      ...prev,
      [filterKey]: { ...prev[filterKey], [fieldKey]: value },
    }));
  }

  function applyResearchResult(data) {
    if (!data?.suggestions) return;
    const next = { ...(data.suggestions || {}) };
    setAiSuggestions(next);
    setAiDismissed({});
    setAiPassMeta({
      notCovered: data.notCovered || [],
      sources: data.sources || [],
    });
  }

  function acceptSuggestion(filterKey, fieldKey, suggestion) {
    if (filterKey) setFilter(filterKey, fieldKey, suggestion);
    else setTop(fieldKey, suggestion);
  }

  function dismissSuggestion(filterKey, fieldKey) {
    const path = filterKey ? `${filterKey}.${fieldKey}` : fieldKey;
    setAiDismissed((prev) => ({ ...prev, [path]: true }));
  }

  function suggestionProps(filterKey, field, currentValue) {
    const suggestion = lookupSuggestion(aiSuggestions, aiDismissed, filterKey, field.key, currentValue);
    return {
      suggestion,
      onAcceptSuggestion: suggestion == null ? undefined : () => acceptSuggestion(filterKey, field.key, suggestion),
      onDismissSuggestion: () => dismissSuggestion(filterKey, field.key),
    };
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || attachmentLocked) return;
    const name = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    const ok =
      isImageUpload(name, mime) ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      /\.(pdf|docx?)$/i.test(name);
    if (!ok) {
      setFileError("Upload a PDF, Word file (.doc / .docx), or image (JPG, PNG, GIF, WebP, BMP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFileError("Keep the file under 8 MB.");
      return;
    }
    setFileError("");
    const isImage = isImageUpload(name, mime);
    try {
      let attachment;
      if (isImage) {
        try {
          attachment = await rasterizeImageFile(file);
        } catch {
          attachment = await readFileAsAttachment(file, true);
        }
      } else {
        attachment = await readFileAsAttachment(file, false);
      }
      setTop("attachment", attachment);
    } catch {
      setFileError("Could not read that file. Try a JPG or PNG.");
    }
  }

  async function handleSubmit() {
    if (saving) return;
    if (!canSubmit) {
      setLocalError("Describe the idea, or attach a file, before the first Submit.");
      return;
    }
    setLocalError("");
    const result = await onSave(doc);
    if (!result?.proposition) return;
    if (result.suggestions) applyResearchResult(result);
    if (result.researchError) {
      setLocalError(result.researchError);
    }
    const nextDoc = mergeProposition(result.proposition);
    setDoc(nextDoc);
    const checks = result.proposition.advisoryChecks || null;
    if (checks) setAdvisoryChecks(checks);
    setSummaryChecks(checks);
    setJustSubmitted(true);
    setSummaryStale(false);
  }

  return (
    <main className="prop-page">
      <style>{PROP_CSS}</style>

      <section className="prop-top">
        <p className="prop-version">
          {Number(doc.version) > 1
            ? `v${doc.version} · last saved ${formatSavedAt(doc.updatedAt)}`
            : "v1 · not yet saved for the team"}
        </p>
        <div className="prop-grid">
          {PROPOSITION_TOP_FIELDS.map((field) => (
            <div key={field.key} className={field.key === "ideaDescription" ? "span-2 prop-idea-block" : undefined}>
              <FieldControl
                field={field}
                value={doc[field.key]}
                onChange={(v) => setTop(field.key, v)}
                currentUser={currentUser}
                {...suggestionProps("", field, doc[field.key])}
              />
              {field.key === "ideaDescription" ? (
                <div className="prop-attach">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={handleFile}
                    hidden
                  />
                  {!doc.attachment ? (
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving || attachmentLocked}
                      onClick={() => fileRef.current?.click()}
                    >
                      <FileUp size={15} /> Upload PDF, Word, or image
                    </button>
                  ) : (
                    <span className="chip file prop-file-chip">
                      {doc.attachment.preview ? (
                        <img src={doc.attachment.preview} alt="" />
                      ) : (
                        <FileText size={15} />
                      )}
                      {doc.attachment.name || "Attachment"}
                      {!attachmentLocked ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setTop("attachment", null)}
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                    </span>
                  )}
                  {fileError ? (
                    <div className="prop-err">
                      <AlertTriangle size={14} /> {fileError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <AiPassResultBanner meta={aiPassMeta} />
      </section>

      {SIX_FILTERS_FORM.map((spec) => {
        const values = doc[spec.key] || {};
        const check = advisoryChecks?.[spec.key] || { checkLabel: "Evidence missing", items: [] };
        const f5Sizing = spec.key === "f5"
          ? (check.items || []).find((it) => /Year-3 revenue|Sizing incomplete/i.test(it.text))
          : null;
        return (
          <section
            key={spec.key}
            className="prop-filter"
            style={{ borderLeftColor: spec.accentBg }}
          >
            <div className="prop-filter-h">
              <span className="prop-badge" style={{ background: spec.accentBg, color: spec.accentFg }}>
                {spec.num}
              </span>
              <div>
                <h2 className="prop-filter-title" style={{ color: spec.accentFg }}>
                  {spec.title}
                </h2>
                <p className="prop-filter-sub">{filterSubtitle(spec, doc.division)}</p>
              </div>
              <div className="prop-status-wrap">
                <span className="check-pill" data-tone={toneFor(check.checkLabel)}>Check: {check.checkLabel}</span>
              </div>
            </div>

            <div className="prop-grid">
              {spec.fields.map((field) =>
                field.type === "computed" ? (
                  <div key={field.key} className="prop-field span-2">
                    <div className="prop-label">{field.label}</div>
                    <div className={`prop-computed${f5Sizing?.status === "pending" ? " is-empty" : ""}`}>
                      {f5Sizing?.text || "Sizing incomplete — fill the five factors."}
                    </div>
                  </div>
                ) : (
                  <FieldControl
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(v) => setFilter(spec.key, field.key, v)}
                    currentUser={currentUser}
                    {...suggestionProps(spec.key, field, values[field.key])}
                  />
                )
              )}
            </div>

            {spec.crossCheckNote ? (
              <div className="prop-cross">
                {spec.crossCheckNote}
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="prop-submit-footer">
        {error || localError ? <div className="prop-err">{error || localError}</div> : null}
        <div className="prop-actions">
          <button
            type="button"
            className="prop-save run"
            disabled={saving || !canSubmit}
            onClick={handleSubmit}
            title={
              !canSubmit
                ? "Describe the idea or attach a file before the first Submit"
                : undefined
            }
          >
            {saving ? <Loader2 size={15} className="spin" /> : null}
            {savedFlash ? "Submitted" : saving ? "Submitting…" : "Submit"}
          </button>
        </div>
        <p className="prop-submit-note">
          Submitting publishes a new version — everyone opening this page sees the latest entries.
          {!doc.researchRunAt
            ? " The first submit also runs research once and offers suggestions on empty fields."
            : " Research already ran for this proposition; later Submits only save."}
        </p>
        <AnalysisSummary
          advisoryChecks={summaryChecks}
          visible={justSubmitted}
          stale={summaryStale}
        />
      </section>
    </main>
  );
}

const PROP_CSS = `
.prop-page{max-width:1080px;margin:0 auto;padding:0 28px 72px;color:#F3EAF8;}
.owner-tag{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:3px 9px;border-radius:999px;margin-left:8px;display:inline-block;vertical-align:middle;}
.prop-top{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:0 0 22px;box-shadow:0 12px 32px rgba(8,4,16,.35);}
.prop-version{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.55);margin:0 0 14px;}
.prop-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-idea-block{display:flex;flex-direction:column;gap:10px;}
.prop-field{display:flex;flex-direction:column;gap:6px;margin:0;}
.prop-field-inner{display:flex;flex-direction:column;gap:6px;}
.prop-field.span-2,.prop-check.span-2,.span-2{grid-column:1 / -1;}
.prop-label{font-family:var(--fm);font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.82);display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
.prop-helper{font-size:11.5px;color:rgba(243,234,248,.48);line-height:1.4;}
.prop-attach{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}
.prop-file-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;
  background:rgba(201,174,239,.12);border:1px solid rgba(201,174,239,.28);font-size:13px;}
.prop-file-chip img{width:22px;height:22px;object-fit:cover;border-radius:4px;}
.prop-file-chip button{border:none;background:transparent;color:#F3EAF8;cursor:pointer;display:inline-flex;}
.prop-page input,.prop-page select,.prop-page textarea{
  width:100%;background:var(--bg-soft, #22113A);border:1px solid var(--line, rgba(243,234,248,.14));border-radius:12px;
  color:var(--ink, #F3EAF8);font-family:var(--fd);font-size:14.5px;padding:11px 13px;outline:none;}
.prop-page select option{color:#170C25;background:#fff;}
.prop-page textarea{min-height:84px;resize:vertical;}
.prop-check{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;line-height:1.45;cursor:pointer;color:#F3EAF8;}
.prop-check input{width:auto;margin-top:3px;accent-color:#C9A0E8;}
.prop-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
.prop-submit-footer{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:8px 0 0;}
.prop-submit-note{margin:10px 0 0;font-size:12.5px;color:rgba(243,234,248,.55);line-height:1.45;}
.prop-save{display:inline-flex;align-items:center;gap:8px;background:#C9AEEF;color:#170C25;border:none;
  border-radius:999px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:var(--fd);}
.prop-save:disabled{opacity:.55;cursor:not-allowed;}
.analysis-summary{margin-top:20px;}
.analysis-summary.is-stale{opacity:.72;}
.summary-heading{margin:0 0 4px;font-size:18px;letter-spacing:-.3px;color:var(--ink, #F3EAF8);}
.summary-lede{margin:0 0 12px;font-size:12.5px;color:var(--muted-2, rgba(243,234,248,.55));line-height:1.45;}
.summary-grid{display:flex;flex-direction:column;gap:2px;}
.summary-row{display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px dashed var(--border, rgba(243,234,248,.12));}
.summary-row:first-child{border-top:none;}
.summary-num{font-family:var(--fm);font-size:12px;color:var(--muted-3, rgba(243,234,248,.45));width:24px;}
.summary-title{flex:1;font-weight:600;color:var(--ink, #F3EAF8);}
.ai-suggestion-chip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:2px;
  padding:8px 12px;border-radius:10px;background:rgba(201,174,239,.12);
  border:1px solid rgba(201,174,239,.28);font-size:12px;color:#F3EAF8;line-height:1.4;}
.ai-suggestion-chip strong{font-weight:700;}
.ai-suggestion-chip button{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid rgba(243,234,248,.28);
  background:transparent;color:#F3EAF8;cursor:pointer;font-family:var(--fd);}
.ai-suggestion-chip button:hover{background:rgba(201,174,239,.2);}
.ai-pass-banner{margin:14px 0 0;padding:14px 16px;border-radius:12px;
  background:rgba(201,174,239,.1);border:1px solid rgba(201,174,239,.28);}
.ai-pass-kicker{margin:0 0 8px;font-family:var(--fm);font-size:11px;letter-spacing:.08em;
  text-transform:uppercase;color:#C9A0E8;}
.prop-page input:disabled,.prop-page select:disabled,.prop-page textarea:disabled{opacity:.55;cursor:not-allowed;}
.prop-field.is-locked,.prop-check.is-locked{cursor:not-allowed;}
.ai-not-covered{margin:0;padding-left:18px;font-size:12.5px;line-height:1.5;color:rgba(243,234,248,.78);}
.ai-not-covered li+li{margin-top:6px;}
.ai-pass-sources{margin-top:10px;font-size:12.5px;color:rgba(243,234,248,.7);}
.ai-pass-sources summary{cursor:pointer;}
.ai-pass-sources ul{margin:8px 0 0;padding-left:18px;}
.ai-pass-sources a{color:#C9AEEF;}
.prop-err{margin:10px 0 0;color:#E2716B;font-size:13px;display:flex;align-items:center;gap:6px;}
.prop-filter{background:#191919;border:1px solid rgba(243,234,248,.1);border-left-width:5px;border-left-style:solid;
  border-radius:16px;padding:18px 20px 16px;margin:0 0 16px;}
.prop-filter.is-locked{opacity:.78;}
.prop-filter-h{display:flex;align-items:flex-start;gap:12px;margin:0 0 14px;}
.prop-badge{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-family:var(--fm);
  font-size:13px;font-weight:700;flex-shrink:0;}
.prop-filter-title{margin:0;font-size:18px;letter-spacing:-.3px;}
.prop-filter-sub{margin:4px 0 0;font-size:12.5px;color:rgba(243,234,248,.55);}
.prop-status-wrap{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;}
.check-pill{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:5px 10px;border-radius:999px;white-space:nowrap;}
.check-pill[data-tone="pass"]{color:var(--pass);background:rgba(var(--pass-rgb),.16);}
.check-pill[data-tone="fail"]{color:var(--fail);background:rgba(var(--fail-rgb),.16);}
.check-pill[data-tone="watch"]{color:var(--watch);background:rgba(232,181,99,.16);}
.prop-cross{margin:12px 0 4px;padding:8px 12px;border-radius:10px;font-size:12.5px;
  background:rgba(232,181,99,.1);color:#E8B563;border:1px dashed rgba(232,181,99,.4);}
.prop-computed{background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;padding:12px 14px;
  display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;}
.prop-computed.is-empty{color:rgba(243,234,248,.45);font-size:13.5px;}
@media (max-width:760px){
  .prop-grid{grid-template-columns:1fr;}
  .prop-top{position:static;}
  .prop-page{padding:0 16px 56px;}
}
`;
