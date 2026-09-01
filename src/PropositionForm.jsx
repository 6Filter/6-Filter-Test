import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, FileUp, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { DIVISION_NET_MARGIN, REVENUE_TARGET_BY_DIVISION } from "../lib/npdMaster.js";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import {
  FORUM_VERDICT_FIELD,
  OWNER_COLORS,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  VERDICT_NOTE_FIELD,
  f6Unlocked,
  filterStatus,
  mergeProposition,
} from "../lib/propositionFields.js";
import { ADVISORY_LABEL, computeAllAdvisoryChecks, computeF5Revenue } from "../lib/propositionScoring.js";
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
  if (spec.key === "f2" && spec.subtitleFromDivision) {
    const target = DIVISION_NET_MARGIN[division];
    if (target == null) return "path to the division floor (v4)";
    return spec.subtitleFromDivision(division, target);
  }
  if (spec.key === "f5" && spec.subtitleFromDivision) {
    const row = REVENUE_TARGET_BY_DIVISION[division];
    const target = row?.allChannels;
    if (target == null) return row?.note || "credible path to year-3 revenue (v4)";
    const base = spec.subtitleFromDivision(division, target);
    return row?.note ? `${base} · ${row.note}` : base;
  }
  return spec.subtitle || "";
}

function fieldHelper(field, division) {
  if (typeof field.helperFromDivision === "function") {
    const target = DIVISION_NET_MARGIN[division];
    if (target == null) return "Division floor: per respective division (v4, non-negotiable)";
    return field.helperFromDivision(division, target);
  }
  return field.helper || "";
}

