import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Check, FileText, FileUp, Loader2, Send, Sparkles, X } from "lucide-react";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import {
  OWNER_COLORS,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  mergeProposition,
} from "../lib/propositionFields.js";
import { canWriteField, ownerLabel } from "../lib/fieldOwnership.js";
import { isFilterUnlocked, nextLockedHint } from "../lib/filterUnlock.js";
import { goNoGoTone } from "../lib/goNoGo.js";

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

function FieldControl({
  field,
  value,
  onChange,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  currentUser,
  aiSourced = false,
}) {
  const helper = fieldHelper(field);
  const owners = Array.isArray(field.owners) ? field.owners : [];
  const full = field.type === "textarea" || field.type === "checkbox" || field.type === "computed";
  const locked = Boolean(currentUser && !canWriteField(currentUser.role, field.key));
  const lockTitle = locked ? `Owned by ${ownerLabel(field.key) || owners.join(" / ") || "another role"}` : undefined;
  // F2 uses auto-fill (Part 32) — never show accept/dismiss chips for those fields.
  const f2AutoKeys = new Set(["cogsAtScale", "netMarginAtScale", "mrpInr", "grammage", "qcomTrajectory"]);
  const showChip = !locked && suggestion != null && !f2AutoKeys.has(field.key);
  const chip =
    showChip ? (
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
      {aiSourced ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
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
  if (label === "Cleared" || label === "Exempt") return "pass";
  if (label === "Below floor") return "fail";
  return "watch";
}

function GoNoGoResult({ result }) {
  if (!result?.classification) return null;
  return (
    <div className="gonogo-result" data-tone={goNoGoTone(result.classification)}>
      <span className="gonogo-badge">{result.classification}</span>
      <p>{result.rationale || "No rationale returned."}</p>
    </div>
  );
}

function ProofUploadPanel({ proof, onPick, onClear, fileRef, error, disabled }) {
  return (
    <section className="proof-panel" aria-label="Market research proof">
      <h3 className="proof-title">Market-research proof</h3>
      <p className="proof-lede">
        Upload the U&A / tracker / study file that backs Filters 1–4. Filters 5 and 6 unlock after
        this file is attached.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
        onChange={onPick}
        hidden
      />
      {!proof ? (
        <button type="button" className="ghost" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> Upload proof (PDF, Word, or image)
        </button>
      ) : (
        <span className="chip file prop-file-chip">
          <FileText size={15} />
          {proof.name || "Proof file"}
          {!disabled ? (
            <button type="button" onClick={onClear} aria-label="Remove proof">
              <X size={12} />
            </button>
          ) : null}
        </span>
      )}
      {error ? (
        <div className="prop-err">
          <AlertTriangle size={14} /> {error}
        </div>
      ) : null}
    </section>
  );
}

function AnalysisSummary({ advisoryChecks, visible, stale, unlockedKeys }) {
  if (!visible || !advisoryChecks) return null;
  const filters = SIX_FILTERS_FORM.filter((f) => !unlockedKeys || unlockedKeys.has(f.key));
  return (
    <section className={`analysis-summary${stale ? " is-stale" : ""}`} aria-live="polite">
      <h2 className="summary-heading">Analysis</h2>
      <p className="summary-lede">
        {stale
          ? "Based on the previous submit — resubmit to refresh."
          : "Based on everything currently entered."}
      </p>
      <div className="summary-grid">
        {filters.map((f) => {
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
  llmProvider = "claude",
  providerStatus = [],
  onLlmProviderChange,
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
  const [fallbackUi, setFallbackUi] = useState(null);
  const [fallbackChoice, setFallbackChoice] = useState("");
  const [failedBanner, setFailedBanner] = useState(null);

  function bannerErrorText(label, body) {
    const raw = String(body || "").trim();
    if (!label) return raw;
    const stripped = raw.replace(
      new RegExp(`^(?:${label}\\s+(?:API|request)\\s+failed\\.?\\s*)+`, "i"),
      ""
    );
    return stripped || raw;
  }
  const [goNoGo, setGoNoGo] = useState(() => initial?.goNoGo || null);
  const [readingGoNoGo, setReadingGoNoGo] = useState(false);
  const [proofError, setProofError] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerText, setManagerText] = useState("");
  const [managerSubject, setManagerSubject] = useState("");
  const [managerCopied, setManagerCopied] = useState(false);
  const [f2AiSourced, setF2AiSourced] = useState({});
  const fileRef = useRef(null);
  const proofRef = useRef(null);

  useEffect(() => {
    setDoc(mergeProposition(initial));
    if (initial?.advisoryChecks) setAdvisoryChecks(initial.advisoryChecks);
    setGoNoGo(initial?.goNoGo || null);
  }, [initial?.id, initial?.version]);

  useEffect(() => {
    setAiSuggestions(null);
    setAiDismissed({});
    setAiPassMeta(null);
    setFileError("");
    setLocalError("");
    setFallbackUi(null);
    setFallbackChoice("");
    setProofError("");
    setJustSubmitted(false);
    setSummaryStale(false);
    setSummaryChecks(null);
    setGoNoGo(initial?.goNoGo || null);
    setManagerOpen(false);
    setF2AiSourced({});
  }, [initial?.id]);

  const propositionId = doc.id || initial?.id;
  const attachmentLocked = Boolean(currentUser && !canWriteField(currentUser.role, "attachment"));
  const hasIdeaMaterial = Boolean(String(doc.ideaDescription || "").trim() || doc.attachment?.data);
  const canSubmit = Boolean(doc.researchRunAt) || hasIdeaMaterial;
  const proofGateReady = isFilterUnlocked("proof-gate", doc);
  const f5Unlocked = isFilterUnlocked("f5", doc);
  const sendManagerReady = isFilterUnlocked("send-manager", doc);
  const unlockHint = nextLockedHint(doc);
  const unlockedFilterKeys = new Set(
    SIX_FILTERS_FORM.map((s) => s.key).filter((k) => isFilterUnlocked(k, doc))
  );
  const visibleFilters = SIX_FILTERS_FORM.filter((s) => unlockedFilterKeys.has(s.key));

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
    if (filterKey === "f2") {
      setF2AiSourced((prev) => {
        if (!prev[fieldKey]) return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  }

  function applyF2AutoFill(currentF2, suggestedF2) {
    const current = currentF2 && typeof currentF2 === "object" ? currentF2 : {};
    const suggested = suggestedF2 && typeof suggestedF2 === "object" ? suggestedF2 : {};
    const next = { ...current };
    const sourced = {};
    for (const key of ["cogsAtScale", "netMarginAtScale", "mrpInr", "grammage", "qcomTrajectory"]) {
      const empty = current[key] == null || current[key] === "";
      if (empty && suggested[key] != null && suggested[key] !== "") {
        next[key] = suggested[key];
        sourced[key] = true;
      }
    }
    return { next, sourced };
  }

  function applyResearchResult(data) {
    if (!data?.suggestions) return;
    const raw = { ...(data.suggestions || {}) };
    const f2Suggested = raw.f2;
    delete raw.f2; // F2 uses auto-fill, not chips

    if (f2Suggested && typeof f2Suggested === "object") {
      setDoc((prev) => {
        const { next, sourced } = applyF2AutoFill(prev.f2, f2Suggested);
        if (Object.keys(sourced).length) {
          Promise.resolve().then(() => {
            setF2AiSourced((prevFlags) => ({ ...prevFlags, ...sourced }));
          });
        }
        return { ...prev, f2: next };
      });
    }

    setAiSuggestions(raw);
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

  async function readUploadFile(file, setErr) {
    const name = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    const ok =
      isImageUpload(name, mime) ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      /\.(pdf|docx?)$/i.test(name);
    if (!ok) {
      setErr("Upload a PDF, Word file (.doc / .docx), or image (JPG, PNG, GIF, WebP, BMP).");
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr("Keep the file under 8 MB.");
      return null;
    }
    setErr("");
    const isImage = isImageUpload(name, mime);
    try {
      if (isImage) {
        try {
          return await rasterizeImageFile(file);
        } catch {
          return await readFileAsAttachment(file, true);
        }
      }
      return await readFileAsAttachment(file, false);
    } catch {
      setErr("Could not read that file. Try a JPG or PNG.");
      return null;
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || attachmentLocked) return;
    const attachment = await readUploadFile(file, setFileError);
    if (attachment) setTop("attachment", attachment);
  }

  async function handleProofFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || saving) return;
    const proof = await readUploadFile(file, setProofError);
    if (!proof) return;
    const next = { ...doc, marketResearchProof: proof };
    setDoc(next);
    setProofError("");
    const result = await onSave(next, llmProvider);
    if (result?.proposition) {
      setDoc(mergeProposition(result.proposition));
      if (result.proposition.advisoryChecks) setAdvisoryChecks(result.proposition.advisoryChecks);
    }
  }

  async function clearProof() {
    if (saving) return;
    const next = { ...doc, marketResearchProof: null };
    setDoc(next);
    const result = await onSave(next, llmProvider);
    if (result?.proposition) setDoc(mergeProposition(result.proposition));
  }

  async function runGoNoGoRead(propositionDoc = doc, providerOverride) {
    if (readingGoNoGo || !isFilterUnlocked("proof-gate", propositionDoc) || !propositionId) return null;
    const provider = providerOverride || llmProvider;
    setReadingGoNoGo(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/go-nogo`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposition: propositionDoc, provider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI read failed.");
      const nextGo = data.goNoGo || {
        classification: data.classification,
        rationale: data.rationale,
        at: new Date().toISOString(),
      };
      setGoNoGo(nextGo);
      setDoc((prev) => ({ ...prev, goNoGo: nextGo }));
      if (data.advisoryChecks) setAdvisoryChecks(data.advisoryChecks);
      return nextGo;
    } catch (e) {
      setLocalError(e.message || "AI read failed.");
      return null;
    } finally {
      setReadingGoNoGo(false);
    }
  }

  async function openSendToManagerModal() {
    if (!sendManagerReady || !propositionId || managerLoading) return;
    setManagerOpen(true);
    setManagerLoading(true);
    setManagerText("");
    setManagerCopied(false);
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/manager-draft`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposition: doc, provider: llmProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not draft the message.");
      setManagerSubject(data.subject || `6 Filter Test — ${doc.name || "proposition"}`);
      setManagerText(data.message || "");
    } catch (e) {
      setManagerText(e.message || "Couldn't draft the message — try again.");
    } finally {
      setManagerLoading(false);
    }
  }

  function copyManagerMsg() {
    const ta = document.createElement("textarea");
    ta.value = managerText;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* ignore */
    }
    document.body.removeChild(ta);
    setManagerCopied(true);
    window.setTimeout(() => setManagerCopied(false), 1600);
  }

  async function handleSubmit(providerOverride, submitOpts = {}) {
    if (saving) return;
    if (!canSubmit) {
      setLocalError("Describe the idea, or attach a file, before the first Submit.");
      return;
    }
    setLocalError("");
    setFailedBanner(null);
    const provider = providerOverride || llmProvider;
    const result = await onSave(doc, provider, {
      forceResearch: Boolean(submitOpts.forceResearch),
    });
    if (!result?.proposition) return;
    if (result.suggestions) applyResearchResult(result);
    if (result.researchError) {
      setLocalError(result.researchError);
      setFailedBanner({
        label: result.failedProviderLabel || provider || "Model",
        provider: result.failedProvider || provider,
        body: result.researchError,
      });
      if (result.suggestFallback && result.fallbackProviders?.length) {
        const nextChoice =
          result.fallbackProviders.find((p) => p.id === fallbackChoice)?.id ||
          result.fallbackProviders[0].id;
        setFallbackUi({
          failedLabel: result.failedProviderLabel || "Claude",
          providers: result.fallbackProviders,
        });
        setFallbackChoice(nextChoice);
      } else {
        setFallbackUi(null);
      }
    } else {
      setFallbackUi(null);
      setLocalError("");
      setFailedBanner(null);
    }
    const nextDoc = mergeProposition(result.proposition);
    setDoc(nextDoc);
    if (nextDoc.goNoGo) setGoNoGo(nextDoc.goNoGo);
    const checks = result.proposition.advisoryChecks || null;
    if (checks) setAdvisoryChecks(checks);
    setSummaryChecks(checks);
    setJustSubmitted(true);
    setSummaryStale(false);

    // GO/NO-GO/WATCH read runs from the same Submit once F1–F4 are complete.
    // Pass provider explicitly — React state from onLlmProviderChange may not have flushed yet.
    if (!result.researchError && isFilterUnlocked("proof-gate", nextDoc)) {
      await runGoNoGoRead({ ...nextDoc, ...doc, ...result.proposition }, provider);
    }
  }

  function handleRetryWithFallback() {
    const next = fallbackChoice || fallbackOptions[0]?.id;
    if (!next || saving) return;
    if (typeof onLlmProviderChange === "function") onLlmProviderChange(next);
    handleSubmit(next, { forceResearch: true });
  }

  const configuredProviders = (providerStatus || []).filter((p) => p.configured !== false);
  const fallbackOptions =
    fallbackUi?.providers?.length > 0
      ? fallbackUi.providers
      : configuredProviders.filter((p) => p.id !== (llmProvider || "claude"));

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

      {visibleFilters.map((spec) => {
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
                    aiSourced={spec.key === "f2" ? Boolean(f2AiSourced[field.key]) : false}
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

      {unlockHint && !f5Unlocked ? <p className="unlock-hint">{unlockHint}</p> : null}

      {proofGateReady ? (
        <section className="gonogo-panel">
          {readingGoNoGo ? (
            <p className="gonogo-reading">
              <Loader2 size={15} className="spin" /> Running GO / NO-GO / WATCH read…
            </p>
          ) : null}
          <GoNoGoResult result={goNoGo} />
          {goNoGo?.classification === "GO" ? (
            <ProofUploadPanel
              proof={doc.marketResearchProof}
              onPick={handleProofFile}
              onClear={clearProof}
              fileRef={proofRef}
              error={proofError}
              disabled={saving || readingGoNoGo}
            />
          ) : null}
          {goNoGo != null && goNoGo.classification !== "GO" ? (
            <p className="gonogo-blocked-note">
              Revise the filters above and Submit again once ready — the upload step and Filters
              5–6 aren&apos;t available until this reads GO.
            </p>
          ) : null}
          {goNoGo == null && !readingGoNoGo ? (
            <p className="gonogo-blocked-note">
              Submit below to run the GO / NO-GO / WATCH read for Filters 1–4.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="prop-submit-footer">
        {error || localError ? (
          <div className="prop-err" role="alert">
            {failedBanner?.label ? (
              <>
                <strong>{failedBanner.label} API failed.</strong>{" "}
                {bannerErrorText(failedBanner.label, failedBanner.body)}
              </>
            ) : (
              error || localError
            )}
          </div>
        ) : null}
        {fallbackUi && fallbackOptions.length > 0 ? (
          <div className="prop-fallback" role="region" aria-label="Model fallback">
            <p className="prop-fallback-lede">
              {fallbackUi.failedLabel} could not complete research. Pick another configured model and
              retry — your idea and form entries stay as they are.
            </p>
            <div className="prop-fallback-row">
              <label className="prop-fallback-pick">
                <span>Next model</span>
                <select
                  value={fallbackChoice || fallbackOptions[0]?.id || ""}
                  onChange={(e) => setFallbackChoice(e.target.value)}
                  disabled={saving}
                  aria-label="Fallback LLM provider"
                >
                  {fallbackOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.hint ? ` · ${p.hint}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="prop-save run"
                disabled={saving || !(fallbackChoice || fallbackOptions[0]?.id)}
                onClick={handleRetryWithFallback}
              >
                {saving ? <Loader2 size={15} className="spin" /> : null}
                Retry with{" "}
                {fallbackOptions.find((p) => p.id === (fallbackChoice || fallbackOptions[0]?.id))
                  ?.label || "fallback"}
              </button>
            </div>
            <p className="prop-fallback-hint">
              You can also switch the header Model control anytime; Submit uses that selection.
            </p>
          </div>
        ) : null}
        <div className="prop-actions">
          <button
            type="button"
            className="prop-save run"
            disabled={saving || readingGoNoGo || !canSubmit}
            onClick={() => handleSubmit()}
            title={
              !canSubmit
                ? "Describe the idea or attach a file before the first Submit"
                : undefined
            }
          >
            {saving || readingGoNoGo ? <Loader2 size={15} className="spin" /> : null}
            {savedFlash
              ? "Submitted"
              : readingGoNoGo
                ? "Analysing…"
                : saving
                  ? "Submitting…"
                  : "Submit"}
          </button>
          {sendManagerReady ? (
            <button type="button" className="ghost send-mgr" onClick={openSendToManagerModal}>
              <Send size={15} /> Send to Manager
            </button>
          ) : null}
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
          unlockedKeys={unlockedFilterKeys}
        />
      </section>

      {managerOpen ? (
        <div className="modal-bg" onClick={() => setManagerOpen(false)}>
          <div className="modal prop-mgr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span>
                <Send size={15} /> Send to Manager
              </span>
              <button type="button" className="ghost sq" onClick={() => setManagerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {managerLoading ? (
              <div className="modal-loading">
                <Loader2 size={20} className="spin" /> Drafting…
              </div>
            ) : (
              <>
                <textarea className="msg-area" readOnly value={managerText} rows={8} />
                <div className="prop-actions">
                  <button type="button" className="prop-save run" onClick={copyManagerMsg}>
                    {managerCopied ? <Check size={15} /> : <Copy size={15} />}
                    {managerCopied ? "Copied" : "Copy"}
                  </button>
                  <a
                    className="ghost send-mgr"
                    href={`mailto:?subject=${encodeURIComponent(managerSubject)}&body=${encodeURIComponent(managerText)}`}
                  >
                    Open in Mail
                  </a>
                </div>
                <p className="modal-foot">
                  Review before sending — this platform won&apos;t message anyone for you.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
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
.ai-sourced-tag{font-size:10px;font-family:var(--fm);color:#C9A0E8;margin-top:4px;display:inline-block;}
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
.prop-fallback{margin:12px 0 0;padding:14px 16px;border-radius:12px;
  background:rgba(226,113,107,.08);border:1px solid rgba(226,113,107,.35);}
.prop-fallback-lede{margin:0 0 12px;font-size:13px;line-height:1.45;color:#F3EAF8;}
.prop-fallback-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;}
.prop-fallback-pick{display:flex;flex-direction:column;gap:6px;min-width:200px;flex:1;}
.prop-fallback-pick span{font-family:var(--fm);font-size:11px;letter-spacing:.04em;
  color:rgba(243,234,248,.75);}
.prop-fallback-hint{margin:10px 0 0;font-size:12px;color:rgba(243,234,248,.55);line-height:1.4;}
.unlock-hint{margin:0 0 14px;font-size:13px;color:rgba(243,234,248,.58);line-height:1.4;}
.gonogo-panel{background:#191919;border:1px solid rgba(243,234,248,.12);border-radius:16px;
  padding:18px 20px;margin:0 0 16px;display:flex;flex-direction:column;gap:14px;}
.gonogo-reading{margin:0;display:inline-flex;align-items:center;gap:8px;font-size:13px;
  color:rgba(243,234,248,.7);}
.gonogo-result{padding:14px 16px;border-radius:12px;border:1px solid rgba(243,234,248,.16);}
.gonogo-result[data-tone="pass"]{border-color:rgba(126,220,168,.4);background:rgba(126,220,168,.08);}
.gonogo-result[data-tone="fail"]{border-color:rgba(226,113,107,.4);background:rgba(226,113,107,.08);}
.gonogo-result[data-tone="watch"]{border-color:rgba(232,181,99,.4);background:rgba(232,181,99,.08);}
.gonogo-badge{display:inline-block;font-family:var(--fm);font-size:12px;font-weight:700;
  letter-spacing:.06em;margin-bottom:8px;}
.gonogo-result[data-tone="pass"] .gonogo-badge{color:#7EDCA8;}
.gonogo-result[data-tone="fail"] .gonogo-badge{color:#E2716B;}
.gonogo-result[data-tone="watch"] .gonogo-badge{color:#E8B563;}
.gonogo-result p{margin:0;font-size:14px;line-height:1.5;color:#F3EAF8;}
.gonogo-blocked-note{margin:0;font-size:13px;line-height:1.45;color:rgba(243,234,248,.62);}
.proof-panel{padding-top:4px;}
.proof-title{margin:0 0 6px;font-size:16px;color:#F3EAF8;}
.proof-lede{margin:0 0 12px;font-size:13px;line-height:1.45;color:rgba(243,234,248,.58);}
.send-mgr{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(243,234,248,.28);
  border-radius:999px;padding:10px 16px;color:#F3EAF8;text-decoration:none;font-size:14px;
  font-family:var(--fd);background:transparent;cursor:pointer;}
.prop-mgr-modal .msg-area{width:100%;min-height:160px;margin:12px 0;background:var(--bg-soft,#22113A);
  border:1px solid rgba(243,234,248,.14);border-radius:12px;color:#F3EAF8;padding:12px;font-family:var(--fd);}
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
