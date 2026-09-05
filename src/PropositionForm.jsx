import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Copy, Check, FileText, FileUp, Loader2, Send, Wand2, X } from "lucide-react";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import {
  FORUM_VERDICT_FIELD,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  VERDICT_NOTE_FIELD,
  hasSubmitterIdentity,
  mergeProposition,
} from "../lib/propositionFields.js";
import { canWriteField, ownerLabel, ownershipBanner } from "../lib/fieldOwnership.js";
import {
  canProceedToProofUpload,
  hasManagerApproval,
  isFilterUnlocked,
  nextLockedHint,
} from "../lib/filterUnlock.js";
import {
  canRequestManagerReview,
  timeAgo,
  viewerCanApproveManagerReview,
} from "../lib/managerReview.js";
import { sidebarNavItems, submitProgress } from "../lib/formProgress.js";
import { isNamedBenchmark } from "../lib/benchmarkName.js";
import {
  applyLocalGate,
  buildGateRationale,
  computeGoNoGo,
  filterCheckScore,
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  analysisCheckItems,
} from "../lib/goNoGo.js";
import {
  closestPathToGo,
  computeImprovementPointValues,
  countFiltersWithEvidence,
  f2ActualVsFloor,
  f3ActualVsCeiling,
  formatOutputDate,
  formatScreenedDuration,
  scoreArcColor,
} from "../lib/improvementPoints.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc, ideaScaleImpactCopy } from "../lib/ideaScale.js";
import { rewriteUnmatchedDivisionCopy } from "../lib/sanitizeAiText.js";
import { fallbackFilterNarrative, stripFormAdminNarrative } from "../lib/filterNarrativeText.js";
import { computeMrp, formatRupeeInr, hydrateMarginElasticityMrp, isMarginElasticityUnfilled, marginElasticityUnchanged, marginPctFromMrp, recastMarginElasticityLive, seedMarginElasticityFromAi, withoutPercentSign } from "../lib/mrpFormula.js";
import { expectedProcessMs } from "../lib/processTimer.js";
import { resolveGstRate } from "../lib/gstRate.js";
import {
  DIMENSION_LABELS,
  TECH_SHIFT_DIMENSIONS,
  effectiveOverallRisk,
  isTechShiftRiskUnfilled,
  normalizeTechShiftRisk,
} from "../lib/techShiftRisk.js";

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
  "submitterName",
  "submitterDepartment",
]);

const AI_AUTO_SKIP = new Set([
  ...SUGGEST_BLOCKLIST,
  "financeSigned",
  "cmiHeadSigned",
  "pureCommodity",
  "mrpInr",
]);

function sourcedPath(filterKey, fieldKey) {
  return filterKey ? `${filterKey}.${fieldKey}` : fieldKey;
}

function isUnfilledValue(value) {
  if (value == null || value === "") return true;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.dimensions != null) return isTechShiftRiskUnfilled(value);
    if (
      "minMrpInr" in value ||
      "maxMrpInr" in value ||
      "minMarginPct" in value ||
      "maxMarginPct" in value
    ) {
      return isMarginElasticityUnfilled(value);
    }
    return value.maxMarginPct == null;
  }
  return false;
}

function applyAiAutoFill(current, suggested, { overwritePaths = {}, filterKey = "" } = {}) {
  const now = current && typeof current === "object" ? current : {};
  const incoming = suggested && typeof suggested === "object" ? suggested : {};
  const next = { ...now };
  const sourced = {};
  for (const [key, val] of Object.entries(incoming)) {
    if (AI_AUTO_SKIP.has(key)) continue;
    if (val == null || val === "") continue;
    const path = sourcedPath(filterKey, key);
    const gstOwned = overwritePaths[sourcedPath(filterKey, "gstRatePct")];
    if (key === "gstBasis" && !isUnfilledValue(now.gstRatePct) && !gstOwned && !overwritePaths[path]) continue;
    // Grammage / COGS / margin: same empty-field guard as Part 44 — never overwrite a typed or already-sourced value.
    if (!isUnfilledValue(now[key]) && !overwritePaths[path]) continue;
    next[key] = val;
    sourced[key] = true;
  }
  return { next, sourced };
}

function mergeSuggestionsIntoDoc(baseDoc, suggestions, { overwritePaths = {} } = {}) {
  const raw = suggestions && typeof suggestions === "object" ? suggestions : {};
  const flags = {};
  let nextDoc = baseDoc;
  if (raw.top && typeof raw.top === "object") {
    const { next, sourced } = applyAiAutoFill({ category: nextDoc.category }, raw.top, {
      overwritePaths,
      filterKey: "",
    });
    nextDoc = { ...nextDoc, ...next };
    for (const key of Object.keys(sourced)) flags[sourcedPath("", key)] = true;
  }
  for (const filterKey of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
    if (!raw[filterKey] || typeof raw[filterKey] !== "object") continue;
    const { next, sourced } = applyAiAutoFill(nextDoc[filterKey], raw[filterKey], {
      overwritePaths,
      filterKey,
    });
    nextDoc = { ...nextDoc, [filterKey]: next };
    for (const key of Object.keys(sourced)) flags[sourcedPath(filterKey, key)] = true;
  }
  if (raw.f3?.marginElasticity) {
    const seeded = seedMarginElasticityFromAi(
      nextDoc.f3?.marginElasticity,
      raw.f3.marginElasticity,
      nextDoc.f2?.cogsAtScale
    );
    const before = nextDoc.f3?.marginElasticity;
    const changed =
      Number(before?.minMrpInr) !== Number(seeded?.minMrpInr) ||
      Number(before?.maxMrpInr) !== Number(seeded?.maxMrpInr);
    if (seeded && seeded !== before) {
      nextDoc = {
        ...nextDoc,
        f3: { ...(nextDoc.f3 || {}), marginElasticity: { ...seeded, aiSourced: true } },
      };
      if (changed || isMarginElasticityUnfilled(before)) {
        flags[sourcedPath("f3", "marginElasticity")] = true;
      }
    }
  }
  if (raw.f4?.techShiftRisk) {
    const current = nextDoc.f4?.techShiftRisk;
    if (isTechShiftRiskUnfilled(current)) {
      const seeded = normalizeTechShiftRisk(raw.f4.techShiftRisk);
      if (seeded?.dimensions) {
        nextDoc = {
          ...nextDoc,
          f4: { ...(nextDoc.f4 || {}), techShiftRisk: { ...seeded, aiSourced: true } },
        };
        flags[sourcedPath("f4", "techShiftRisk")] = true;
      }
    }
  }
  return { doc: nextDoc, sourced: flags };
}

function isEmptyField(value) {
  if (value == null) return true;
  if (typeof value === "boolean") return value === false;
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length === 0;
    if (value.dimensions != null) return isTechShiftRiskUnfilled(value);
    return value.minMrpInr == null && value.maxMrpInr == null && value.minMarginPct == null && value.maxMarginPct == null;
  }
  return String(value).trim() === "";
}

function formatSuggestion(field, value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.dimensions) {
    const overall = effectiveOverallRisk(value) || "—";
    return `${overall} structural risk`;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && ("minMrpInr" in value || "maxMrpInr" in value || "minMarginPct" in value)) {
    const rupee = hydrateMarginElasticityMrp(value, null);
    return `${formatRupeeInr(rupee?.minMrpInr)}–${formatRupeeInr(rupee?.maxMrpInr)}`;
  }
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

function AiWandMark({ size = 13 }) {
  return (
    <span className="ai-wand" title="AI generated — review" aria-label="AI generated">
      <Wand2 size={size} strokeWidth={2.2} />
    </span>
  );
}