const SUGGEST_BLOCKLIST = new Set([
  "finalVerdict",
  "finalVerdictNote",
  "forumVerdict",
  "verdictNote",
  "name",
  "category",
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
  const raw = filterKey ? suggestions?.[filterKey]?.[fieldKey] : suggestions?.[fieldKey];
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

function AiFirstPassModal({ open, onClose, onResult, propositionId }) {
  const [ideaText, setIdeaText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  if (!open) return null;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    const ok =
      isImageUpload(name, mime) ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      /\.(pdf|docx?)$/i.test(name);
    if (!ok) {
      setError("Upload a PDF, Word file (.doc / .docx), or image (JPG, PNG, GIF, WebP, BMP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Keep the file under 8 MB.");
      return;
    }
    setError("");
    const isImage = isImageUpload(name, mime);
    try {
      if (isImage) {
        try {
          setAttachment(await rasterizeImageFile(file));
        } catch {
          setAttachment(await readFileAsAttachment(file, true));
        }
      } else {
        setAttachment(await readFileAsAttachment(file, false));
      }
    } catch {
      setError("Could not read that file. Try a JPG or PNG.");
    }
  }

  async function run() {
    if (!ideaText.trim() && !attachment) {
      setError("Describe the idea, or attach a file, to run the AI first pass.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180000);
      try {
        const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/ai-first-pass`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaText: ideaText.trim(), image: attachment }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "AI first pass failed.");
        onResult(data);
        onClose();
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      setError(
        e?.name === "AbortError"
          ? "The first pass timed out. Try a shorter description."
          : e.message || "AI first pass failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Run AI first pass"
      onClick={() => !busy && onClose()}
    >
      <div className="modal product-idea-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="ghost sq product-idea-close"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <p className="ai-modal-kicker">Draft assist · not a Forum verdict</p>
        <label className="lbl">Product idea</label>
        <textarea
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          placeholder="A short description the persistent form doesn't carry — enough for the first pass to read."
          rows={6}
          disabled={busy}
        />
        <label className="lbl">Or attach idea / insight</label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFile}
          hidden
        />
        {!attachment ? (
          <button type="button" className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Upload PDF, Word, or image
          </button>
        ) : (
          <span className="chip file">
            {attachment.preview ? <img src={attachment.preview} alt="" /> : <FileText size={15} />}
            {attachment.name}
            <button type="button" disabled={busy} onClick={() => setAttachment(null)}><X size={12} /></button>
          </span>
        )}
        {error ? <div className="err"><AlertTriangle size={14} /> {error}</div> : null}
        <div className="ai-modal-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="run" disabled={busy} onClick={run}>
            <Sparkles size={15} /> {busy ? "Running first pass…" : "Run first pass"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldControl({ field, value, onChange, division, suggestion, onAcceptSuggestion, onDismissSuggestion, currentUser }) {
  const helper = fieldHelper(field, division);
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
      <p className="ai-pass-kicker">This pass does not cover F5 or F6</p>
      <ul className="ai-not-covered">
        {notCovered.map((item) => (
          <li key={item.filter}>
            <strong>{item.filter}</strong> — {item.reason}
          </li>
        ))}
      </ul>
      {sources.length ? (
        <details className="ai-pass-sources">
          <summary>Sources the first pass cited ({sources.length})</summary>
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

function ComputedRevenue({ f5, division }) {
  const cr = computeF5Revenue(f5);
  const row = REVENUE_TARGET_BY_DIVISION[division];
  const target = row?.allChannels ?? null;
  if (cr == null) {
    return <div className="prop-computed is-empty">Fill all five factors to compute year-3 revenue.</div>;
  }
  const shown = Math.round(cr * 10) / 10;
  const clears = target != null && cr >= target;
  return (
    <div className="prop-computed">
      <strong>₹{shown} Cr</strong>
      {target != null ? (
        <>
          <span> vs target ₹{target} Cr</span>
          <span className={clears ? "tone-pass" : "tone-watch"}>{clears ? "clears target" : "below target"}</span>
        </>
      ) : row?.note ? (
        <span> · {row.note}</span>
      ) : null}
    </div>
  );
}

function advisoryCopy(overall) {
  return ADVISORY_LABEL[overall] || "Advisory: not enough entered yet";
}

function AdvisoryCoveragePanel({ advisoryChecks }) {
  const rows = SIX_FILTERS_FORM.map((f) => ({
    num: f.num,
    title: f.title,
    checked: advisoryChecks[f.key]?.checked || [],
    notScored: advisoryChecks[f.key]?.notScored || [],
  }));
  return (
    <div className="panel advisory-coverage">
      <div className="panel-tab">Automated check coverage</div>
      <p className="about-lede">
        These are the only things checked automatically, against the v4 numeric
        floors. Everything else is a Forum judgment call — the list below names
        exactly what, per filter, so nobody mistakes a clean number for a cleared
        filter.
      </p>
      {rows.map((r) => (
        <div key={r.num} className="advisory-row">
          <div className="advisory-row-title">{r.num} — {r.title}</div>
          {r.checked.length > 0 && (
            <ul className="advisory-checked-list">
              {r.checked.map((c, i) => (
                <li key={i} data-pass={String(c.pass)}>
                  {c.rule}{c.value != null ? ` — ${c.value}` : ""} {c.pass ? "✓" : "✗"}
                  {c.note ? <span className="advisory-check-note"> {c.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {r.checked.length === 0 && <p className="advisory-none">Nothing entered yet to check automatically.</p>}
          <ul className="advisory-not-scored-list">
            {r.notScored.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ))}
    </div>
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
  onDelete,
  saving,
  savedFlash,
  error,
  currentUser,
}) {
  const [doc, setDoc] = useState(() => mergeProposition(initial));
  const [aiPassOpen, setAiPassOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiDismissed, setAiDismissed] = useState({});
  const [aiPassMeta, setAiPassMeta] = useState(null);

  useEffect(() => {
    setDoc(mergeProposition(initial));
  }, [initial?.id, initial?.version]);

  useEffect(() => {
    setAiSuggestions(null);
    setAiDismissed({});
    setAiPassMeta(null);
    setAiPassOpen(false);
  }, [initial?.id]);

  const division = doc.division || "";
  const unlocked = f6Unlocked(doc);
  const advisoryChecks = computeAllAdvisoryChecks(doc);
  const propositionId = doc.id || initial?.id;

  function setTop(key, value) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function setFilter(filterKey, fieldKey, value) {
    setDoc((prev) => ({
      ...prev,
      [filterKey]: { ...prev[filterKey], [fieldKey]: value },
    }));
  }

  function applyAiFirstPass(data) {
    const next = { ...(data.suggestions || {}) };
    if (data.division) next.division = data.division;
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

  return (
    <>
    <main className="prop-page">
      <style>{PROP_CSS}</style>

      <section className="prop-top">
        <div className="prop-top-meta">
          <p className="prop-kicker">Overall record · BH Forum</p>
          <p className="prop-version">
            {Number(doc.version) > 1
              ? `v${doc.version} · last saved ${formatSavedAt(doc.updatedAt)}`
              : "v1 · not yet saved for the team"}
          </p>
        </div>
        <p className="prop-overall-note">
          This is the overall verdict for the proposition, separate from the six per-filter forum verdicts below.
          Clearing the filters is not approval — final validation is at CKR level (v4).
        </p>
        <div className="prop-grid">
          {PROPOSITION_TOP_FIELDS.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={doc[field.key]}
              division={division}
              onChange={(v) => setTop(field.key, v)}
              currentUser={currentUser}
              {...suggestionProps("", field, doc[field.key])}
            />
          ))}
        </div>
        {error ? <div className="prop-err">{error}</div> : null}
        <AiPassResultBanner meta={aiPassMeta} />
        <AdvisoryCoveragePanel advisoryChecks={advisoryChecks} />
        <div className="prop-actions">
          <button
            type="button"
            className="prop-save"
            disabled={saving}
            onClick={() => onSave(doc)}
          >
            {saving ? <Loader2 size={15} className="spin" /> : null}
            {savedFlash ? "Saved" : saving ? "Saving…" : "Save for the team"}
          </button>
          <button
            type="button"
            className="ghost ai-first-pass-btn"
            disabled={saving || !propositionId}
            onClick={() => setAiPassOpen(true)}
          >
            <Sparkles size={15} /> Run AI first pass
          </button>
          <button
            type="button"
            className="prop-delete"
            disabled={saving || (currentUser && currentUser.role !== "ADMIN" && currentUser.role !== "BM")}
            onClick={() => onDelete(doc)}
          >
            <Trash2 size={14} /> Delete proposition
          </button>
        </div>
      </section>

      {SIX_FILTERS_FORM.map((spec) => {
        const values = doc[spec.key] || {};
        const status = filterStatus(spec.key, values, values.forumVerdict, spec.key === "f6" ? unlocked : true);
        const check = advisoryChecks[spec.key] || { overallAdvisory: "insufficient-evidence" };
        const locked = spec.key === "f6" && !unlocked;
        return (
          <section
            key={spec.key}
            className={`prop-filter${locked ? " is-locked" : ""}`}
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
                <p className="prop-filter-sub">{filterSubtitle(spec, division)}</p>
              </div>
              <div className="prop-status-wrap">
                <span className={`prop-status tone-${status.tone}`}>{status.label}</span>
                <span className="advisory-note" data-advisory={check.overallAdvisory}>
                  {advisoryCopy(check.overallAdvisory)}
                </span>
              </div>
            </div>

            <div className="prop-grid">
              {spec.fields.map((field) =>
                field.type === "computed" ? (
                  <div key={field.key} className="prop-field span-2">
                    <div className="prop-label">{field.label}</div>
                    <ComputedRevenue f5={doc.f5} division={division} />
                  </div>
                ) : (
                  <FieldControl
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    division={division}
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

            <div className="prop-forum">
              <FieldControl
                field={FORUM_VERDICT_FIELD}
                value={values.forumVerdict}
                division={division}
                currentUser={currentUser}
                onChange={(v) => setFilter(spec.key, "forumVerdict", v)}
              />
              <FieldControl
                field={VERDICT_NOTE_FIELD}
                value={values.verdictNote}
                division={division}
                currentUser={currentUser}
                onChange={(v) => setFilter(spec.key, "verdictNote", v)}
              />
            </div>
          </section>
        );
      })}
    </main>
      <AiFirstPassModal
        open={aiPassOpen}
        onClose={() => setAiPassOpen(false)}
        onResult={applyAiFirstPass}
        propositionId={propositionId}
      />
    </>
  );
}

const PROP_CSS = `
.prop-page{max-width:1080px;margin:0 auto;padding:0 28px 72px;color:#F3EAF8;}
.owner-tag{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:3px 9px;border-radius:999px;margin-left:8px;display:inline-block;vertical-align:middle;}
.prop-top{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:0 0 22px;box-shadow:0 12px 32px rgba(8,4,16,.35);}
.prop-top-meta{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap;}
.prop-kicker{font-family:var(--fm);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#C9A0E8;margin:0;}
.prop-version{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.55);margin:0;}
.prop-overall-note{margin:8px 0 14px;font-size:13px;line-height:1.5;color:rgba(243,234,248,.62);}
.prop-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-field{display:flex;flex-direction:column;gap:6px;margin:0;}
.prop-field-inner{display:flex;flex-direction:column;gap:6px;}
.prop-field.span-2,.prop-check.span-2{grid-column:1 / -1;}
.prop-label{font-family:var(--fm);font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.82);display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
.prop-helper{font-size:11.5px;color:rgba(243,234,248,.48);line-height:1.4;}
.prop-page input,.prop-page select,.prop-page textarea{
  width:100%;background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;
  color:#F3EAF8;font-family:var(--fd);font-size:14.5px;padding:11px 13px;outline:none;}
.prop-page select option{color:#170C25;background:#fff;}
.prop-page textarea{min-height:84px;resize:vertical;}
.prop-page input:focus,.prop-page select:focus,.prop-page textarea:focus{
  border-color:#C9AEEF;box-shadow:0 0 0 3px rgba(201,174,239,.18);}
.prop-check{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;line-height:1.45;cursor:pointer;color:#F3EAF8;}
.prop-check input{width:auto;margin-top:3px;accent-color:#C9A0E8;}
.prop-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
.prop-save{display:inline-flex;align-items:center;gap:8px;background:#C9AEEF;color:#170C25;border:none;
  border-radius:999px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:var(--fd);}
.prop-save:disabled{opacity:.7;cursor:wait;}
.ai-first-pass-btn{background:transparent;color:#F3EAF8;border:1px solid rgba(243,234,248,.28);
  border-radius:999px;padding:10px 16px;font-weight:600;font-size:13.5px;}
.prop-page .ai-first-pass-btn:hover{background:rgba(201,174,239,.12);border-color:rgba(201,174,239,.45);color:#F3EAF8;}
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
.ai-modal-kicker{margin:0 28px 4px 0;font-family:var(--fm);font-size:11px;letter-spacing:.1em;
  text-transform:uppercase;color:#7C4DBE;font-weight:700;}
.ai-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:8px;}
.ai-modal-actions .run{width:auto;margin:0;padding:10px 16px;border-radius:999px;}
.prop-delete{display:inline-flex;align-items:center;gap:8px;background:transparent;color:#E2716B;
  border:1px solid rgba(226,113,107,.4);border-radius:999px;padding:10px 16px;font-weight:600;font-size:13.5px;cursor:pointer;font-family:var(--fd);}
.prop-err{margin:10px 0 0;color:#E2716B;font-size:13px;}
.prop-filter{background:#191919;border:1px solid rgba(243,234,248,.1);border-left-width:5px;border-left-style:solid;
  border-radius:16px;padding:18px 20px 16px;margin:0 0 16px;}
.prop-filter.is-locked{opacity:.78;}
.prop-filter-h{display:flex;align-items:flex-start;gap:12px;margin:0 0 14px;}
.prop-badge{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-family:var(--fm);
  font-size:13px;font-weight:700;flex-shrink:0;}
.prop-filter-title{margin:0;font-size:18px;letter-spacing:-.3px;}
.prop-filter-sub{margin:4px 0 0;font-size:12.5px;color:rgba(243,234,248,.55);}
.prop-status{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:5px 10px;border-radius:999px;white-space:nowrap;}
.prop-status-wrap{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}
.advisory-note{font-size:11px;font-family:var(--fm);text-align:right;max-width:220px;line-height:1.35;}
.advisory-note[data-advisory="meets-floor"]{color:var(--pass);}
.advisory-note[data-advisory="below-floor"]{color:var(--fail);}
.advisory-note[data-advisory="insufficient-evidence"],
.advisory-note[data-advisory="not-started"]{color:var(--muted-3);}
.advisory-note[data-advisory="exempt"]{color:var(--watch);}
.advisory-coverage{background:#191919;border:1px solid rgba(243,234,248,.12);border-radius:14px;padding:22px 18px 8px;margin:14px 0 0;position:relative;}
.advisory-coverage .about-lede{font-size:13px;line-height:1.5;color:rgba(243,234,248,.62);margin:8px 0 4px;}
.advisory-row{padding:14px 0;}
.advisory-row + .advisory-row{border-top:1px solid rgba(243,234,248,.12);}
.advisory-row-title{font-weight:600;color:#F3EAF8;margin-bottom:6px;font-size:13.5px;}
.advisory-checked-list{list-style:none;margin:0 0 8px;padding:0;font-size:13px;}
.advisory-checked-list li[data-pass="true"]{color:var(--pass);}
.advisory-checked-list li[data-pass="false"]{color:var(--fail);}
.advisory-check-note{display:block;font-size:12px;color:rgba(243,234,248,.5);font-weight:400;margin:2px 0 0;}
.advisory-not-scored-list{list-style:disc;margin:0;padding-left:18px;font-size:12px;color:rgba(243,234,248,.45);}
.advisory-none{font-size:12.5px;color:rgba(243,234,248,.45);margin:0 0 8px;}
.prop-status.tone-pass{color:var(--pass);background:rgba(var(--pass-rgb),.16);}
.prop-status.tone-fail{color:var(--fail);background:rgba(var(--fail-rgb),.16);}
.prop-status.tone-watch{color:var(--watch);background:rgba(232,181,99,.16);}
.prop-cross{margin:12px 0 4px;padding:8px 12px;border-radius:10px;font-size:12.5px;
  background:rgba(232,181,99,.1);color:#E8B563;border:1px dashed rgba(232,181,99,.4);}
.prop-cross.is-flag{background:rgba(226,113,107,.12);color:#E2716B;border-color:rgba(226,113,107,.45);}
.prop-forum{margin-top:16px;padding-top:14px;border-top:1px dashed rgba(243,234,248,.2);
  display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-computed{background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;padding:12px 14px;
  display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;}
.prop-computed.is-empty{color:rgba(243,234,248,.45);font-size:13.5px;}
.prop-computed .tone-pass{color:var(--pass);font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;}
.prop-computed .tone-watch{color:var(--watch);font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;}
@media (max-width:760px){
  .prop-grid,.prop-forum{grid-template-columns:1fr;}
  .prop-top{position:static;}
  .prop-page{padding:0 16px 56px;}
}
`;