function SuggestionChip({ field, suggestion, basis, onAccept, onDismiss }) {
  return (
    <div className="ai-suggestion-chip">
      <AiWandMark size={12} />
      <span>
        AI suggests: <strong>{formatSuggestion(field, suggestion)}</strong>
        {basis ? <span className="ai-suggestion-basis"> — {basis}</span> : null}
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
  suggestionBasis = "",
  onAcceptSuggestion,
  onDismissSuggestion,
  currentUser,
  aiSourced = false,
  liveNote = "",
  loading = false,
  breakdownNote = "",
  taxNotes = null,
  cogsAtScale = null,
  inactive = false,
  inactiveHint = "",
  onReassess,
  reassessing = false,
}) {
  const helper = inactive && inactiveHint ? inactiveHint : fieldHelper(field);
  const owners = Array.isArray(field.owners) ? field.owners : [];
  const full = field.type === "textarea" || field.type === "checkbox" || field.type === "computed" || field.type === "computed-range" || field.type === "computed-risk";
  const roleLocked = Boolean(currentUser && !canWriteField(currentUser.role, field.key));
  const locked = roleLocked || inactive;
  const lockTitle = roleLocked
    ? `Owned by ${ownerLabel(field.key) || owners.join(" / ") || "another role"}`
    : inactive
      ? inactiveHint || "Name a benchmark to declare a gap."
      : undefined;
  const f2AutoKeys = new Set(["cogsAtScale", "netMarginAtScale", "gstRatePct", "mrpInr", "grammage", "qcomTrajectory", "marginElasticity", "techShiftRisk"]);
  const showChip = !locked && suggestion != null && !f2AutoKeys.has(field.key);
  const chip =
    showChip ? (
      <SuggestionChip
        field={field}
        suggestion={suggestion}
        basis={suggestionBasis}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
      />
    ) : null;
  const wand = aiSourced ? <AiWandMark /> : null;

  if (field.type === "computed-risk") {
    const risk = value && typeof value === "object" ? value : {};
    const overall = effectiveOverallRisk(risk);
    const dimensions = risk.dimensions && typeof risk.dimensions === "object" ? risk.dimensions : {};
    const hasBeenScored = Boolean(risk.dimensions) && Object.keys(dimensions).length > 0;
    const respondable = Object.entries(dimensions).filter(
      ([, d]) => d && (d.risk === "Medium" || d.risk === "High")
    );
    const hasResponseText = respondable.some(([, d]) => String(d?.userResponse || "").trim());
    const patchDimensionResponse = (key, userResponse) => {
      const cell = { ...(dimensions[key] || {}), userResponse };
      delete cell.reassessedRisk;
      delete cell.reassessedReason;
      onChange({
        ...risk,
        dimensions: { ...dimensions, [key]: cell },
      });
    };
    return (
      <div
        className={`prop-field span-2${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}`}
        title={lockTitle}
        data-f4-risk="tech-shift"
        data-f4-state={hasBeenScored ? "scored" : "unscored"}
      >
        <div className="prop-label">
          {field.label}
          {wand}
        </div>
        {helper ? <p className="prop-helper">{helper}</p> : null}
        {!hasBeenScored ? (
          <div className="f4-unscored-state">
            <div className="dimension-pills-inert">
              {TECH_SHIFT_DIMENSIONS.map((key) => (
                <span key={key} className="pill-inert">
                  {DIMENSION_LABELS[key]}
                </span>
              ))}
            </div>
            <p className="f4-cta">
              Submit the idea to run AI research across these seven points — response fields for any Medium or High
              finding will appear here afterward.
            </p>
          </div>
        ) : (
          <>
            <p className="prop-helper">Points scored</p>
            <ul className="f4-eval-points">
              {TECH_SHIFT_DIMENSIONS.map((key) => (
                <li key={key}>{DIMENSION_LABELS[key]}</li>
              ))}
            </ul>
            {overall ? <p className="derived-note">Current overall: {overall}</p> : null}
            {respondable.length ? (
              <div className="f4-response-list">
                {respondable.map(([key, d]) => (
                  <div key={key} className="dimension-response">
                    <div className="dimension-response-label">{DIMENSION_LABELS[key] || key}</div>
                    <div className="dimension-finding original">
                      Original: {d.risk} risk — {d.reason}
                    </div>
                    {d.reassessedRisk ? (
                      <div className="dimension-finding reassessed">
                        After response: {d.reassessedRisk} risk — {d.reassessedReason}
                      </div>
                    ) : null}
                    <textarea
                      rows={3}
                      placeholder="Respond with specific, verifiable evidence — a signed contract, a lab report, a certification timeline. Vague reassurance won't move the rating."
                      value={d.userResponse || ""}
                      disabled={locked || reassessing}
                      title={lockTitle}
                      onChange={(e) => patchDimensionResponse(key, e.target.value)}
                    />
                  </div>
                ))}
                {typeof onReassess === "function" ? (
                  <button
                    type="button"
                    className="ghost f4-reassess"
                    disabled={locked || reassessing || !hasResponseText}
                    onClick={onReassess}
                  >
                    {reassessing ? <Loader2 size={15} className="spin" /> : null}
                    {reassessing ? "Re-assessing…" : "Re-assess Filter 4 with responses"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        {aiSourced ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
        {liveNote ? <p className="derived-note">{liveNote}</p> : null}
        {chip}
      </div>
    );
  }

  if (field.type === "computed-range") {
    const range = hydrateMarginElasticityMrp(value && typeof value === "object" ? value : {}, cogsAtScale) || {};
    const minMrp = range.minMrpInr;
    const maxMrp = range.maxMrpInr;
    const minInput = minMrp != null && Number.isFinite(Number(minMrp)) ? Number(Number(minMrp).toFixed(2)) : "";
    const maxInput = maxMrp != null && Number.isFinite(Number(maxMrp)) ? Number(Number(maxMrp).toFixed(2)) : "";
    const patchMrp = (end, raw) => {
      const nextVal = raw === "" ? null : Number(raw);
      const mrp = Number.isFinite(nextVal) ? nextVal : null;
      const marginKey = end === "minMrpInr" ? "minMarginPct" : "maxMarginPct";
      const margin = mrp != null ? marginPctFromMrp(cogsAtScale, mrp) : null;
      onChange({
        ...range,
        [end]: mrp,
        [marginKey]: margin,
        aiSourced: false,
      });
    };
    const basisNote = withoutPercentSign(range.basis);
    return (
      <div className={`prop-field span-2${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}`} title={lockTitle} data-f3-range="mrp">
        <div className="prop-label">
          {field.label}
          {wand}
        </div>
        {helper ? <p className="prop-helper">{helper}</p> : null}
        {loading ? (
          <div className="me-loading" role="status" aria-live="polite">
            <Loader2 size={16} className="spin" aria-hidden="true" />
            Calculating safe MRP range — checking category pricing and inflation data…
          </div>
        ) : range?.rangeError ? (
          <p className="derived-note error">{range.rangeError}</p>
        ) : minInput !== "" || maxInput !== "" ? (
          <>
            <div className="mrp-range-display">
              <span className="me-min">{formatRupeeInr(range?.minMrpInr)}</span>
              <span className="me-sep">–</span>
              <span className="me-max">{formatRupeeInr(range?.maxMrpInr)}</span>
              {aiSourced ? <Wand2 size={13} className="ai-sourced-mark" /> : null}
            </div>
            <p className="derived-note">Safe MRP range over the next 5 years</p>
          </>
        ) : (
          <p className="derived-note">
            No range calculated yet — Submit to run the AI first pass, or enter values
            manually below.
          </p>
        )}
        {range?.packSizeWarning ? <p className="derived-note error">{range.packSizeWarning}</p> : null}
        {range?.mrpAdjustmentNote ? <p className="derived-note error">{range.mrpAdjustmentNote}</p> : null}
        {basisNote && !range?.rangeError && basisNote !== range?.packSizeWarning && basisNote !== range?.mrpAdjustmentNote ? (
          <p className="derived-note">{basisNote}</p>
        ) : null}
        <div className="me-overrides">
          <label>
            Min MRP (₹)
            <input
              type="number"
              step="any"
              value={minInput}
              disabled={locked || loading}
              title={loading ? "Wait for the AI range before editing, or enter values after it finishes" : lockTitle}
              onChange={(e) => patchMrp("minMrpInr", e.target.value)}
            />
          </label>
          <label>
            Max MRP (₹)
            <input
              type="number"
              step="any"
              value={maxInput}
              disabled={locked || loading}
              title={loading ? "Wait for the AI range before editing, or enter values after it finishes" : lockTitle}
              onChange={(e) => patchMrp("maxMrpInr", e.target.value)}
            />
          </label>
        </div>
        {aiSourced && !loading ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
        {!loading && liveNote ? <p className="derived-note">{liveNote}</p> : null}
        {chip}
      </div>
    );
  }

  if (field.type === "computed") {
    return (
      <div className={`prop-field span-2`}>
        <div className="prop-label">
          {field.label}
          {wand}
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
          {wand}
        </span>
      </label>
    );
  }

  const listId = Array.isArray(field.datalist) && field.datalist.length ? `${field.key}-presets` : "";
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
      <>
        <input
          type={field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined}
          list={listId || undefined}
          value={value ?? ""}
          placeholder={field.placeholder || ""}
          disabled={locked}
          title={lockTitle}
          onChange={(e) => onChange(e.target.value)}
        />
        {listId ? (
          <datalist id={listId}>
            {field.datalist.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        ) : null}
      </>
    );

  return (
    <div className={`prop-field${full ? " span-2" : ""}${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}`} title={lockTitle}>
      <label className="prop-field-inner">
        <span className="prop-label">
          {field.label}
          {wand}
        </span>
        {input}
      </label>
      {aiSourced ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
      {helper ? <span className="prop-helper">{helper}</span> : null}
      {taxNotes}
      {!taxNotes && breakdownNote ? <p className="derived-note">{breakdownNote}</p> : null}
      {!taxNotes && liveNote ? <p className="price-gap-note">{liveNote}</p> : null}
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
      <p className="ai-pass-kicker">
        <AiWandMark size={12} /> Research assist · not a Forum verdict
      </p>
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

function filterCardTone(check, specKey) {
  const label = check?.checkLabel || "";
  if (specKey === "f6" && (label === "Awaiting panels" || !analysisCheckItems(check?.items).length)) {
    return "idle";
  }
  if (label === "Cleared" || label === "Exempt") return "pass";
  if (label === "Below floor") return "fail";
  return "watch";
}

function FilterComparePair({ label, actual, target, unit }) {
  return (
    <div className="filter-compare">
      <div>
        <span className="mono filter-compare-lbl">{label}</span>
        <strong className="mono">{unit === "₹" ? `₹${Math.round(actual)}` : `${actual}${unit}`}</strong>
      </div>
      <div>
        <span className="mono filter-compare-lbl">{unit === "₹" ? "Safe max" : "Floor"}</span>
        <strong className="mono">{unit === "₹" ? `₹${Math.round(target)}` : `${target}${unit}`}</strong>
      </div>
    </div>
  );
}

function FilterStatusCard({ spec, check, narrative, compare }) {
  const tone = filterCardTone(check, spec.key);
  const items = analysisCheckItems(check?.items);
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  const label = check?.checkLabel || spec.defaultStatus || "Evidence missing";
  return (
    <article className="filter-status-card" data-tone={tone}>
      <div className="filter-status-head">
        <span className="mono filter-status-badge">{spec.num}</span>
        <span className="mono filter-status-label">{label}</span>
      </div>
      <h3>{spec.title}</h3>
      <p>{narrative}</p>
      {spec.key === "f4" && items.length ? (
        <ul className="f4-analysis-dims">
          {items.map((it, i) => (
            <li key={`${spec.key}-dim-${i}`} data-status={it.status}>
              {it.text}
            </li>
          ))}
        </ul>
      ) : compare ? (
        <FilterComparePair {...compare} />
      ) : total ? (
        <div className="filter-progress" aria-label={`${done} of ${total} items`}>
          <div className="filter-progress-track">
            <div className="filter-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="mono filter-progress-n">{done}/{total}</span>
        </div>
      ) : (
        <span className="mono filter-progress-n">—</span>
      )}
    </article>
  );
}

function FilterTeaserCard({ spec, sub }) {
  const f5f6 = spec.key === "f5" || spec.key === "f6";
  return (
    <div id={spec.key} className={`teaser-card${f5f6 ? " teaser-f5f6" : ""}`}>
      <span className="teaser-badge">{spec.num}</span>
      <div>
        <div className="teaser-title">{spec.title}</div>
        <div className="teaser-sub">{sub}</div>
      </div>
    </div>
  );
}

function InlineFloorFail({ check }) {
  if (check?.checkLabel !== "Below floor") return null;
  const pending = (check.items || []).find((i) => i.status === "pending");
  return (
    <div className="inline-floor-fail">
      <div className="fail-title">Not cleared — the gap is short of the floor</div>
      {pending?.text ? <p>{pending.text}</p> : null}
    </div>
  );
}

function ManagerReviewPanel({
  classification,
  scorePct,
  review,
  currentUser,
  onRequest,
  onApprove,
  busy,
  comment,
  onComment,
}) {
  if (classification === "NO-GO") return null;
  if (classification !== "WATCH") return null;
  const approved = hasManagerApproval({ managerReview: review, managerApproval: review });
  const requestedAt = review?.requestedAt;
  const canApprove = viewerCanApproveManagerReview(currentUser);

  if (approved) {
    return (
      <div className="manager-review-panel is-approved">
        <p>
          Manager approved {review.approvedAt ? timeAgo(review.approvedAt) : ""}. Upload proof to unlock
          Filters 5–6, the same as a GO read.
        </p>
        {review.comment ? <blockquote className="manager-comment">{review.comment}</blockquote> : null}
      </div>
    );
  }

  return (
    <div className="manager-review-panel">
      <p>This idea isn&apos;t cleared yet, but a manager can approve it forward with a comment.</p>
      {requestedAt ? (
        <p className="manager-requested">Requested {timeAgo(requestedAt)}. Current read: WATCH at {scorePct}%</p>
      ) : (
        <button type="button" className="prop-save run" disabled={busy} onClick={onRequest}>
          {busy ? <Loader2 size={15} className="spin" /> : null}
          Request manager review
        </button>
      )}
      {requestedAt && canApprove ? (
        <div className="manager-review-form">
          <p>Requested {timeAgo(requestedAt)}. Current read: WATCH at {scorePct}%.</p>
          <textarea
            placeholder="Comment — required to approve"
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="prop-save run"
            disabled={busy || !String(comment || "").trim()}
            onClick={onApprove}
          >
            {busy ? <Loader2 size={15} className="spin" /> : null}
            Approve and unlock
          </button>
        </div>
      ) : requestedAt && !canApprove ? (
        <p className="manager-wait">Waiting for a manager (Admin or BH Forum) to approve with a comment.</p>
      ) : null}
    </div>
  );
}

function GoNoGoResultPage({
  result,
  advisoryChecks,
  category,
  ideaName,
  doc,
  onBack,
  onSubmit,
  saving,
  currentUser,
  onRequestReview,
  onApproveReview,
  managerBusy,
  managerComment,
  onManagerComment,
}) {
  if (!result?.classification) return null;
  const checks = advisoryChecks && typeof advisoryChecks === "object" ? advisoryChecks : {};
  const score = result.score?.total
    ? result.score
    : scoreAdvisoryChecks(checks);
  const tone = goNoGoTone(result.classification);
  const isGo = result.classification === "GO";
  const isWatch = result.classification === "WATCH";
  const categoryName = String(category || result.category || "").trim();
  const divisionName = String(doc?.division || "").trim();
  const idea = String(ideaName || result.ideaName || "").trim();
  const rationale = rewriteUnmatchedDivisionCopy(result.rationale || "No rationale returned.", categoryName);
  const improvementItems = computeImprovementPointValues(checks).map((it) => ({
    ...it,
    text: rewriteUnmatchedDivisionCopy(it.text, categoryName),
  }));
  const path = closestPathToGo(checks, improvementItems);
  const pathItems = path.items;
  const coverage = countFiltersWithEvidence(doc || {});
  const screened = formatScreenedDuration(doc?.researchDurationMs);
  const dated = formatOutputDate(doc?.updatedAt || result.at);
  const arc = scoreArcColor(score.pct);
  const ringPct = Math.max(0, Math.min(100, Number(score.pct) || 0));
  const scale = String(result.ideaScale || ideaScaleFromDoc(doc || {}) || "").trim() || "10g";
  const scaleImpact = ideaScaleImpactCopy(scale);

  return (
    <div className="output-page gonogo-result-page">
      <header className="output-meta">
        <span className="mono">
          IDEA · v4 RULESET{dated ? ` · ${dated}` : ""}
        </span>
        <span className="mono">
          {screened ? `Screened in ${screened} · ` : ""}
          {coverage.have} of {coverage.total} filters have evidence
        </span>
      </header>

      <div className="output-hero-row">
        <section className={`gonogo-hero tone-${tone}`} data-tone={tone}>
          <div className="gonogo-hero-copy">
            {idea ? <h1 className="gonogo-idea">{idea}</h1> : <h1 className="gonogo-idea">Untitled idea</h1>}
            <div className="gonogo-chips">
              {categoryName ? <span className="mono badge-chip">{categoryName}</span> : null}
              {divisionName ? <span className="mono badge-chip">{divisionName}</span> : null}
            </div>
            <div className="gonogo-badge-row">
              <div className={`gonogo-badge gonogo-classification tone-${tone}`}>{result.classification}</div>
              <span className="mono gonogo-scale-chip">
                {scale} · {scaleImpact}
              </span>
            </div>
            <p className="gonogo-rationale">{rationale}</p>
          </div>
          <div
            className="score-ring"
            style={{ background: `conic-gradient(${arc} ${ringPct}%, #2a1a3f 0)` }}
            aria-label={`Score ${score.pct}%`}
          >
            <div className="score-ring-inner">
              <strong className="mono gonogo-score">{score.pct}%</strong>
            </div>
          </div>
        </section>

        <aside className="path-panel">
          <div className="panel-kicker mono">Closest path to GO</div>
          <p className="path-score-line">
            <span className="mono">{score.pct}%</span>
            <span className="path-arrow" aria-hidden="true">→</span>
            <span className="mono path-projected">{path.projectedPct}%</span>
            {pathItems.length ? (
              <span className="path-if">
                {path.reachesGo
                  ? `if the top ${pathItems.length === 1 ? "item" : `${pathItems.length} items`} clear`
                  : `if ${pathItems.length === 1 ? "the remaining item clears" : `all ${pathItems.length} remaining items clear`} — still short of GO`}
              </span>
            ) : (
              <span className="path-if">
                {path.reachesGo ? "already above 80" : "nothing outstanding on the scored checklist"}
              </span>
            )}
          </p>
          {pathItems.length ? (
            <ul className="path-top-list">
              {pathItems.map((it, i) => (
                <li key={`${it.filter}-${i}`}>
                  <span className="mono imp-filter-tag">{it.filter}</span>
                  {it.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="path-empty">No scored gaps left on Filters 1–4.</p>
          )}
          {improvementItems.length ? (
            <a className="path-jump mono" href="#what-to-do-next">See all next steps</a>
          ) : null}
        </aside>
      </div>

      <div className="filter-grid">
        {SIX_FILTERS_FORM.map((spec) => {
          const check = checks[spec.key] || {};
          const stored = stripFormAdminNarrative(String(result.filterNarratives?.[spec.key] || "").trim());
          const awaiting = spec.key === "f6" && (check.checkLabel === "Awaiting panels" || check.infoLine);
          const narrative = rewriteUnmatchedDivisionCopy(
            awaiting
              ? (check.infoLine || "Awaiting prototype panels — Filter 6 is read when lab, consumer and pack results exist.")
              : stored || fallbackFilterNarrative(check),
            categoryName
          );
          let compare = null;
          if (spec.key === "f2") {
            const pair = f2ActualVsFloor(doc, check);
            if (pair) compare = { label: "Net margin", actual: pair.actual, target: pair.floor, unit: pair.unit };
          }
          if (spec.key === "f3") {
            const pair = f3ActualVsCeiling(doc);
            if (pair) compare = { label: "Implied MRP", actual: pair.actual, target: pair.ceiling, unit: pair.unit };
          }
          return (
            <FilterStatusCard
              key={spec.key}
              spec={spec}
              check={check}
              narrative={narrative}
              compare={compare}
            />
          );
        })}
      </div>

      <section className="next-steps" id="what-to-do-next">
        <div className="next-steps-head">
          <h2>What to do next</h2>
          <span className="mono">Ordered by score impact</span>
        </div>
        {improvementItems.length ? (
          improvementItems.map((item, i) => (
            <div key={`${item.filter}-${i}`} className="next-step-card">
              <div className="point-badge" data-tier={item.pointValue >= 10 ? "high" : "normal"}>
                +{item.pointValue}
              </div>
              <div>
                <div className="next-step-tags">
                  <span className="mono">{item.filter}</span>
                  <span className="mono">OWNER: {item.owners?.length ? item.owners.join(", ") : "—"}</span>
                </div>
                <p>{item.text}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="path-empty">Nothing outstanding on the scored Filter 1–4 checklist.</p>
        )}
      </section>

      {isGo ? (
        <p className="gonogo-blocked-note">
          Back to filters to upload market-research proof and unlock Filters 5–6.
        </p>
      ) : (
        <p className="gonogo-blocked-note">
          {isWatch
            ? "WATCH — a manager can approve this forward with a comment, or close the remaining Filter 1–4 gaps and Submit again. NO-GO (floor failure) cannot be overridden."
            : goNoGoIsFloorFailure(checks)
              ? "Revise the filters and Submit again — upload and Filters 5–6 stay locked. NO-GO has no manager override."
              : "Fill the remaining Filter 1–4 parameters and Submit again. This is incomplete, not a rejected idea. Upload and Filters 5–6 unlock only on GO."}
        </p>
      )}

      {isWatch ? (
        <ManagerReviewPanel
          classification={result.classification}
          scorePct={score.pct}
          review={doc?.managerReview}
          currentUser={currentUser}
          onRequest={onRequestReview}
          onApprove={onApproveReview}
          busy={managerBusy}
          comment={managerComment}
          onComment={onManagerComment}
        />
      ) : null}

      <div className="output-actions">
        <button
          type="button"
          className="output-btn-primary"
          disabled={saving}
          onClick={onSubmit}
        >
          {saving ? <Loader2 size={15} className="spin" /> : null}
          Submit
        </button>
        <button type="button" className="output-btn-secondary" onClick={onBack}>
          <ArrowLeft size={15} /> Back to filters
        </button>
      </div>
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

function researchInputKey(doc) {
  const attach = doc?.attachment;
  const attachSig = attach?.data
    ? String(attach.data).length
    : attach?.name
      ? `name:${attach.name}`
      : "";
  return `${String(doc?.name || "").trim().toLowerCase()}|${String(doc?.ideaDescription || "").trim().toLowerCase()}|${String(doc?.category || "").trim().toLowerCase()}|${attachSig}`;
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
  onProcessingChange,
}) {
  const [doc, setDoc] = useState(() => mergeProposition(initial));
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiDismissed, setAiDismissed] = useState({});
  const [aiPassMeta, setAiPassMeta] = useState(null);
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
  const [currentView, setCurrentView] = useState("propositionForm");
  const [readingGoNoGo, setReadingGoNoGo] = useState(false);
  const [proofError, setProofError] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerText, setManagerText] = useState("");
  const [managerSubject, setManagerSubject] = useState("");
  const [managerCopied, setManagerCopied] = useState(false);
  const [managerBusy, setManagerBusy] = useState(false);
  const [managerComment, setManagerComment] = useState("");
  const [aiSourced, setAiSourced] = useState({});
  const [mrpBaseInr, setMrpBaseInr] = useState(null);
  const [mrpFinalInr, setMrpFinalInr] = useState(null);
  const [researchKeyAtRun, setResearchKeyAtRun] = useState(() =>
    initial?.researchRunAt ? researchInputKey(initial) : ""
  );
  const proofRef = useRef(null);
  const mrpTouchedByHuman = useRef(false);
  const f3RangeTouchedByHuman = useRef(false);
  const gstTouchedByHuman = useRef(false);
  const f3AutoFillRequested = useRef(false);
  const docRef = useRef(doc);
  const aiSourcedRef = useRef({});
  const [f3Filling, setF3Filling] = useState(false);
  const [f4Reassessing, setF4Reassessing] = useState(false);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    aiSourcedRef.current = aiSourced;
  }, [aiSourced]);

  useEffect(() => {
    const merged = mergeProposition(initial);
    const filled =
      initial?.suggestions && !initial?.researchRunAt
        ? mergeSuggestionsIntoDoc(merged, initial.suggestions)
        : { doc: merged, sourced: {} };
    setDoc(filled.doc);
    setAiSourced(filled.sourced);
    setAiSuggestions(initial?.suggestions || null);
    if (initial?.advisoryChecks) setAdvisoryChecks(initial.advisoryChecks);
    setGoNoGo(initial?.goNoGo || null);
    setResearchKeyAtRun(initial?.researchRunAt ? researchInputKey(filled.doc) : "");
    f3RangeTouchedByHuman.current = false;
    gstTouchedByHuman.current = false;
    f3AutoFillRequested.current = false;
  }, [initial?.id]);

  useEffect(() => {
    setAiDismissed({});
    setAiPassMeta(null);
    setLocalError("");
    setFallbackUi(null);
    setFallbackChoice("");
    setProofError("");
    setJustSubmitted(false);
    setSummaryStale(false);
    setSummaryChecks(null);
    setGoNoGo(initial?.goNoGo || null);
    setCurrentView("propositionForm");
    setManagerOpen(false);
    setMrpBaseInr(null);
    setMrpFinalInr(null);
    mrpTouchedByHuman.current = false;
    f3RangeTouchedByHuman.current = false;
    gstTouchedByHuman.current = false;
    f3AutoFillRequested.current = false;
    setF3Filling(false);
  }, [initial?.id]);

  const f2Cogs = doc.f2?.cogsAtScale;
  const f2Margin = doc.f2?.netMarginAtScale;
  const f2Gst = doc.f2?.gstRatePct;

  useEffect(() => {
    const result = computeMrp({
      cogsAtScale: f2Cogs,
      netMarginAtScale: f2Margin,
      gstRatePct: f2Gst,
    });
    setMrpBaseInr(result?.baseMrp ?? null);
    setMrpFinalInr(result?.finalMrp ?? null);
    if (mrpTouchedByHuman.current) return;
    if (result?.finalMrp != null) {
      const nextVal = result.finalMrp.toFixed(2);
      setDoc((prev) => {
        if (String(prev.f2?.mrpInr ?? "") === nextVal) return prev;
        return { ...prev, f2: { ...(prev.f2 || {}), mrpInr: nextVal } };
      });
      setAiSourced((prev) =>
        prev[sourcedPath("f2", "mrpInr")] === true ? prev : { ...prev, [sourcedPath("f2", "mrpInr")]: true }
      );
    } else if (result?.baseMrp != null) {
      const nextVal = result.baseMrp.toFixed(2);
      setDoc((prev) => {
        if (String(prev.f2?.mrpInr ?? "") === nextVal) return prev;
        return { ...prev, f2: { ...(prev.f2 || {}), mrpInr: nextVal } };
      });
      setAiSourced((prev) =>
        prev[sourcedPath("f2", "mrpInr")] === true ? prev : { ...prev, [sourcedPath("f2", "mrpInr")]: true }
      );
    } else {
      setDoc((prev) => {
        if (String(prev.f2?.mrpInr ?? "") === "") return prev;
        return { ...prev, f2: { ...(prev.f2 || {}), mrpInr: "" } };
      });
      setAiSourced((prev) => {
        if (prev[sourcedPath("f2", "mrpInr")] === false || prev[sourcedPath("f2", "mrpInr")] == null) {
          return prev;
        }
        return { ...prev, [sourcedPath("f2", "mrpInr")]: false };
      });
    }
  }, [f2Cogs, f2Margin, f2Gst]);

  const f3SuggestedRange = aiSuggestions?.f3?.marginElasticity;
  useEffect(() => {
    if (f3RangeTouchedByHuman.current) return;
    const mrp = computeMrp({
      cogsAtScale: f2Cogs,
      netMarginAtScale: f2Margin,
      gstRatePct: f2Gst,
    });
    const liveMrp = mrp?.finalMrp ?? mrp?.baseMrp ?? null;
    setDoc((prev) => {
      const current = prev.f3?.marginElasticity;
      const seeded = seedMarginElasticityFromAi(current, f3SuggestedRange, f2Cogs);
      const base = seeded && typeof seeded === "object" ? seeded : current;
      if (!base || typeof base !== "object") return prev;
      const recast = recastMarginElasticityLive(base, {
        cogsAtScale: f2Cogs,
        mrpInr: liveMrp ?? prev.f2?.mrpInr,
        division: prev.division,
      });
      if (!recast || typeof recast !== "object") return prev;
      if (marginElasticityUnchanged(current, recast) && !isMarginElasticityUnfilled(current)) return prev;
      if (recast.minMrpInr == null && recast.maxMrpInr == null && isMarginElasticityUnfilled(current)) {
        return prev;
      }
      return {
        ...prev,
        f3: { ...(prev.f3 || {}), marginElasticity: { ...recast, aiSourced: true } },
      };
    });
    if (f3SuggestedRange && !isMarginElasticityUnfilled(f3SuggestedRange)) {
      setAiSourced((prev) =>
        prev[sourcedPath("f3", "marginElasticity")] === true
          ? prev
          : { ...prev, [sourcedPath("f3", "marginElasticity")]: true }
      );
    }
  }, [f2Cogs, f2Margin, f2Gst, f3SuggestedRange]);

  const f4SuggestedRisk = aiSuggestions?.f4?.techShiftRisk;
  useEffect(() => {
    if (!f4SuggestedRisk?.dimensions) return;
    setDoc((prev) => {
      if (!isTechShiftRiskUnfilled(prev.f4?.techShiftRisk)) return prev;
      const seeded = normalizeTechShiftRisk(f4SuggestedRisk);
      if (!seeded?.dimensions) return prev;
      return {
        ...prev,
        f4: { ...(prev.f4 || {}), techShiftRisk: { ...seeded, aiSourced: true } },
      };
    });
    setAiSourced((prev) =>
      prev[sourcedPath("f4", "techShiftRisk")] === true
        ? prev
        : { ...prev, [sourcedPath("f4", "techShiftRisk")]: true }
    );
  }, [f4SuggestedRisk]);

  const ideaName = doc.name;
  const ideaCategory = doc.category;
  const ideaText = doc.ideaDescription;
  useEffect(() => {
    if (gstTouchedByHuman.current) return;
    const hasIdea = Boolean(
      String(ideaName || "").trim() || String(ideaCategory || "").trim() || String(ideaText || "").trim()
    );
    if (!hasIdea) return;
    const resolved = resolveGstRate({
      name: ideaName,
      category: ideaCategory,
      ideaDescription: ideaText,
    });
    setDoc((prev) => {
      if (gstTouchedByHuman.current) return prev;
      if (
        Number(prev.f2?.gstRatePct) === Number(resolved.gstRatePct) &&
        String(prev.f2?.gstBasis || "") === resolved.gstBasis
      ) {
        return prev;
      }
      return {
        ...prev,
        f2: { ...(prev.f2 || {}), gstRatePct: resolved.gstRatePct, gstBasis: resolved.gstBasis },
      };
    });
    setAiSourced((prev) => ({
      ...prev,
      [sourcedPath("f2", "gstRatePct")]: true,
      [sourcedPath("f2", "gstBasis")]: true,
    }));
  }, [ideaName, ideaCategory, ideaText]);

  const propositionId = doc.id || initial?.id;
  const hasIdentity = hasSubmitterIdentity(doc);
  const progress = submitProgress(doc);
  const canSubmit = progress.requiredLeft === 0;
  const liveDoc = { ...doc, goNoGo: goNoGo || doc.goNoGo };
  const proofGateReady = isFilterUnlocked("proof-gate", liveDoc);
  const mayUploadProof = canProceedToProofUpload(liveDoc) && proofGateReady;
  const f5Unlocked = isFilterUnlocked("f5", liveDoc);
  const sendManagerReady = isFilterUnlocked("send-manager", liveDoc);
  const unlockHint = nextLockedHint(liveDoc);
  const unlockedFilterKeys = new Set(
    SIX_FILTERS_FORM.map((s) => s.key).filter((k) => isFilterUnlocked(k, liveDoc))
  );
  const f3Unlocked = unlockedFilterKeys.has("f3");
  const f3RangeEmpty = isMarginElasticityUnfilled(doc.f3?.marginElasticity);
  const marginElasticityLoading = Boolean(f3Filling || (saving && f3RangeEmpty && f3Unlocked));

  useEffect(() => {
    if (initial?.researchRunAt || docRef.current?.researchRunAt) return undefined;
    if (!propositionId || !f3Unlocked || saving) return undefined;
    if (f3RangeTouchedByHuman.current) return undefined;
    if (!isMarginElasticityUnfilled(docRef.current?.f3?.marginElasticity)) return undefined;
    if (f3SuggestedRange && !isMarginElasticityUnfilled(f3SuggestedRange)) return undefined;
    if (f3AutoFillRequested.current) return undefined;
    f3AutoFillRequested.current = true;
    const ctrl = new AbortController();
    setF3Filling(true);
    (async () => {
      try {
        const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/auto-fill`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposition: docRef.current, provider: llmProvider }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          f3AutoFillRequested.current = false;
          return;
        }
        if (data.suggestions) {
          applyResearchResult(data, docRef.current);
        }
      } catch (e) {
        if (e?.name !== "AbortError") f3AutoFillRequested.current = false;
      } finally {
        if (!ctrl.signal.aborted) setF3Filling(false);
      }
    })();
    return () => {
      ctrl.abort();
      f3AutoFillRequested.current = false;
      setF3Filling(false);
    };
  }, [propositionId, f3Unlocked, f2Cogs, f2Margin, saving, f3SuggestedRange, llmProvider, initial?.researchRunAt]);

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

  useEffect(() => {
    if (currentView !== "goNoGoResult") return undefined;
    window.scrollTo(0, 0);
    return undefined;
  }, [currentView, goNoGo?.at]);

  function noteEdit() {
    if (justSubmitted) setSummaryStale(true);
  }

  function markEdited(filterKey, fieldKey) {
    const path = sourcedPath(filterKey, fieldKey);
    setAiSourced((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }

  function handleMrpInput(value) {
    mrpTouchedByHuman.current = true;
    noteEdit();
    setAiSourced((prev) => ({ ...prev, [sourcedPath("f2", "mrpInr")]: false }));
    setDoc((prev) => ({
      ...prev,
      f2: { ...(prev.f2 || {}), mrpInr: value },
    }));
  }

  async function handleReassessF4() {
    if (!propositionId || f4Reassessing || saving) return;
    const risk = doc.f4?.techShiftRisk;
    const hasText = Object.values(risk?.dimensions || {}).some((d) =>
      String(d?.userResponse || "").trim()
    );
    if (!hasText) return;
    setF4Reassessing(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/reassess-f4`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: llmProvider,
          techShiftRisk: risk,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not re-assess Filter 4 responses.");
        return;
      }
      if (data.proposition) {
        const next = mergeProposition(data.proposition);
        setDoc(next);
        if (data.advisoryChecks) {
          setAdvisoryChecks(data.advisoryChecks);
          setSummaryChecks(data.advisoryChecks);
        }
        if (next.goNoGo?.classification) setGoNoGo(next.goNoGo);
      }
    } catch (e) {
      setLocalError(e.message || "Could not re-assess Filter 4 responses.");
    } finally {
      setF4Reassessing(false);
    }
  }

  function setTop(key, value) {
    noteEdit();
    markEdited("", key);
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function setFilter(filterKey, fieldKey, value) {
    if (filterKey === "f2" && fieldKey === "mrpInr") {
      handleMrpInput(value);
      return;
    }
    if (filterKey === "f3" && fieldKey === "marginElasticity") {
      const minR = Number(value?.minMrpInr);
      const maxR = Number(value?.maxMrpInr);
      if ((Number.isFinite(minR) && minR > 0) || (Number.isFinite(maxR) && maxR > 0)) {
        f3RangeTouchedByHuman.current = true;
      }
    }
    if (filterKey === "f2" && fieldKey === "gstRatePct") {
      gstTouchedByHuman.current = true;
    }
    if (filterKey === "f4" && fieldKey === "techShiftRisk") {
      setAiSourced((prev) => ({
        ...prev,
        [sourcedPath("f4", "techShiftRisk")]: Boolean(value?.dimensions),
      }));
    }
    noteEdit();
    markEdited(filterKey, fieldKey);
    setDoc((prev) => {
      const nextFilter = { ...(prev[filterKey] || {}), [fieldKey]: value };
      if (filterKey === "f2" && fieldKey === "gstRatePct") {
        nextFilter.gstBasis = "";
      }
      return {
        ...prev,
        [filterKey]: nextFilter,
      };
    });
  }

  function applyResearchResult(data, baseDoc = docRef.current) {
    if (!data?.suggestions) return baseDoc;
    const raw = data.suggestions || {};
    const { doc: nextDoc, sourced } = mergeSuggestionsIntoDoc(baseDoc, raw, {
      overwritePaths: aiSourcedRef.current,
    });
    setDoc(nextDoc);
    if (Object.keys(sourced).length) {
      setAiSourced((prev) => ({ ...prev, ...sourced }));
    }
    setAiSuggestions(raw);
    setAiDismissed({});
    setAiPassMeta({
      notCovered: data.notCovered || [],
      sources: data.sources || [],
    });
    return nextDoc;
  }

  function acceptSuggestion(filterKey, fieldKey, suggestion) {
    const path = sourcedPath(filterKey, fieldKey);
    noteEdit();
    if (filterKey) {
      setDoc((prev) => ({
        ...prev,
        [filterKey]: { ...(prev[filterKey] || {}), [fieldKey]: suggestion },
      }));
    } else {
      setDoc((prev) => ({ ...prev, [fieldKey]: suggestion }));
    }
    setAiSourced((prev) => ({ ...prev, [path]: true }));
    setAiDismissed((prev) => ({ ...prev, [path]: true }));
  }

  function dismissSuggestion(filterKey, fieldKey) {
    const path = filterKey ? `${filterKey}.${fieldKey}` : fieldKey;
    setAiDismissed((prev) => ({ ...prev, [path]: true }));
  }

  function suggestionProps(filterKey, field, currentValue) {
    const suggestion = lookupSuggestion(aiSuggestions, aiDismissed, filterKey, field.key, currentValue);
    const suggestionBasis =
      filterKey === "f3" && field.key === "marginElasticity"
        ? String(aiSuggestions?.f3?.marginElasticity?.basis || "").trim()
        : "";
    return {
      suggestion,
      suggestionBasis,
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

  async function handleRequestManagerReview() {
    if (!propositionId || managerBusy) return;
    setManagerBusy(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/request-manager-review`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not request manager review.");
      if (data.proposition) setDoc(mergeProposition({ ...doc, ...data.proposition }));
      if (data.slackWarning) setLocalError(data.slackWarning);
    } catch (e) {
      setLocalError(e.message || "Could not request manager review.");
    } finally {
      setManagerBusy(false);
    }
  }

  async function handleApproveManagerReview() {
    if (!propositionId || managerBusy || !String(managerComment || "").trim()) return;
    setManagerBusy(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/manager-approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: managerComment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not approve.");
      if (data.proposition) setDoc(mergeProposition({ ...doc, ...data.proposition }));
      setManagerComment("");
    } catch (e) {
      setLocalError(e.message || "Could not approve.");
    } finally {
      setManagerBusy(false);
    }
  }

  async function runGoNoGoRead(propositionDoc = doc, providerOverride) {
    const id = propositionDoc?.id || propositionId;
    if (readingGoNoGo || !id) return null;
    const provider = providerOverride || llmProvider;
    setReadingGoNoGo(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(id)}/go-nogo`, {
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
      if (!nextGo.score && data.advisoryChecks) {
        nextGo.score = scoreAdvisoryChecks(data.advisoryChecks);
      }
      setGoNoGo(nextGo);
      setDoc((prev) => ({ ...prev, goNoGo: nextGo }));
      if (data.advisoryChecks) {
        setAdvisoryChecks(data.advisoryChecks);
        setSummaryChecks(data.advisoryChecks);
      }
      setCurrentView("goNoGoResult");
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
    if (saving || f3Filling || f4Reassessing) return;
    if (!hasSubmitterIdentity(doc)) {
      setLocalError("Enter your name and select your department before Submit.");
      return;
    }
    if (!canSubmit) {
      setLocalError(
        progress.missingFieldLabels.length
          ? `Fill ${progress.missingFieldLabels.join(", ")} before Submit.`
          : "Fill the required fields before Submit."
      );
      return;
    }
    setLocalError("");
    setFailedBanner(null);
    const provider = providerOverride || llmProvider;
    const ideaChanged = Boolean(
      doc.researchRunAt && researchKeyAtRun && researchInputKey(doc) !== researchKeyAtRun
    );
    const hadResearchRunAt = Boolean(doc.researchRunAt);
    if (!goNoGo?.classification) {
      const preview = applyLocalGate(doc);
      setAdvisoryChecks(preview.checks);
      setSummaryChecks(preview.checks);
      setGoNoGo({
        classification: preview.classification,
        rationale: preview.rationale,
        score: preview.score,
        ideaScale: preview.ideaScale,
        ideaName: preview.ideaName,
        category: preview.category,
        at: new Date().toISOString(),
      });
    }
    setJustSubmitted(true);
    setSummaryStale(false);
    const persistDuration = Boolean(
      submitOpts.forceResearch || ideaChanged || !hadResearchRunAt
    );
    const startedAt = Date.now();
    const expectedMs = expectedProcessMs({
      forceResearch: Boolean(submitOpts.forceResearch),
      researchRunAt: doc.researchRunAt,
      ideaChanged,
    });
    onProcessingChange?.({ busy: true, startedAt, expectedMs });
    let savedOk = false;
    try {
    const result = await onSave(doc, provider, {
      forceResearch: Boolean(submitOpts.forceResearch),
    });
    if (!result?.proposition) return;
    savedOk = true;
    const saved = mergeProposition(result.proposition);
    const researchRan = Boolean(result.researchRan) || (!hadResearchRunAt && result.suggestions);
    const filled = researchRan && result.suggestions ? applyResearchResult(result, saved) : saved;
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
    const nextDoc = filled;
    setDoc(nextDoc);
    if (nextDoc.researchRunAt) setResearchKeyAtRun(researchInputKey(nextDoc));
    const checks = result.proposition.advisoryChecks || nextDoc.advisoryChecks || null;
    if (checks) setAdvisoryChecks(checks);
    setSummaryChecks(checks);
    const classification = computeGoNoGo(checks || {});
    const nextScore = scoreAdvisoryChecks(checks || {});
    const ideaName = formIdeaLabel(nextDoc);
    const category = formCategoryLabel(nextDoc);
    const nextGo = {
      classification,
      rationale: buildGateRationale({
        classification,
        score: nextScore,
        checks: checks || {},
        ideaName,
        category,
      }),
      score: nextScore,
      ideaScale: ideaScaleFromDoc(nextDoc),
      ideaName,
      category,
      at: new Date().toISOString(),
    };
    setGoNoGo(nextGo);
    setJustSubmitted(true);
    setSummaryStale(false);

    await runGoNoGoRead({ ...doc, ...result.proposition, ...nextDoc }, provider);
    } finally {
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      onProcessingChange?.({ busy: false });
      if (persistDuration && savedOk && propositionId) {
        setDoc((prev) => ({ ...prev, researchDurationMs: elapsedMs }));
        fetch(`/api/propositions/${encodeURIComponent(propositionId)}/go-nogo`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationOnly: true, researchDurationMs: elapsedMs }),
        }).catch(() => {});
      }
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

  if (currentView === "goNoGoResult" && goNoGo?.classification) {
    return (
      <main className="prop-page output-page" data-view="goNoGoResult">
        <style>{PROP_CSS}</style>
        <GoNoGoResultPage
          key={goNoGo.at || goNoGo.classification}
          result={goNoGo}
          advisoryChecks={summaryChecks || advisoryChecks || {}}
          category={formCategoryLabel(doc) || goNoGo.category}
          ideaName={formIdeaLabel(doc) || goNoGo.ideaName}
          doc={doc}
          saving={saving || readingGoNoGo}
          onBack={() => setCurrentView("propositionForm")}
          onSubmit={() => handleSubmit()}
          currentUser={currentUser}
          onRequestReview={handleRequestManagerReview}
          onApproveReview={handleApproveManagerReview}
          managerBusy={managerBusy}
          managerComment={managerComment}
          onManagerComment={setManagerComment}
        />
      </main>
    );
  }

  return (
    <main className="prop-page prop-form-page" data-view="propositionForm">
      <style>{PROP_CSS}</style>

      <div className="prop-form-shell">
      <aside className="prop-sidebar">
        <nav className="prop-side-nav" aria-label="Form sections">
          {sidebarNavItems(liveDoc).map((item) => (
            <a key={item.id} href={`#${item.id}`} className="prop-side-link">
              <span className={`side-dot side-dot-${item.dot}`} aria-hidden="true" />
              <span className="side-label">{item.label}</span>
              <span className="mono side-count">{item.count}</span>
            </a>
          ))}
        </nav>
        <p className="ownership-note">{ownershipBanner(currentUser?.role)}</p>
        <p className="draft-saved mono">
          {Number(doc.version) > 1 || doc.updatedAt
            ? `Draft saved ${formatSavedAt(doc.updatedAt) || ""}`.trim()
            : "Not yet saved for the team"}
        </p>
      </aside>

      <div className="prop-form-main">
      <section className="prop-identity-strip" aria-label="Submitter">
        {PROPOSITION_TOP_FIELDS.filter((f) => f.key === "submitterName" || f.key === "submitterDepartment").map(
          (field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={doc[field.key]}
              onChange={(v) => setTop(field.key, v)}
              currentUser={currentUser}
              aiSourced={false}
            />
          )
        )}
      </section>

      <section id="the-proposition" className="prop-form-hero">
        <h1>Start with the idea</h1>
        <p>Three fields. Research fills the rest, you edit it.</p>
        <input
          placeholder="e.g. Herbal cooling hair oil"
          value={doc.name || ""}
          disabled={Boolean(currentUser && !canWriteField(currentUser.role, "name"))}
          onChange={(e) => setTop("name", e.target.value)}
          aria-label="Proposition name"
        />
        <input
          placeholder="e.g. Hair oils"
          value={doc.category || ""}
          disabled={Boolean(currentUser && !canWriteField(currentUser.role, "category"))}
          onChange={(e) => setTop("category", e.target.value)}
          aria-label="Category"
        />
        <textarea
          placeholder="Describe the product idea."
          value={doc.ideaDescription || ""}
          disabled={Boolean(currentUser && !canWriteField(currentUser.role, "ideaDescription"))}
          onChange={(e) => setTop("ideaDescription", e.target.value)}
          aria-label="Idea / insight description"
          rows={4}
        />
        <AiPassResultBanner meta={aiPassMeta} />
      </section>

      {SIX_FILTERS_FORM.map((spec) => {
        const unlocked = unlockedFilterKeys.has(spec.key);
        if (!unlocked && (spec.key === "f5" || spec.key === "f6")) {
          return (
            <FilterTeaserCard
              key={spec.key}
              spec={spec}
              sub={
                spec.key === "f5"
                  ? "Opens once the idea reads GO and proof is uploaded."
                  : "Opens together with Filter 5 after proof is uploaded."
              }
            />
          );
        }
        if (!unlocked && (spec.key === "f3" || spec.key === "f4")) {
          return (
            <FilterTeaserCard
              key={spec.key}
              spec={spec}
              sub={spec.key === "f3" ? "Enter COGS and net margin to unlock Filter 3." : "Complete Filter 3 to unlock Filter 4."}
            />
          );
        }
        const values = doc[spec.key] || {};
        const check = advisoryChecks?.[spec.key] || { checkLabel: "Evidence missing", items: [] };
        const f3CheckPending = spec.key === "f3" && marginElasticityLoading;
        const checkLabel = f3CheckPending ? "Calculating…" : check.checkLabel;
        const filterScore = filterCheckScore(check);
        const visibleItems = f3CheckPending ? [] : analysisCheckItems(check.items);
        const f5Sizing = spec.key === "f5"
          ? (check.items || []).find((it) => /Year-3 revenue|Sizing incomplete/i.test(it.text))
          : null;
        return (
          <section
            key={spec.key}
            id={spec.key}
            className={`prop-filter${spec.key === "f5" || spec.key === "f6" ? " f5f6-card" : ""}`}
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
                {filterScore.total ? (
                  <span className="filter-score">
                    {spec.key === "f3" || spec.key === "f4"
                      ? `${filterScore.done}/${filterScore.total}`
                      : `${filterScore.done}/${filterScore.total} · ${filterScore.pct}%`}
                  </span>
                ) : null}
                <span className="check-pill" data-tone={toneFor(checkLabel)}>Check: {checkLabel}</span>
              </div>
            </div>
            <InlineFloorFail check={check} />

            <div className="prop-grid">
              {spec.fields.map((field) =>
                field.type === "computed" ? (
                  <div key={field.key} className="prop-field span-2">
                    <div className="prop-label">
                      {field.label}
                      {["householdsReachedY3Mn", "trialRatePct", "repeatConversionPct", "purchaseFrequencyYr", "avgPackValueInr"].some(
                        (k) => aiSourced[sourcedPath("f5", k)]
                      ) ? (
                        <AiWandMark />
                      ) : null}
                    </div>
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
                    aiSourced={Boolean(aiSourced[sourcedPath(spec.key, field.key)])}
                    inactive={
                      spec.key === "f1" && field.key === "declaredGap" && !isNamedBenchmark(values.benchmark)
                    }
                    inactiveHint="Name a real benchmark (brand · variant · pack) to declare a gap."
                    cogsAtScale={spec.key === "f3" ? doc.f2?.cogsAtScale : undefined}
                    taxNotes={
                      spec.key === "f2" && field.key === "mrpInr" ? (
                        <>
                          <p className="derived-note">
                            MRP before tax: {formatRupeeInr(mrpBaseInr, { digits: 2 })}
                          </p>
                          <p className="derived-note">
                            MRP after tax:{" "}
                            {mrpFinalInr != null ? formatRupeeInr(mrpFinalInr, { digits: 2 }) : "— (set a GST rate)"}
                          </p>
                        </>
                      ) : null
                    }
                    loading={
                      spec.key === "f3" && field.key === "marginElasticity" && marginElasticityLoading
                    }
                    onReassess={spec.key === "f4" && field.key === "techShiftRisk" ? handleReassessF4 : undefined}
                    reassessing={spec.key === "f4" && field.key === "techShiftRisk" ? f4Reassessing : false}
                    liveNote=""
                    breakdownNote={
                      spec.key === "f2" && field.key === "gstRatePct"
                        ? String(values.gstBasis || "").trim()
                        : ""
                    }
                    {...suggestionProps(spec.key, field, values[field.key])}
                  />
                )
              )}
            </div>

            {(justSubmitted || goNoGo) && spec.key !== "f4" && visibleItems.length ? (
              <ul className="filter-check-list">
                {visibleItems.map((it, i) => (
                  <li key={`${spec.key}-${i}`} data-status={it.status}>
                    {spec.key === "f3" ? withoutPercentSign(it.text) : it.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {check.infoLine ? <p className="unlock-hint">{check.infoLine}</p> : null}

            {spec.crossCheckNote ? (
              <div className="prop-cross">
                {spec.crossCheckNote}
              </div>
            ) : null}
            {spec.key === "f6" ? (
              <>
                <FieldControl
                  field={FORUM_VERDICT_FIELD}
                  value={values.forumVerdict}
                  onChange={(v) => setFilter("f6", "forumVerdict", v)}
                  currentUser={currentUser}
                />
                <FieldControl
                  field={VERDICT_NOTE_FIELD}
                  value={values.verdictNote}
                  onChange={(v) => setFilter("f6", "verdictNote", v)}
                  currentUser={currentUser}
                />
              </>
            ) : null}
          </section>
        );
      })}

      {unlockHint && !f5Unlocked && !justSubmitted ? <p className="unlock-hint">{unlockHint}</p> : null}

      {canRequestManagerReview(liveDoc) || hasManagerApproval(liveDoc) ? (
        <ManagerReviewPanel
          classification={liveDoc.goNoGo?.classification}
          scorePct={liveDoc.goNoGo?.score?.pct}
          review={doc.managerReview}
          currentUser={currentUser}
          onRequest={handleRequestManagerReview}
          onApprove={handleApproveManagerReview}
          busy={managerBusy}
          comment={managerComment}
          onComment={setManagerComment}
        />
      ) : null}

      {mayUploadProof ? (
        <ProofUploadPanel
          proof={doc.marketResearchProof}
          onPick={handleProofFile}
          onClear={clearProof}
          fileRef={proofRef}
          error={proofError}
          disabled={saving || readingGoNoGo}
        />
      ) : null}

      {(error || localError || fallbackUi) ? (
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
              {fallbackUi.failedLabel} could not complete research. Re-running research — this may
              return a different result than before. Pick another configured model and retry — your
              idea and form entries stay as they are.
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
      </section>
      ) : null}
      </div>
      </div>

      <div className="submit-bar">
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.pct}%` }} /></div>
        <span><b>{progress.requiredLeft}</b> required fields left before you can submit</span>
        <span className="mono field-list">{progress.missingFieldLabels.join(" · ")}</span>
        <span className="save-state">
          v{doc.version || 1} · {Number(doc.version) > 1 || doc.updatedAt ? "saved for the team" : "not yet saved for the team"}
        </span>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={saving || readingGoNoGo || !canSubmit || marginElasticityLoading}
          title={
            !hasIdentity
              ? "Enter your name and department before Submit"
              : !canSubmit
              ? progress.missingFieldLabels.join(", ")
              : marginElasticityLoading
                ? "Wait for the safe MRP range — submitting again will not speed this up"
                : undefined
          }
        >
          {saving || readingGoNoGo || marginElasticityLoading ? <Loader2 size={15} className="spin" /> : null}
          {savedFlash
            ? "Submitted"
            : readingGoNoGo
              ? "Analysing…"
              : saving
                ? "Submitting…"
                : marginElasticityLoading
                  ? "Calculating MRP range…"
                  : "Submit for verdict"}
        </button>
        {sendManagerReady ? (
          <button type="button" className="ghost send-mgr" onClick={openSendToManagerModal}>
            <Send size={15} /> Send to Manager
          </button>
        ) : null}
      </div>

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
.prop-form-page{
  --bg:#120818; --header-bg:#0d0512; --header-border:#2a1836;
  --sidebar-hover:#1d1029; --sidebar-active:#241333;
  --card-bg:#1a0f25; --card-border:#2c1a3c;
  --f5f6-card-bg:#170d20; --f5f6-card-border:#26162f;
  --input-bg:#160c1f; --input-border:#38234c;
  --ink:#efe8f5; --ink-secondary:#a795bb; --ink-secondary-2:#9a89ae;
  --ink-muted:#8a76a3; --ink-muted-2:#7e6b95; --ink-muted-3:#6d5c80;
  --accent:#8b5cf6; --accent-light:#c4b5fd; --accent-lighter:#ddd6fe;
  --f1-dot:#a78bfa; --f2-dot:#34d399; --f3-dot:#d9a520; --f4-dot:#60a5fa;
  --required-dot:#f472b6;
  --floor-fail-bg:#2a1220; --floor-fail-border:#7f2547; --floor-fail-text:#fda4c0; --floor-fail-body:#e8c9d7;
  font-family:'Sora',system-ui,sans-serif;
  background:var(--bg); color:var(--ink);
  max-width:none; margin:0; padding:20px 24px 120px;
}
.prop-form-page .mono{font-family:'IBM Plex Mono',monospace;}
.prop-form-shell{display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px;align-items:start;}
.prop-sidebar{position:sticky;top:16px;align-self:start;display:flex;flex-direction:column;gap:14px;padding:8px 0;}
.prop-side-nav{display:flex;flex-direction:column;gap:2px;}
.prop-side-link{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;color:var(--ink-secondary);text-decoration:none;font-size:13px;}
.prop-side-link:hover{background:var(--sidebar-hover);color:var(--ink);}
.prop-side-link:active,.prop-side-link:focus{background:var(--sidebar-active);}
.side-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.side-dot-required{background:var(--required-dot);}
.side-dot-f1{background:var(--f1-dot);}
.side-dot-f2{background:var(--f2-dot);}
.side-dot-f3{background:var(--f3-dot);}
.side-dot-f4{background:var(--f4-dot);}
.side-dot-f5,.side-dot-f6{background:var(--accent);}
.side-label{flex:1;}
.side-count{font-size:11px;color:var(--ink-muted);}
.ownership-note{margin:8px 0 0;font-size:12px;line-height:1.45;color:var(--ink-muted);}
.draft-saved{margin:0;font-size:11px;color:var(--ink-muted-3);}
.prop-form-main{min-width:0;display:flex;flex-direction:column;gap:16px;}
.prop-identity-strip{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:14px 16px;}
.prop-form-hero{background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;padding:22px 22px 18px;display:flex;flex-direction:column;gap:12px;}
.prop-form-hero h1{margin:0;font-size:28px;letter-spacing:-.4px;font-weight:700;}
.prop-form-hero > p{margin:0 0 4px;color:var(--ink-secondary);font-size:14.5px;}
.prop-form-page input,.prop-form-page select,.prop-form-page textarea{
  width:100%;background:var(--input-bg);border:1px solid var(--input-border);border-radius:12px;
  color:var(--ink);font-family:inherit;font-size:14.5px;padding:11px 13px;outline:none;}
.prop-form-page textarea{min-height:84px;resize:vertical;}
.inline-floor-fail{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:var(--floor-fail-bg);border:1px solid var(--floor-fail-border);}
.inline-floor-fail .fail-title{font-weight:700;color:var(--floor-fail-text);margin:0 0 6px;font-size:13.5px;}
.inline-floor-fail p{margin:0;color:var(--floor-fail-body);font-size:13px;line-height:1.45;}
.teaser-card{display:flex;align-items:center;gap:14px;background:var(--f5f6-card-bg);border:1px dashed var(--f5f6-card-border);border-radius:16px;padding:16px 18px;}
.teaser-badge{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--accent-light);background:rgba(139,92,246,.16);border-radius:8px;padding:8px 10px;}
.teaser-title{font-weight:600;font-size:15px;}
.teaser-sub{font-size:12.5px;color:var(--ink-muted);margin-top:2px;}
.prop-form-page .prop-filter{background:var(--card-bg);border:1px solid var(--card-border);}
.prop-form-page .f5f6-card{background:var(--f5f6-card-bg);border-color:var(--f5f6-card-border);}
.manager-review-panel{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;}
.manager-review-panel p{margin:0;font-size:13.5px;line-height:1.45;color:var(--ink-secondary);}
.manager-review-form{display:flex;flex-direction:column;gap:8px;}
.manager-comment{margin:0;padding:10px 12px;border-left:3px solid var(--accent);color:var(--ink);font-size:13.5px;}
.submit-bar{
  position:fixed;bottom:0;left:0;right:0;z-index:40;
  display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;
  background:var(--header-bg);border-top:1px solid var(--header-border);
  padding:12px 24px 14px;color:var(--ink);font-family:'Sora',system-ui,sans-serif;
}
.submit-bar .progress-track{flex:1 1 160px;height:6px;border-radius:999px;background:#2a1836;overflow:hidden;min-width:120px;}
.submit-bar .progress-fill{height:100%;background:var(--accent);border-radius:999px;}
.submit-bar .field-list{font-size:11px;color:var(--ink-muted);flex:1 1 180px;}
.submit-bar .save-state{font-size:12px;color:var(--ink-muted-2);}
.submit-bar button{
  display:inline-flex;align-items:center;gap:8px;margin-left:auto;
  background:var(--accent);color:#efe8f5;border:none;border-radius:999px;
  padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;}
.submit-bar button:disabled{opacity:.55;cursor:not-allowed;}
.prop-page{max-width:1080px;margin:0 auto;padding:0 28px 72px;color:#F3EAF8;}
.prop-page.prop-form-page{max-width:none;margin:0;padding:20px 24px 120px;color:var(--ink);}
.prop-top{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:0 0 22px;box-shadow:0 12px 32px rgba(8,4,16,.35);}
.prop-version{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.55);margin:0 0 14px;}
.prop-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}
.prop-idea-block{display:flex;flex-direction:column;gap:10px;}
.prop-field{display:flex;flex-direction:column;gap:6px;margin:0;}
.prop-field-inner{display:flex;flex-direction:column;gap:6px;}
.prop-field.span-2,.prop-check.span-2,.span-2{grid-column:1 / -1;}
.prop-label{font-family:var(--fm);font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.82);display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
.ai-sourced-tag{display:inline-block;margin-top:4px;font-family:var(--fm);font-size:10.5px;letter-spacing:.04em;
  color:#C9A0E8;background:rgba(201,160,232,.12);border:1px solid rgba(201,160,232,.28);
  border-radius:999px;padding:3px 8px;width:fit-content;}
.price-gap-note{margin:6px 0 0;font-size:12px;line-height:1.4;color:#E8B563;}
.derived-note{margin:4px 0 0;font-size:12px;line-height:1.45;color:rgba(243,234,248,.72);}
.derived-note.error{color:#E8B563;}
.mrp-range-display,.margin-elasticity-display{display:flex;align-items:baseline;gap:8px;font-family:var(--fm);font-size:28px;font-weight:700;letter-spacing:-.4px;color:#F3EAF8;margin:4px 0 2px;}
.me-sep{color:rgba(243,234,248,.45);font-weight:500;}
.ai-sourced-mark{color:#C9A0E8;margin-left:4px;align-self:center;}
.me-overrides{display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;}
.me-overrides label{display:flex;flex-direction:column;gap:4px;font-family:var(--fm);font-size:10.5px;letter-spacing:.04em;color:rgba(243,234,248,.6);flex:1;min-width:120px;}
.me-overrides input,.me-overrides select{width:100%;}
.me-loading{display:flex;align-items:flex-start;gap:10px;margin:8px 0 4px;padding:10px 12px;
  border:1px solid rgba(201,160,232,.28);border-radius:10px;background:rgba(201,160,232,.08);
  font-size:13px;line-height:1.45;color:rgba(243,234,248,.88);}
.me-loading .spin{flex-shrink:0;margin-top:2px;}
.spin{animation:sp 1s linear infinite;}
@keyframes sp{to{transform:rotate(360deg);}}
.f4-eval-points{list-style:none;margin:4px 0 10px;padding:0;display:flex;flex-wrap:wrap;gap:6px;}
.f4-eval-points li{font-family:var(--fm);font-size:11px;letter-spacing:.02em;color:rgba(243,234,248,.78);
  border:1px solid rgba(243,234,248,.16);border-radius:999px;padding:5px 10px;}
.f4-unscored-state{display:flex;flex-direction:column;gap:10px;margin:4px 0 2px;}
.dimension-pills-inert{display:flex;flex-wrap:wrap;gap:6px;}
.pill-inert{font-family:var(--fm);font-size:11px;letter-spacing:.02em;color:rgba(243,234,248,.38);
  border:1px dashed rgba(243,234,248,.22);border-radius:999px;padding:5px 10px;}
.f4-cta{margin:0;font-size:13px;line-height:1.5;color:var(--ink-secondary);}
.f4-response-list{display:flex;flex-direction:column;gap:12px;margin:10px 0 4px;}
.dimension-response{display:flex;flex-direction:column;gap:6px;padding:10px 12px;
  border:1px solid rgba(143,184,232,.22);border-radius:10px;background:rgba(143,184,232,.06);}
.dimension-response-label{font-family:var(--fm);font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.78);}
.dimension-finding{font-size:12.5px;line-height:1.45;color:rgba(243,234,248,.82);}
.dimension-finding.original{color:rgba(243,234,248,.78);}
.dimension-finding.reassessed{color:#C9A0E8;}
.dimension-response textarea{width:100%;min-height:72px;}
.f4-reassess{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;}
.f4-analysis-dims{margin-top:10px;}
.output-page .f4-analysis-dims{margin-top:12px;}
.output-page .f4-analysis-dims li{font-size:13.5px;line-height:1.5;color:var(--ink-muted-85);}
.ai-wand{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;color:#C9A0E8;
  vertical-align:middle;flex-shrink:0;}
.ai-wand svg{display:block;}
.prop-field.is-ai input,.prop-field.is-ai select,.prop-field.is-ai textarea{
  border-color:rgba(201,160,232,.45);}
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
.summary-gate{display:flex;align-items:center;gap:12px;margin:8px 0 10px;font-size:20px;letter-spacing:-.3px;}
.summary-gate strong{font-weight:800;}
.summary-gate span{font-size:13px;color:rgba(243,234,248,.62);}
.summary-gate[data-tone="pass"] strong{color:#7EDCA8;}
.summary-gate[data-tone="fail"] strong{color:#E2716B;}
.summary-lede{margin:0 0 12px;font-size:12.5px;color:var(--muted-2, rgba(243,234,248,.55));line-height:1.45;}
.summary-score{font-family:var(--fm);font-size:12px;color:rgba(243,234,248,.7);min-width:42px;text-align:right;}
.summary-grid{display:flex;flex-direction:column;gap:2px;}
.summary-row{display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px dashed var(--border, rgba(243,234,248,.12));}
.summary-row:first-child{border-top:none;}
.summary-num{font-family:var(--fm);font-size:12px;color:var(--muted-3, rgba(243,234,248,.45));width:24px;}
.summary-title{flex:1;font-weight:600;color:var(--ink, #F3EAF8);}
.improvement-list{margin-top:18px;position:relative;padding:22px 16px 8px;}
.improvement-list ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;}
.improvement-list li{font-size:13px;line-height:1.45;display:flex;gap:10px;align-items:flex-start;}
.imp-filter-tag{flex-shrink:0;font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.06em;
  border-radius:999px;padding:3px 8px;margin-top:1px;}
.ai-suggestion-chip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:2px;
  padding:8px 12px;border-radius:10px;background:rgba(201,174,239,.12);
  border:1px solid rgba(201,174,239,.28);font-size:12px;color:#F3EAF8;line-height:1.4;}
.ai-suggestion-chip strong{font-weight:700;}
.ai-suggestion-basis{font-weight:400;color:rgba(243,234,248,.78);}
.ai-suggestion-chip button{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid rgba(243,234,248,.28);
  background:transparent;color:#F3EAF8;cursor:pointer;font-family:var(--fd);}
.ai-suggestion-chip button:hover{background:rgba(201,174,239,.2);}
.ai-pass-banner{margin:14px 0 0;padding:14px 16px;border-radius:12px;
  background:rgba(201,174,239,.1);border:1px solid rgba(201,174,239,.28);}
.ai-pass-kicker{margin:0 0 8px;font-family:var(--fm);font-size:11px;letter-spacing:.08em;
  text-transform:uppercase;color:#C9A0E8;display:flex;align-items:center;gap:6px;}
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
.output-page{
  --bg:#0d0715;
  --bg-gradient:radial-gradient(1200px 600px at 15% -10%, #241038 0%, #0d0715 60%);
  --header-bg:#100819; --header-border:#2a1a3f;
  --hero-bg:linear-gradient(135deg,#2a1338 0%,#1a0e28 100%); --hero-border:#3d2154;
  --path-panel-bg:#151f2c; --path-panel-border:#2b4157;
  --card-bg:#180f26; --card-border:#2f1e45;
  --ink:#efe8fb; --ink-secondary:#a898c2; --ink-secondary-2:#c4b5da;
  --ink-muted:#8b7aa8; --ink-muted-2:#9c8cb8; --ink-muted-3:#6f5f8a;
  --pass:#7ee0a8; --fail:#ff8a6b; --watch:#f0c14b;
  --nogo-bg:#4d1f1f; --nogo-border:#7d3232; --nogo-text:#ffb4a0;
  --badge-chip-bg:#2c1a44; --badge-chip-text:#c9a6ff;
  --btn-primary:#5a2ea6; --btn-secondary-bg:#1e1330; --btn-secondary-border:#35224d;
  background:var(--bg-gradient), var(--bg);
  color:var(--ink);
  font-family:'Space Grotesk',system-ui,sans-serif;
  min-height:60vh;
  padding:8px 4px 28px;
}
.output-page .mono{font-family:'JetBrains Mono',monospace;}
.prop-page.output-page{color:var(--ink);}
.output-meta{
  display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 16px;
  padding:10px 14px;margin:0 0 16px;
  background:var(--header-bg);border:1px solid var(--header-border);border-radius:12px;
  font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted);
}
.output-hero-row{display:grid;grid-template-columns:1.55fr 1fr;gap:16px;margin:0 0 20px;}
.gonogo-hero{
  display:flex;align-items:flex-start;justify-content:space-between;gap:20px;
  padding:24px 22px;border-radius:18px;margin:0;
  background:var(--hero-bg);border:1px solid var(--hero-border);
}
.gonogo-hero-copy{min-width:0;flex:1;}
.gonogo-idea{margin:0 0 10px;font-size:26px;font-weight:700;letter-spacing:-.4px;line-height:1.2;color:var(--ink);}
.gonogo-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}
.badge-chip{
  background:var(--badge-chip-bg);color:var(--badge-chip-text);
  border-radius:999px;padding:4px 10px;font-size:11px;letter-spacing:.04em;
}
.gonogo-badge-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;}
.gonogo-badge{
  display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;
  padding:6px 12px;border-radius:999px;margin:0;
}
.gonogo-badge.tone-pass{background:rgba(126,224,168,.16);color:var(--pass);}
.gonogo-badge.tone-watch{background:rgba(240,193,75,.16);color:var(--watch);}
.gonogo-badge.tone-fail{background:var(--nogo-bg);color:var(--nogo-text);border:1px solid var(--nogo-border);}
.gonogo-scale-chip{
  background:rgba(126,224,168,.16);color:var(--pass);
  border-radius:999px;padding:6px 12px;font-size:11px;letter-spacing:.04em;font-weight:700;
}
.gonogo-rationale{margin:0;font-size:14.5px;line-height:1.55;color:var(--ink-secondary-2);}
.score-ring{
  width:132px;height:132px;border-radius:50%;flex-shrink:0;
  display:grid;place-items:center;
}
.score-ring-inner{
  width:96px;height:96px;border-radius:50%;background:#140a20;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
}
.score-ring-inner strong{font-size:28px;font-weight:700;color:var(--ink);line-height:1;}
.score-ring-inner span{font-size:10px;color:var(--ink-muted);letter-spacing:.06em;}
.path-panel{
  background:var(--path-panel-bg);border:1px solid var(--path-panel-border);
  border-radius:18px;padding:20px 18px;
}
.panel-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 10px;}
.path-score-line{margin:0 0 14px;display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:22px;font-weight:600;}
.path-arrow{color:var(--ink-muted);}
.path-projected{color:var(--pass);}
.path-if{font-size:12px;font-weight:400;color:var(--ink-muted-2);letter-spacing:0;text-transform:none;font-family:'Space Grotesk',system-ui,sans-serif;}
.path-top-list{margin:0 0 14px;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;}
.path-top-list li{font-size:13px;line-height:1.45;color:var(--ink-secondary-2);display:flex;gap:10px;align-items:flex-start;}
.path-empty{margin:0;font-size:13px;color:var(--ink-muted);}
.path-jump{color:var(--badge-chip-text);text-decoration:none;font-size:11px;letter-spacing:.04em;}
.path-jump:hover{text-decoration:underline;}
.imp-filter-tag{
  flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.06em;
  border-radius:999px;padding:3px 8px;margin-top:1px;
  color:#0d0715;background:var(--watch);
}
.filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 22px;}
.filter-status-card{
  background:var(--card-bg);border:1px solid var(--card-border);border-left-width:4px;
  border-radius:16px;padding:16px 16px 14px;min-height:168px;
  display:flex;flex-direction:column;gap:8px;
}
.filter-status-card[data-tone="pass"]{border-left-color:var(--pass);}
.filter-status-card[data-tone="fail"]{border-left-color:var(--fail);}
.filter-status-card[data-tone="watch"]{border-left-color:var(--watch);}
.filter-status-card[data-tone="idle"]{border-left-style:dashed;border-left-color:var(--ink-muted-3);}
.filter-status-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.filter-status-badge{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--badge-chip-text);}
.filter-status-label{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted);}
.filter-status-card h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-.2px;color:var(--ink);}
.filter-status-card p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-secondary);flex:1;}
.filter-progress{display:flex;align-items:center;gap:10px;margin-top:4px;}
.filter-progress-track{flex:1;height:6px;border-radius:999px;background:#2a1a3f;overflow:hidden;}
.filter-progress-fill{height:100%;background:var(--pass);border-radius:999px;}
.filter-status-card[data-tone="fail"] .filter-progress-fill{background:var(--fail);}
.filter-status-card[data-tone="watch"] .filter-progress-fill{background:var(--watch);}
.filter-progress-n{font-size:11px;color:var(--ink-muted);}
.filter-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;padding-top:10px;border-top:1px solid var(--card-border);}
.filter-compare div{display:flex;flex-direction:column;gap:2px;}
.filter-compare-lbl{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted);}
.filter-compare strong{font-size:16px;color:var(--ink);}
.next-steps{margin:0 0 18px;}
.next-steps-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 12px;}
.next-steps-head h2{margin:0;font-size:18px;font-weight:600;}
.next-steps-head span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);}
.next-step-card{
  display:flex;gap:14px;align-items:flex-start;
  background:var(--card-bg);border:1px solid var(--card-border);
  border-radius:14px;padding:14px 16px;margin:0 0 10px;
}
.point-badge{
  flex-shrink:0;min-width:48px;text-align:center;
  font-family:'JetBrains Mono',monospace;font-weight:700;font-size:14px;
  padding:8px 8px;border-radius:10px;
  background:#2c1a44;color:var(--badge-chip-text);
}
.point-badge[data-tier="high"]{background:rgba(240,193,75,.16);color:var(--watch);}
.next-step-tags{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 6px;}
.next-step-tags span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);}
.next-step-card p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-secondary-2);}
.gonogo-blocked-note{margin:4px 0 16px;font-size:13px;line-height:1.45;color:var(--ink-muted);}
.output-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.output-btn-primary,.output-btn-secondary{
  display:inline-flex;align-items:center;gap:8px;border-radius:999px;
  padding:11px 18px;font-size:14px;font-family:inherit;cursor:pointer;
}
.output-btn-primary{background:var(--btn-primary);color:#efe8fb;border:0;font-weight:600;}
.output-btn-primary:disabled{opacity:.6;cursor:not-allowed;}
.output-btn-secondary{background:var(--btn-secondary-bg);color:var(--ink);border:1px solid var(--btn-secondary-border);}
@media (max-width:900px){
  .output-hero-row,.filter-grid{grid-template-columns:1fr;}
}
.proof-panel{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px;margin:0 0 16px;}
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
.filter-score{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.7);}
.filter-check-list{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}
.filter-check-list li{font-size:12.5px;line-height:1.4;color:rgba(243,234,248,.78);padding-left:16px;position:relative;}
.filter-check-list li::before{content:"";position:absolute;left:0;top:6px;width:7px;height:7px;border-radius:50%;background:rgba(232,181,99,.75);}
.filter-check-list li[data-status="done"]::before{background:#7EDCA8;}
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
  .prop-form-shell{grid-template-columns:1fr;}
  .prop-sidebar{position:static;}
  .prop-identity-strip{grid-template-columns:1fr;}
  .prop-page.prop-form-page{padding:16px 16px 140px;}
  .submit-bar{padding:10px 16px 12px;}
}
`;
