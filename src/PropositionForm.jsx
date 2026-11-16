import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Copy, Check, Download, FileText, FileUp, Info, Loader2, RefreshCw, Wand2, X } from "lucide-react";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import { exportElementToPdf, outputPdfFilename } from "../lib/exportOutputPdf.js";
import {
  FORUM_VERDICT_FIELD,
  PROPOSITION_TOP_FIELDS,
  SIX_FILTERS_FORM,
  VERDICT_NOTE_FIELD,
  hasSubmitterIdentity,
  mergeProposition,
  SUBMITTER_DEPARTMENTS,
  isCanonicalTeam,
} from "../lib/propositionFields.js";
import { managerReviewRequestedOn } from "../lib/logStatus.js";
import { patchIgnoredKeys } from "../lib/ignoredKeyRefresh.js";
import {
  canProceedToProofUpload,
  hasManagerApproval,
  isFilterUnlocked,
  listMissingFormInputs,
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
  goNoGoIsFloorFailure,
  goNoGoTone,
  scoreAdvisoryChecks,
  analysisCheckItems,
  previewAdvisoryChecks,
} from "../lib/goNoGo.js";
import { isScoredProposition, shouldForkLogResubmit } from "../lib/analysisStability.js";
import { storedVerdictWithoutInputs } from "../lib/storedVerdict.js";
import { scoreExplainerSections } from "../lib/scoreExplainer.js";
import { hasAnyRealInput } from "../lib/filterChecks.js";
import { checkNeedsResearchRetry, retryStepCostPreview } from "../lib/retryStep.js";
import { missingStepsCostPreview, planResearch } from "../lib/researchProgress.js";
import { inputCoverage } from "../lib/inputCoverage.js";
import { isGoScore, INVALID_INPUTS_BLOCK_SUBMIT } from "../lib/lockedConstants.js";
import { reviewInputs, titleCaseName } from "../lib/inputReview.js";
import {
  buildPathToGo,
  resolveOutputScore,
  computeImprovementPointValues,
  countFiltersWithEvidence,
  f2ActualVsFloor,
  f3ActualVsCeiling,
  formatOutputDate,
  formatScreenedDuration,
  scoreArcColor,
} from "../lib/improvementPoints.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc, ideaSizeForResult } from "../lib/ideaScale.js";
import { rewriteUnmatchedDivisionCopy } from "../lib/sanitizeAiText.js";
import { fallbackFilterNarrative, stripFormAdminNarrative } from "../lib/filterNarrativeText.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import IdeaImportPanel, { IDEA_IMPORT_CSS } from "./IdeaImportPanel.jsx";
import { FIELD_ROLE_CSS, FieldRoleBadge } from "./FieldRoleBadge.jsx";
import {
  ROLE_LABEL,
  annotatePathActions,
  effectiveRole,
  getFieldRole,
  isPathFilled,
  roleLabel,
} from "../lib/fieldRoles.js";
import { submitBarMessageTwoLabels } from "../lib/fieldRoleDisplay.js";
import { applyDerivedMrpToF2, computeMrp, deriveMrp, formatRupeeInr, hydrateMarginElasticityMrp, isMarginElasticityUnfilled, marginElasticityUnchanged, marginPctFromMrp, recastMarginElasticityLive, resolveF2Price, seedMarginElasticityFromAi, withoutPercentSign } from "../lib/mrpFormula.js";
import { DIVISION_MIN_NET_MARGIN_PCT, F3_HORIZON_YEARS, VOLUME_LOSS_CEILING_PCT } from "../lib/lockedConstants.js";
import { expectedProcessMs } from "../lib/processTimer.js";
import {
  DIVISION_MINIMUM_SOURCE,
  NET_MARGIN_STATUS_PATH,
  applyDivisionMinimumMargin,
  divisionMinimumStatusEntry,
} from "../lib/netMarginDefault.js";
import { priceCrossings } from "../lib/priceResilience.js";
import {
  DIMENSION_LABELS,
  TECH_SHIFT_DIMENSIONS,
  blankTechShiftRisk,
  effectiveOverallRisk,
  isTechShiftRiskUnfilled,
  normalizeRiskLevel,
  normalizeTechShiftRisk,
  aggregateTechShiftRisk,
  aggregateTechShiftRiskWithResponses,
  hasReassessedDimension,
  normalizeF4UserInputs,
  patchF4UserInput,
  userInputFor,
} from "../lib/techShiftRisk.js";
import { f4WebCheckRelation } from "../lib/f4Assessment.js";
import { plainDraftSaveError } from "../lib/clientSavePayload.js";
import { FMCG_CATEGORIES } from "../lib/fmcgCategories.js";
import { formatMinimumMarginHint, marginBelowFloorWarning } from "../lib/divisionMargin.js";
import { advisoryChecksFromOutput } from "../lib/sealOutput.js";
import { evaluationStatus as computeEvaluationStatus } from "../lib/evaluationStatus.js";

const LAST_TEAM_KEY = "primus.lastIdeaTeam";
/** Part 140 B (D64) — a failed draft save retries on its own every 10 s, up to 3 times. */
const DRAFT_AUTO_RETRY_MS = 10000;
const DRAFT_AUTO_RETRY_MAX = 3;

function rememberedIdeaTeam(accountTeam) {
  try {
    const last = String(localStorage.getItem(LAST_TEAM_KEY) || "").trim();
    if (last) return last;
  } catch {
    /* ignore */
  }
  return String(accountTeam || "").trim();
}

function formatRiskLevel(level) {
  const s = String(level ?? "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function filterSubtitle(spec, division) {
  if (spec.key === "f2") {
    return division
      ? `Locked minimum for ${division} — you may raise net margin; Filter 3 tests this MRP on the 10% volume-loss cliff rule. International Business uses INR at group level via the respective division.`
      : "Pending: division not determined — Filter 2 stays unfinished until ADMIN assigns a locked division";
  }
  if (spec.key === "f5") {
    return division
      ? `credible year-3 path for ${division}`
      : "division not yet determined — no revenue target until matched";
  }
  return spec.subtitle || "";
}

/** Part 143 D86 — static helpers are gone; GST HSN line is focus-only via field.gstFocusHint. */
function fieldHelper(_field) {
  return "";
}

/** Paths / field flags the AI first pass may auto-populate (person can still type over). */
const AI_FILLS_KEYS = new Set([
  "category",
  "declaredAttribute",
  "benchmark",
  "declaredGap",
  "gapDerivation",
  "parityExceptions",
  "growthRoute",
  "growthArgument",
  "cogsAtScale",
  "netMarginAtScale",
  "mrpInr",
  "qcomTrajectory",
  "techShiftRisk",
  "householdsReachedY3Mn",
  "trialRatePct",
  "repeatConversionPct",
  "purchaseFrequencyYr",
  "avgPackValueInr",
]);

function fieldAiFills(field) {
  if (!field) return false;
  if (field.aiFills === true || field.aiConfirmable === true) return true;
  if (field.type === "computed-risk" || field.type === "derived-mrp") return true;
  return AI_FILLS_KEYS.has(field.key);
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
  "evidenceSourceFile",
  // Part 138 D52 — GST and pack size are typed by a person; the AI never pre-fills them.
  "gstRatePct",
  "gstBasis",
  "grammage",
]);

function sourcedPath(filterKey, fieldKey) {
  return filterKey ? `${filterKey}.${fieldKey}` : fieldKey;
}

function isBlankValue(value) {
  return value == null || String(value).trim() === "";
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

function lookupSuggestion(suggestions, dismissed, filterKey, fieldKey, _currentValue) {
  if (SUGGEST_BLOCKLIST.has(fieldKey)) return null;
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

function autofillStatusFor(doc, fieldPath) {
  const root =
    (doc?.autofillStatus && typeof doc.autofillStatus === "object" && doc.autofillStatus) ||
    (doc?.researchFindings?.autofillStatus &&
      typeof doc.researchFindings.autofillStatus === "object" &&
      doc.researchFindings.autofillStatus) ||
    null;
  if (!root || !fieldPath) return null;
  return root[fieldPath] || root[fieldPath.replace(/^\./, "")] || null;
}

function mrpMissingReason(doc) {
  const f2 = doc?.f2 || {};
  const missing = [];
  if (f2.cogsAtScale == null || String(f2.cogsAtScale).trim() === "") missing.push("COGS");
  if (f2.netMarginAtScale == null || String(f2.netMarginAtScale).trim() === "") missing.push("margin");
  if (f2.gstRatePct == null || String(f2.gstRatePct).trim() === "") missing.push("GST");
  if (!missing.length) return "";
  return `Needs ${missing.join(", ")} to compute MRP`;
}

function AutofillProvenance({ fieldPath, doc, aiSourced, editedName, onRestore, canRestore, onConfirmAi }) {
  const entry = autofillStatusFor(doc, fieldPath);
  // Do not show "Edited by …" under fields — manual override is silent.
  if (editedName) {
    if (canRestore && typeof onRestore === "function") {
      return (
        <div className="autofill-status" data-tone="edited">
          <button type="button" className="ghost-link" onClick={onRestore}>
            Restore AI value
          </button>
        </div>
      );
    }
    return null;
  }
  if (entry && (entry.reason || entry.status === "skipped" || entry.status === "unavailable")) {
    const reason = String(entry.reason || entry.message || "The AI had no figure, enter it manually.").trim();
    return (
      <div className="autofill-status" data-tone="na">
        Not available — {reason}
      </div>
    );
  }
  if (fieldPath === "f2.mrpInr") {
    const marginEmpty =
      doc?.f2?.netMarginAtScale == null || String(doc.f2.netMarginAtScale).trim() === "";
    if (marginEmpty) {
      return (
        <div className="autofill-status" data-tone="na">
          Enter the net margin to compute MRP
        </div>
      );
    }
    const mrpReason = mrpMissingReason(doc);
    if (mrpReason && !aiSourced && !(entry?.status === "filled")) {
      return (
        <div className="autofill-status" data-tone="na">
          Not available — {mrpReason}
        </div>
      );
    }
  }
  // Part 133 D21 — AI-written F1 text needs edit or one-click confirm.
  if (entry?.aiSuggested != null && entry?.confirmed !== true && typeof onConfirmAi === "function") {
    return (
      <div className="autofill-status" data-tone="ai">
        Written by AI: edit or confirm{" "}
        <button type="button" className="ghost-link" onClick={onConfirmAi}>
          Confirm
        </button>
      </div>
    );
  }
  if (aiSourced || entry?.status === "filled") {
    return (
      <div className="autofill-status" data-tone="ai">
        {ROLE_LABEL["filled-by-ai"]}
      </div>
    );
  }
  return null;
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

/** Part 132 — deterministic input-review hint under a field (never auto-changes). */
function InputReviewHint({ issue, onUseSuggestion, onKeepTyped }) {
  if (!issue) return null;
  const tone = issue.status === "invalid" ? "invalid" : "fix";
  return (
    <div className={`input-review-hint is-${tone}`} role="status">
      <span>{issue.message}</span>
      {issue.suggestion ? (
        <span className="input-review-actions">
          <button type="button" onClick={() => onUseSuggestion?.(issue.suggestion)}>
            Use suggestion
          </button>
          <button type="button" onClick={() => onKeepTyped?.()}>
            Keep as typed
          </button>
        </span>
      ) : null}
    </div>
  );
}

function FieldRefreshControl({ onRefresh, refreshing, locked }) {
  if (typeof onRefresh !== "function") return null;
  return (
    <button
      type="button"
      className="field-refresh"
      disabled={locked || refreshing}
      onClick={onRefresh}
      title="Deliberate re-run that bypasses cache — the result may differ from the last estimate."
    >
      {refreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
      {refreshing ? "Re-running…" : "Re-run this estimate"}
    </button>
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
                  : /\.xlsx$/i.test(file.name)
                    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    : /\.xlsm$/i.test(file.name)
                      ? "application/vnd.ms-excel.sheet.macroenabled.12"
                      : /\.xls$/i.test(file.name)
                        ? "application/vnd.ms-excel"
                        : /\.csv$/i.test(file.name)
                          ? "text/csv"
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
  onVerifyDimension,
  verifyingDimension = "",
  mitigationResponses = null,
  onMitigationChange,
  onUserInputChange,
  rangeOverride = null,
  onRangeOverride,
  fieldPath = "",
  fileValue = null,
  onPickFile,
  onClearFile,
  fileError = "",
  fileBusy = false,
  onRefresh,
  refreshing = false,
  ideaDoc = null,
  editedName = "",
  onRestoreAi,
  canRestoreAi = false,
  onConfirmAi,
  onMrpOverrideChange,
}) {
  const fileRef = useRef(null);
  const [gstFocused, setGstFocused] = useState(false);
  if (field.type === "mitigation-map" || field.type === "range-override") return null;
  // Part 143 D86 — no owner/helper lines at rest; inactive lock stays as title only.
  const helper = "";
  const gstFocusHint = fieldPath === "f2.gstRatePct" ? String(field.gstFocusHint || "").trim() : "";
  const full =
    field.type === "textarea" ||
    field.type === "checkbox" ||
    field.type === "computed" ||
    field.type === "computed-range" ||
    field.type === "computed-risk" ||
    field.type === "price-resilience" ||
    field.type === "readonly-note";
  const locked = inactive;
  const lockTitle = inactive ? inactiveHint || "Name a benchmark to declare a gap." : undefined;
  const showChip = suggestion != null;
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
  const aiWillFill = fieldAiFills(field);
  const aiFillMark = aiWillFill ? (
    <span className="ai-fills-badge" data-ai-fills={fieldPath || field.key || "yes"} title="The AI first pass fills this — check it or type over it">
      AI fills this
    </span>
  ) : null;

  if (field.type === "computed-risk") {
    const risk = value && typeof value === "object" ? value : blankTechShiftRisk();
    const baseDims =
      risk.dimensions && typeof risk.dimensions === "object" ? risk.dimensions : blankTechShiftRisk().dimensions;
    const dimensions = { ...blankTechShiftRisk().dimensions, ...baseDims };
    const rated = TECH_SHIFT_DIMENSIONS.filter((k) => normalizeRiskLevel(dimensions[k]?.risk));
    const overall =
      rated.length === TECH_SHIFT_DIMENSIONS.length
        ? hasReassessedDimension(dimensions)
          ? aggregateTechShiftRiskWithResponses(dimensions)
          : aggregateTechShiftRisk(dimensions) || effectiveOverallRisk(risk)
        : "";
    const respondable = TECH_SHIFT_DIMENSIONS.filter((key) => {
      const d = dimensions[key];
      const level = normalizeRiskLevel(d?.reassessedRisk) || normalizeRiskLevel(d?.risk);
      return level === "Medium" || level === "High";
    });
    const hasResponseText = respondable.some((key) => {
      const d = dimensions[key];
      return String((mitigationResponses && mitigationResponses[key]) || d?.userResponse || "").trim();
    });
    // Part 140 C (D63) — the person's rating and view go to f4.userInputs only. techShiftRisk is
    // research output: it is shown below as the Web check and is never edited from this form.
    const storedUserInputs = ideaDoc?.f4?.userInputs;
    const patchUserInput = (key, patch) => {
      const nextInputs = patchF4UserInput(storedUserInputs, key, patch);
      if (typeof onUserInputChange === "function") onUserInputChange(nextInputs, key);
      // Part 138 F (D56) — a hand-entered rating is web-checked; until that check supports it, it earns nothing.
      if (
        Object.prototype.hasOwnProperty.call(patch, "rating") &&
        normalizeRiskLevel(patch.rating) &&
        typeof onVerifyDimension === "function"
      ) {
        onVerifyDimension(key, nextInputs);
      }
    };
    const f4Assessments = ideaDoc?.researchFindings?.f4?.assessments || {};
    const patchDimensionResponse = (key, userResponse) => {
      if (typeof onMitigationChange === "function") onMitigationChange(key, userResponse);
    };
    return (
      <div
        className={`prop-field span-2${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}${aiWillFill ? " is-ai-expected" : ""}`}
        title={lockTitle}
        data-f4-risk="tech-shift"
        data-f4-state={rated.length === TECH_SHIFT_DIMENSIONS.length ? "scored" : "editable"}
      >
        <div className="prop-label" data-field-label={fieldPath || undefined}>
          <span>{field.label}</span>
          {wand}
          {aiFillMark}
          <FieldRefreshControl onRefresh={onRefresh} refreshing={refreshing} locked={locked} />
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </div>
        {overall ? <p className="autofill-status" data-tone="ai">Current overall: {overall}</p> : null}
        <div className="f4-dimension-editor">
          {TECH_SHIFT_DIMENSIONS.map((key) => {
            const d = dimensions[key] || { risk: "", reason: "" };
            const mine = userInputFor(storedUserInputs, key);
            const assessment = f4Assessments[key] || null;
            const aiRating = normalizeRiskLevel(d.risk) || "";
            const checkedRating = normalizeRiskLevel(assessment?.raw?.rating) || "";
            const checkedOk = assessment && assessment.status === "ok" && assessment.searchUsed === true;
            const relation = f4WebCheckRelation(mine.rating, assessment);
            const finding = String(assessment?.raw?.quote || d.reason || "").trim();
            const sourceUrl = String(assessment?.raw?.source_url || "").trim();
            return (
              <div key={key} className="f4-dimension-row" data-dimension={key}>
                <div className="dimension-response-label">{DIMENSION_LABELS[key] || key}</div>
                <div className="f4-dimension-block f4-your-view" data-f4-block="your-view">
                  <div className="f4-block-title">Your rating and view</div>
                  <select
                    data-field={fieldPath || undefined}
                    value={mine.rating}
                    disabled={locked || reassessing}
                    title={lockTitle}
                    aria-label={`Your rating for ${DIMENSION_LABELS[key] || key}`}
                    onChange={(e) => patchUserInput(key, { rating: e.target.value })}
                  >
                    <option value="">Select risk</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                  <textarea
                    data-field={fieldPath || undefined}
                    rows={2}
                    placeholder="Your view: why this rating (optional for Low; required evidence for Medium/High mitigation below)"
                    value={mine.pov}
                    disabled={locked || reassessing}
                    title={lockTitle}
                    aria-label={`Your view on ${DIMENSION_LABELS[key] || key}`}
                    onChange={(e) => patchUserInput(key, { pov: e.target.value })}
                  />
                </div>
                <div className="f4-dimension-block f4-web-check" data-f4-block="web-check">
                  <div className="f4-block-title">Web check</div>
                  {verifyingDimension === key ? (
                    <div className="dimension-finding original">Web-checking your rating…</div>
                  ) : (
                    <>
                      <div className="dimension-finding original" data-f4-web-rating={checkedRating || aiRating || ""}>
                        Web check rating: {checkedOk && checkedRating ? checkedRating : aiRating || "not checked yet"}
                      </div>
                      {finding ? <div className="dimension-finding original">{finding}</div> : null}
                      {sourceUrl ? (
                        <div className="dimension-finding original">
                          Source:{" "}
                          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                            {sourceUrl}
                          </a>
                        </div>
                      ) : null}
                      {assessment && assessment.status === "failed" ? (
                        <div className="dimension-finding original" data-f4-verification="failed">
                          Web check did not complete ({assessment.error || "no answer"}) — earns nothing until it does
                        </div>
                      ) : null}
                      {relation ? (
                        <div className="dimension-finding original" data-f4-verification={relation}>
                          {relation === "supports"
                            ? "Web check supports your rating — it earns its point"
                            : "Web check contradicts your rating — marked down"}
                        </div>
                      ) : mine.rating && !assessment ? (
                        <div className="dimension-finding original" data-f4-verification="unchecked">
                          Not web-checked yet — earns nothing until a web check supports it
                        </div>
                      ) : null}
                      {typeof onVerifyDimension === "function" && mine.rating ? (
                        <button
                          type="button"
                          className="ghost f4-check-again"
                          disabled={locked || reassessing}
                          onClick={() => onVerifyDimension(key, normalizeF4UserInputs(storedUserInputs))}
                        >
                          Check my rating on the web
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
                {d.reassessedRisk ? (
                  <div className="dimension-finding reassessed">
                    After response: {d.reassessedRisk} risk — {d.reassessedReason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {respondable.length ? (
          <div className="f4-response-list">
            <p className="autofill-status">Respond on Medium / High points to clear them</p>
            {respondable.map((key) => {
              const d = dimensions[key];
              return (
                <div key={key} className="dimension-response">
                  <div className="dimension-response-label">{DIMENSION_LABELS[key] || key}</div>
                  <div className="dimension-finding original">
                    Original: {normalizeRiskLevel(d.risk) || d.risk} risk — {d.reason || "no reason yet"}
                  </div>
                  <textarea
                    data-field={fieldPath || undefined}
                    rows={3}
                    placeholder="Respond with specific, verifiable evidence — a signed contract, a lab report, a certification timeline. Vague reassurance won't move the rating."
                    value={(mitigationResponses && mitigationResponses[key]) || d.userResponse || ""}
                    disabled={locked || reassessing}
                    title={lockTitle}
                    onChange={(e) => patchDimensionResponse(key, e.target.value)}
                  />
                </div>
              );
            })}
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
        <AutofillProvenance
          fieldPath={fieldPath}
          doc={ideaDoc}
          aiSourced={aiSourced}
          editedName={editedName}
          onRestore={onRestoreAi}
          canRestore={canRestoreAi}
          onConfirmAi={onConfirmAi}
        />
        {aiSourced && !editedName ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
        {liveNote ? <p className="derived-note">{liveNote}</p> : null}
        {chip}
      </div>
    );
  }

  if (field.type === "derived-mrp") {
    const f2 = ideaDoc?.f2 || {};
    const overrideOn = f2.mrpOverride === true;
    const priced = resolveF2Price(f2);
    const computed = deriveMrp({
      cogsAtScale: f2.cogsAtScale,
      netMarginAtScale: f2.netMarginAtScale,
      gstRatePct: f2.gstRatePct,
    });
    const div = String(ideaDoc?.division || "").trim();
    const floor = Number(DIVISION_MIN_NET_MARGIN_PCT[div]);
    const eff = priced.ok ? priced.effectiveMargin : null;
    const below =
      Number.isFinite(floor) && Number.isFinite(eff) && eff < floor
        ? `Your MRP implies a net margin of ${eff}%, which is below the ${floor}% minimum for ${div}`
        : null;
    return (
      <div className={`prop-field span-2${locked ? " is-locked" : ""}${aiWillFill ? " is-ai-expected" : ""}`} title={lockTitle} data-f2-mrp="derived">
        <div className="prop-label" data-field-label={fieldPath || undefined}>
          <span>{field.label}</span>
          {aiFillMark}
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </div>
        <label className="prop-check" style={{ marginBottom: 8 }} htmlFor="fld-f2-mrpOverride">
          <span className="prop-label" data-field-label="f2.mrpOverride">
            <span>Use my own MRP</span>
            <FieldRoleBadge path="f2.mrpOverride" doc={ideaDoc} />
          </span>
          <input
            id="fld-f2-mrpOverride"
            data-field="f2.mrpOverride"
            type="checkbox"
            checked={overrideOn}
            disabled={locked}
            onChange={(e) => {
              if (typeof onMrpOverrideChange === "function") onMrpOverrideChange(e.target.checked);
            }}
          />
        </label>
        {overrideOn ? (
          <input
            data-field={fieldPath || undefined}
            type="number"
            step="any"
            value={value ?? ""}
            placeholder={field.placeholder || "Enter shelf MRP ₹"}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : priced?.ok || computed?.ok ? (
          <div className="mrp-range-display">
            <strong className="mono">₹{Number((priced.ok ? priced : computed).mrp).toFixed(2)}</strong>
            {(priced.ok ? priced : computed).mrpRounded !== (priced.ok ? priced : computed).mrp ? (
              <span className="derived-note" style={{ marginLeft: 8 }}>
                (rounds to ₹{(priced.ok ? priced : computed).mrpRounded} for reference)
              </span>
            ) : null}
          </div>
        ) : (
          <p className="derived-note">
            {computed?.reason === "NEEDS_COGS" || priced?.reason === "NEEDS_COGS"
              ? "Enter COGS to derive MRP"
              : computed?.reason === "NEEDS_MARGIN"
                ? "Enter net margin to derive MRP"
                : computed?.reason === "NEEDS_GST" || priced?.reason === "NEEDS_GST"
                  ? "Enter GST to derive MRP"
                  : "MRP is calculated from COGS, net margin and GST"}
          </p>
        )}
        {priced?.ok ? (
          <>
            <p className="derived-note">Price before tax ₹{Number(priced.preTaxMrp).toFixed(2)}</p>
            <p className="derived-note">
              GST {priced.gstRatePct}% ₹{Number(priced.gstAmount).toFixed(2)}
            </p>
            <p className="derived-note">MRP after tax ₹{Number(priced.mrp).toFixed(2)} (shelf price)</p>
          </>
        ) : null}
        {overrideOn && below ? <p className="derived-note error">{below}</p> : null}
        {overrideOn ? (
          <button
            type="button"
            className="ghost"
            disabled={locked}
            onClick={() => typeof onMrpOverrideChange === "function" && onMrpOverrideChange(false)}
          >
            Switch back to computed MRP
          </button>
        ) : null}
      </div>
    );
  }

  if (field.type === "price-resilience" || field.type === "readonly-note") {
    const priced = resolveF2Price(ideaDoc?.f2 || {});
    const pe = ideaDoc?.researchFindings?.f3?.priceEvents;
    const typed = value === "" || value == null ? null : Number(value);
    const annual =
      typed != null && Number.isFinite(typed)
        ? typed
        : pe?.annualIncreasePct != null && Number.isFinite(Number(pe.annualIncreasePct))
          ? Number(pe.annualIncreasePct)
          : null;
    const crossed =
      priced.ok && annual != null
        ? priceCrossings({
            launchPrice: priced.mrp,
            annualIncreasePct: annual,
            horizonYears: F3_HORIZON_YEARS,
          })
        : null;
    const inputVal = value === "" || value == null ? "" : String(value);
    return (
      <div
        className={`prop-field span-2${locked ? " is-locked" : ""}`}
        title={lockTitle}
        data-f3-resilience="cliff"
      >
        <div className="prop-label" data-field-label={fieldPath || undefined}>
          <label htmlFor={`fld-${String(fieldPath || field.key).replace(/[^A-Za-z0-9_-]+/g, "-")}`}>
            {field.label}
          </label>
          {wand}
          {aiFillMark}
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </div>
        {priced.ok ? (
          <p className="autofill-status">Price tested: Filter 2 MRP ₹{Number(priced.mrp).toFixed(2)}</p>
        ) : null}
        <input
          id={`fld-${String(fieldPath || field.key).replace(/[^A-Za-z0-9_-]+/g, "-")}`}
          data-field={fieldPath || undefined}
          type="number"
          step="any"
          min="0"
          placeholder={field.placeholder || "Enter yearly price rise % — e.g. 5"}
          value={inputVal}
          disabled={locked}
          title={lockTitle}
          onChange={(e) => onChange(e.target.value)}
        />
        {pe?.annualIncreasePct != null ? (
          <p className="derived-note">
            Research inflation cover {pe.annualIncreasePct}%/yr
            {pe.inflation_source_url ? ` — ${pe.inflation_source_url}` : ""}
            {pe.inflation_quote ? `. “${pe.inflation_quote}”` : ""}
          </p>
        ) : (
          <p className="derived-note">
            Submit still researches a cited inflation-cover rate and comparable cliff volume loss (ceiling{" "}
            {VOLUME_LOSS_CEILING_PCT}%).
          </p>
        )}
        {crossed?.ok ? (
          crossed.crossings?.length ? (
            <div className="f3-cliff-preview">
              <p className="autofill-status">
                At {annual}%/yr over {F3_HORIZON_YEARS} years this MRP would cross:
              </p>
              <ul className="f3-cliff-list">
                {crossed.crossings.map((c) => (
                  <li key={`${c.point}-${c.year}`}>
                    ₹{c.point} in year {c.year}
                    {c.toPrice != null ? ` (price ≈ ₹${Number(c.toPrice).toFixed(2)})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="derived-note">
              At {annual}%/yr over {F3_HORIZON_YEARS} years, no fixed price point is crossed — smooth inflation rises
              cost no volume under the cliff rule.
            </p>
          )
        ) : priced.ok ? (
          <p className="derived-note">Enter an annual % above to preview which cliffs this MRP would hit.</p>
        ) : null}
        {Array.isArray(pe?.events) && pe.events.length ? (
          <ul className="price-events-register">
            {pe.events.slice(0, 8).map((ev, i) => (
              <li key={i}>
                {ev.brand || "Brand"}: ₹{ev.from_price_inr}→₹{ev.to_price_inr}
                {ev.crossed_point != null ? ` (₹${ev.crossed_point})` : ""}
                {ev.volume_change_pct != null ? `, volume ${ev.volume_change_pct}%` : ""}
                {ev.verified ? " · verified" : " · unverified"}
                {ev.source_url ? ` — ${ev.source_url}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {chip}
      </div>
    );
  }

  if (field.type === "computed-range") {
    const range = hydrateMarginElasticityMrp(value && typeof value === "object" ? value : {}, cogsAtScale) || {};
    const shown = { ...range, ...(rangeOverride && typeof rangeOverride === "object" ? rangeOverride : {}) };
    const minMrp = shown.minMrpInr;
    const maxMrp = shown.maxMrpInr;
    const minInput = minMrp != null && Number.isFinite(Number(minMrp)) ? Number(Number(minMrp).toFixed(2)) : "";
    const maxInput = maxMrp != null && Number.isFinite(Number(maxMrp)) ? Number(Number(maxMrp).toFixed(2)) : "";
    const patchMrp = (end, raw) => {
      const nextVal = raw === "" ? null : Number(raw);
      const mrp = Number.isFinite(nextVal) ? nextVal : null;
      const nextOverride = {
        ...(rangeOverride && typeof rangeOverride === "object" ? rangeOverride : {}),
        [end]: mrp,
      };
      if (typeof onRangeOverride === "function") onRangeOverride(nextOverride);
    };
    const basisNote = withoutPercentSign(range.basis);
    return (
      <div className={`prop-field span-2${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}${aiWillFill ? " is-ai-expected" : ""}`} title={lockTitle} data-f3-range="mrp">
        <div className="prop-label" data-field-label={fieldPath || undefined}>
          <span>{field.label}</span>
          {wand}
          {aiFillMark}
          <FieldRefreshControl onRefresh={onRefresh} refreshing={refreshing} locked={locked} />
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </div>
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
              data-field={fieldPath || undefined}
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
              data-field={fieldPath || undefined}
              type="number"
              step="any"
              value={maxInput}
              disabled={locked || loading}
              title={loading ? "Wait for the AI range before editing, or enter values after it finishes" : lockTitle}
              onChange={(e) => patchMrp("maxMrpInr", e.target.value)}
            />
          </label>
        </div>
        <AutofillProvenance
          fieldPath={fieldPath}
          doc={ideaDoc}
          aiSourced={aiSourced}
          editedName={editedName}
          onRestore={onRestoreAi}
          canRestore={canRestoreAi}
          onConfirmAi={onConfirmAi}
        />
        {aiSourced && !editedName && !loading ? <span className="ai-sourced-tag">AI estimate — review</span> : null}
        {!loading && liveNote ? <p className="derived-note">{liveNote}</p> : null}
        {chip}
      </div>
    );
  }

  if (field.type === "computed") {
    return (
      <div className={`prop-field span-2${aiWillFill ? " is-ai-expected" : ""}`} data-field={fieldPath || undefined}>
        <div className="prop-label" data-field-label={fieldPath || undefined}>
          <span>{field.label}</span>
          {wand}
          {aiFillMark}
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    const checkId = `fld-${String(fieldPath || field.key).replace(/[^A-Za-z0-9_-]+/g, "-")}`;
    return (
      <label className={`prop-check span-2${locked ? " is-locked" : ""}${aiWillFill ? " is-ai-expected" : ""}`} title={lockTitle} htmlFor={checkId}>
        <input
          id={checkId}
          data-field={fieldPath || undefined}
          type="checkbox"
          checked={Boolean(value)}
          disabled={locked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="prop-label" data-field-label={fieldPath || undefined}>
          {field.label}
          {wand}
          {aiFillMark}
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </span>
      </label>
    );
  }

  const listId = Array.isArray(field.datalist) && field.datalist.length ? `${field.key}-presets` : "";
  // The role badge holds a button, so the label points at its box explicitly.
  const inputId = `fld-${String(fieldPath || field.key).replace(/[^A-Za-z0-9_-]+/g, "-")}`;
  const input =
    field.type === "select" ? (
      <select id={inputId} data-field={fieldPath || undefined} value={value ?? ""} disabled={locked} title={lockTitle} onChange={(e) => onChange(e.target.value)}>
        {(field.options || []).map((opt) => (
          <option key={`${opt.v}::${opt.l}`} value={opt.v}>
            {opt.l}
          </option>
        ))}
      </select>
    ) : field.type === "textarea" ? (
      <textarea
        id={inputId}
        data-field={fieldPath || undefined}
        rows={3}
        value={value ?? ""}
        placeholder={field.placeholder || ""}
        disabled={locked}
        title={lockTitle}
        onChange={(e) => onChange(e.target.value)}
        onFocus={gstFocusHint ? () => setGstFocused(true) : undefined}
        onBlur={gstFocusHint ? () => setGstFocused(false) : undefined}
      />
    ) : (
      <>
        <input
          id={inputId}
          data-field={fieldPath || undefined}
          type={field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined}
          list={listId || undefined}
          value={value ?? ""}
          placeholder={field.placeholder || ""}
          disabled={locked}
          title={lockTitle}
          onChange={(e) => onChange(e.target.value)}
          onFocus={gstFocusHint ? () => setGstFocused(true) : undefined}
          onBlur={gstFocusHint ? () => setGstFocused(false) : undefined}
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
    <div className={`prop-field${full ? " span-2" : ""}${locked ? " is-locked" : ""}${aiSourced ? " is-ai" : ""}${aiWillFill ? " is-ai-expected" : ""}`} title={lockTitle}>
      <label className="prop-field-inner" htmlFor={inputId}>
        <span className="prop-label" data-field-label={fieldPath || undefined}>
          {field.label}
          {wand}
          {aiFillMark}
          <FieldRefreshControl onRefresh={onRefresh} refreshing={refreshing} locked={locked} />
          <FieldRoleBadge path={fieldPath} doc={ideaDoc} />
        </span>
        {input}
      </label>
      <AutofillProvenance
        fieldPath={fieldPath}
        doc={ideaDoc}
        aiSourced={aiSourced}
        editedName={editedName}
        onRestore={onRestoreAi}
        canRestore={canRestoreAi}
        onConfirmAi={onConfirmAi}
      />
      {aiSourced && !editedName ? <span className="ai-sourced-tag">Filled by AI, check it</span> : null}
      {gstFocusHint && gstFocused ? <p className="autofill-status">{gstFocusHint}</p> : null}
      {fieldPath === "f2.cogsAtScale" && (ideaDoc?.f2?.cogsLowInr != null || ideaDoc?.f2?.cogsHighInr != null) ? (
        <p className="autofill-status" data-tone="ai">
          AI estimate range ₹{ideaDoc.f2.cogsLowInr ?? "—"}–₹{ideaDoc.f2.cogsHighInr ?? "—"}
          {ideaDoc.f2.cogsConfidenceNote ? ` — ${ideaDoc.f2.cogsConfidenceNote}` : ""}
          {ideaDoc.f2.cogsBasis ? `. ${ideaDoc.f2.cogsBasis}` : ""}
        </p>
      ) : null}
      {fieldPath === "f2.gstRatePct" && ideaDoc?.f2?.gstBasis ? (
        <p className="autofill-status" data-tone="ai">{ideaDoc.f2.gstBasis}</p>
      ) : null}
      {taxNotes}
      {!taxNotes && breakdownNote ? <p className="derived-note">{breakdownNote}</p> : null}
      {!taxNotes && liveNote ? <p className="price-gap-note">{liveNote}</p> : null}
      {chip}
      {field.fileKey ? (
        <div className="prop-attach">
          <input
            ref={fileRef}
            type="file"
            accept={field.fileAccept || ".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv"}
            hidden
            onChange={onPickFile}
          />
          {!fileValue?.name ? (
            <button
              type="button"
              className="ghost"
              disabled={locked || fileBusy}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp size={15} />
              {field.fileLabel || "Upload source file"}
            </button>
          ) : (
            <span className="chip file prop-file-chip">
              <FileText size={15} />
              {fileValue.name}
              {!locked && !fileBusy ? (
                <button type="button" onClick={onClearFile} aria-label="Remove source file">
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
          {field.key === "evidenceSourceDate" ? (
            <p className="autofill-status evidence-read-status">
              {ideaDoc?.researchFindings?.evidenceRead?.status === "read"
                ? `Read: ${ideaDoc.researchFindings.evidenceRead.pagesApprox || "?"} pages, ${(
                    ideaDoc.researchFindings.evidenceRead.facts || []
                  ).filter((f) => f.verified).length} facts verified${
                    (ideaDoc.researchFindings.evidenceRead.used || []).length
                      ? `, used for ${(ideaDoc.researchFindings.evidenceRead.used || [])
                          .map((u) =>
                            u.check === "f1.growth"
                              ? "Category size"
                              : u.check === "f1.benchmark"
                                ? "Benchmark"
                                : "Attribute"
                          )
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .join(", ")}`
                      : ""
                  }.`
                : ideaDoc?.researchFindings?.evidenceRead?.status === "unreadable"
                  ? `Could not read: ${ideaDoc.researchFindings.evidenceRead.reason || "unknown"}. ${
                      ideaDoc.researchFindings.evidenceRead.advice || ""
                    }`
                  : fileValue?.name || String(value || "").trim()
                    ? "Not read yet. It is read when you Submit."
                    : "Optional. Read on Submit when a link or file is provided."}
            </p>
          ) : null}
        </div>
      ) : null}
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
  if (label === "Not yet run") return "idle";
  return "watch";
}

const FORM_SCORED_CHECK_LABELS = new Set(["Cleared", "Marked down", "Below floor", "Exempt"]);

function formShowsCheckLabel(label) {
  const text = String(label || "").trim();
  if (!text || text === "Not yet run" || text === "Evidence missing") return false;
  if (FORM_SCORED_CHECK_LABELS.has(text)) return false;
  return true;
}

function evaluationStepFilterKey(step) {
  const s = String(step || "").trim();
  if (s === "filter4") return "f4";
  if (s === "cogsGst" || s === "priceEvents") return "f2";
  return "f1";
}

function propositionEvalState(doc = {}) {
  const fromApi = String(doc?.evaluationState || "").trim();
  if (fromApi) return fromApi;
  if (doc?.goNoGo?.output?.sealedAt) return "evaluated";
  const go = doc?.goNoGo;
  if (Boolean(String(go?.classification || "").trim()) && Number(go?.score?.total) > 0) return "legacy";
  return computeEvaluationStatus(doc).state;
}

function sealedChecksForDoc(doc = {}) {
  if (doc?.sealedChecks && typeof doc.sealedChecks === "object") return doc.sealedChecks;
  const fromOutput = advisoryChecksFromOutput(doc?.output || doc?.goNoGo?.output);
  return fromOutput && typeof fromOutput === "object" ? fromOutput : {};
}

function goNoGoFromSealed(doc = {}, goNoGo = null) {
  const output = doc?.output || goNoGo?.output;
  if (output?.sealedAt) {
    return {
      ...(goNoGo && typeof goNoGo === "object" ? goNoGo : {}),
      classification: output.classification || goNoGo?.classification,
      rationale: output.rationale || goNoGo?.rationale,
      score: output.score || goNoGo?.score,
      scoreInputKey: output.scoreInputKey || goNoGo?.scoreInputKey,
      at: output.sealedAt || goNoGo?.at,
      filterNarratives: {
        f1: output.filters?.f1?.narrative,
        f2: output.filters?.f2?.narrative,
        f3: output.filters?.f3?.narrative,
        f4: output.filters?.f4?.narrative,
      },
      checkLabels: {
        f1: output.filters?.f1?.label,
        f2: output.filters?.f2?.label,
        f3: output.filters?.f3?.label,
        f4: output.filters?.f4?.label,
      },
    };
  }
  return goNoGo;
}

function filterCardTone(check, specKey) {
  const label = check?.checkLabel || "";
  if (specKey === "f6" && (label === "Awaiting panels" || !analysisCheckItems(check?.items).length)) {
    return "idle";
  }
  if (label === "Cleared" || label === "Exempt") return "pass";
  if (label === "Below floor") return "fail";
  if (label === "Not yet run" || label === "Locked") return "idle";
  return "watch";
}

function recordPrimusError(label, err) {
  console.error(`[primus] ${label}`, err);
  if (typeof window === "undefined") return;
  window.__primusErrors = Array.isArray(window.__primusErrors) ? window.__primusErrors : [];
  window.__primusErrors.push({
    label,
    message: String(err?.message || err),
    stack: String(err?.stack || ""),
  });
}

function safeCall(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    recordPrimusError(label, err);
    return fallback;
  }
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

/** Part 141 E — http(s) source links for a check item (source_url and / or sources[]), de-duplicated. */
export function webCheckSources(item) {
  const raw = [item?.source_url, ...(Array.isArray(item?.sources) ? item.sources : [])];
  const out = [];
  for (const entry of raw) {
    const url = String(typeof entry === "string" ? entry : entry?.url || entry?.source_url || "").trim();
    if (/^https?:\/\//i.test(url) && !out.includes(url)) out.push(url);
  }
  return out;
}

/** "Web check: <what was found>" with the source as a link, for each check item that has a source. */
function WebCheckList({ items, specKey }) {
  const rows = (items || [])
    .map((it) => ({
      it,
      sources: webCheckSources(it),
      text: String(it?.finding || it?.reason || it?.text || "").trim(),
    }))
    .filter((r) => r.sources.length && r.text);
  if (!rows.length) return null;
  return (
    <ul className="web-check-list" data-testid="web-check-list">
      {rows.map((r, i) => (
        <li key={`${specKey}-web-${i}`} className="web-check-line" data-testid="web-check">
          Web check: {r.text}{" "}
          {r.sources.map((url, j) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {j === 0 ? "Source" : `Source ${j + 1}`}
            </a>
          ))}
        </li>
      ))}
    </ul>
  );
}

function FilterStatusCard({ spec, check, narrative, compare }) {
  const tone = filterCardTone(check, spec.key);
  const items = analysisCheckItems(check?.items);
  const judged = items.filter((i) => i.level != null || i.slot);
  const creditSum = judged.reduce((s, i) => s + (Number.isFinite(Number(i.credit)) ? Number(i.credit) : i.status === "done" ? 1 : 0), 0);
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const pct = total
    ? Math.round((100 * (judged.length ? creditSum : done)) / total)
    : 0;
  const label = check?.checkLabel || spec.defaultStatus || "Evidence missing";
  return (
    <article className="filter-status-card" data-tone={tone}>
      <div className="filter-status-head">
        <span className="mono filter-status-badge">{spec.num}</span>
        <span className="mono filter-status-label">{label}</span>
      </div>
      <h3>{spec.title}</h3>
      <p>{narrative}</p>
      {(spec.key === "f1" || spec.key === "f4" || (spec.key === "f2" && judged.some((i) => i.slot === "qcom"))) &&
      items.length ? (
        <ul className="f4-analysis-dims">
          {items.map((it, i) => (
            <li key={`${spec.key}-dim-${i}`} data-status={it.status} data-level={it.level || ""}>
              {it.level ? (
                <span className="mono" style={{ opacity: 0.75, marginRight: 6 }}>
                  {formatRiskLevel(it.level)}
                </span>
              ) : null}
              {it.text}
              {Array.isArray(it.reasons) && it.reasons.length ? (
                <small style={{ display: "block", opacity: 0.7 }}>{it.reasons.join(" · ")}</small>
              ) : null}
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
          <span className="mono filter-progress-n">
            {judged.length ? `${Math.round(creditSum * 10) / 10}/${total}` : `${done}/{total}`}
          </span>
        </div>
      ) : (
        <span className="mono filter-progress-n">—</span>
      )}
      <WebCheckList items={items} specKey={spec.key} />
    </article>
  );
}

function FilterTeaserCard({ spec, sub, checkLabel }) {
  const f5f6 = spec.key === "f5" || spec.key === "f6";
  return (
    <div id={spec.key} className={`teaser-card${f5f6 ? " teaser-f5f6" : ""}`}>
      <span className="teaser-badge">{spec.num}</span>
      <div>
        <div className="teaser-title">{spec.title}</div>
        <div className="teaser-sub">{sub}</div>
      </div>
      {checkLabel ? (
        <span className="check-pill" data-tone={toneFor(checkLabel)}>
          Check: {checkLabel}
        </span>
      ) : null}
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
  doc,
  currentUser,
  onRequest,
  onApprove,
  onReject,
  busy,
  comment,
  onComment,
  rejectReason,
  onRejectReason,
  slackNotice = "",
  onDismissSlack,
  announcePreview = "",
}) {
  if (classification === "NO-GO") return null;
  if (classification !== "WATCH") return null;
  const live = doc || { managerReview: review, managerApproval: review };
  const approved = hasManagerApproval(live);
  const state = live.managerReviewState;
  const requestedAt = state?.openRequest?.created_at || review?.requestedAt;
  const rejected = state?.isRejected || review?.status === "rejected";
  const canDecide = viewerCanApproveManagerReview(currentUser, live) && Boolean(requestedAt) && !approved && !rejected;
  const isOwner =
    String(currentUser?.email || "").toLowerCase() ===
      String(live.createdByEmail || live.created_by_email || "").toLowerCase() ||
    String(currentUser?.id || "") === String(live.createdByUserId || live.created_by_user_id || "");
  const canRequest =
    canRequestManagerReview(live) &&
    (isOwner || String(currentUser?.role || "").trim() === "ADMIN");
  const requesterName =
    review?.requestedBy?.name || state?.openRequest?.actor_name || "someone";
  const requestedDate = requestedAt
    ? new Date(requestedAt).toISOString().slice(0, 10)
    : "";

  if (approved) {
    return (
      <div className="manager-review-panel is-approved">
        <p>
          Manager approved {review?.approvedAt || state?.decision?.created_at ? timeAgo(review?.approvedAt || state?.decision?.created_at) : ""}. Upload proof to unlock
          Filters 5–6, the same as a GO read.
        </p>
        {(review?.comment || state?.decision?.comment) ? (
          <blockquote className="manager-comment">{review?.comment || state?.decision?.comment}</blockquote>
        ) : null}
      </div>
    );
  }

  if (rejected && !canRequest) {
    return (
      <div className="manager-review-panel">
        <p>Manager review was rejected{review?.rejectedAt ? ` ${timeAgo(review.rejectedAt)}` : ""}.</p>
        {review?.rejectReason ? <blockquote className="manager-comment">{review.rejectReason}</blockquote> : null}
      </div>
    );
  }

  return (
    <div className="manager-review-panel">
      <p>This idea is WATCH. A manager review can unlock proof upload the same way a GO would.</p>
      {requestedAt && !rejected ? (
        <div className="manager-review-banner" role="status">
          <p>
            Manager review requested by {requesterName}
            {requestedDate ? ` on ${requestedDate}` : ""} (WATCH at {scorePct}%).
          </p>
        </div>
      ) : null}
      {!requestedAt || rejected ? (
        canRequest ? (
          <button type="button" className="prop-save run" disabled={busy} onClick={onRequest}>
            {busy ? <Loader2 size={15} className="spin" /> : null}
            Manager Review
          </button>
        ) : null
      ) : null}
      {requestedAt && canDecide ? (
        <div className="manager-review-form">
          <textarea
            placeholder="Approve comment (min 10 characters)"
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="prop-save run"
            disabled={busy || String(comment || "").trim().length < 10}
            onClick={onApprove}
          >
            {busy ? <Loader2 size={15} className="spin" /> : null}
            Approve
          </button>
          <textarea
            placeholder="Reject reason (min 10 characters)"
            value={rejectReason}
            onChange={(e) => onRejectReason(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="prop-save"
            disabled={busy || String(rejectReason || "").trim().length < 10}
            onClick={onReject}
          >
            {busy ? <Loader2 size={15} className="spin" /> : null}
            Reject
          </button>
        </div>
      ) : requestedAt && !canDecide && !rejected ? (
        <p className="manager-wait">Waiting for the business head or an admin to decide.</p>
      ) : null}
      {slackNotice ? (
        <div className="prop-notice" role="status">
          <Info size={14} />
          <span>{slackNotice}</span>
          {typeof onDismissSlack === "function" ? (
            <button type="button" onClick={onDismissSlack} aria-label="Dismiss Slack notice">
              <X size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const COVERAGE_MARK = {
  assessed: "✓",
  pending: "○",
  failed: "!",
  "needs-confirmation": "?",
  rule: "·",
  "not-scored": "–",
};

function EvaluationPendingPage({
  evaluationState,
  evaluationMissing = [],
  missingFormInputs = [],
  doc,
  ideaName,
  category,
  saving,
  onBack,
  onEvaluate,
  onRetryStep,
  onConfirmField,
  onEditField,
  progressLabel = "",
}) {
  const heading =
    evaluationState === "incomplete" ? "Evaluation incomplete" : "Not evaluated yet";
  const status = computeEvaluationStatus(doc || {});
  const required = status.required.length || evaluationMissing.length + status.done.length;
  const doneCount = status.done.length;
  const progress =
    progressLabel ||
    (required ? `${doneCount} of ${required} steps done` : "");
  const formGaps =
    Array.isArray(missingFormInputs) && missingFormInputs.length
      ? missingFormInputs
      : listMissingFormInputs(doc || {});
  const coverage = inputCoverage(doc || {});

  return (
    <div className="gonogo-result-page evaluation-pending-page">
      <header className="output-meta">
        <span className="mono">IDEA · 6-FILTER RULESET</span>
      </header>
      <section className="gonogo-hero tone-idle" data-tone="idle">
        <div className="gonogo-hero-copy">
          {ideaName ? <h1 className="gonogo-idea">{ideaName}</h1> : <h1 className="gonogo-idea">Untitled idea</h1>}
          {category ? (
            <div className="gonogo-chips">
              <span className="mono badge-chip">{category}</span>
            </div>
          ) : null}
          <h2 className="gonogo-pending-title">{heading}</h2>
          <p className="gonogo-rationale">
            Finish the research steps below, then Evaluate to seal the GO/NO-GO output. Until then, no score or
            filter cards are shown.
          </p>
          {progress ? <p className="gonogo-blocked-note">{progress}</p> : null}
          {formGaps.length ? (
            <div className="missing-inputs-block" role="status">
              <h3>Values still to enter</h3>
              <ul className="evaluation-missing-list">
                {formGaps.map((entry) => (
                  <li key={`${entry.filter}.${entry.field}`}>{entry.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {coverage.length ? (
            <div className="what-was-assessed" data-testid="what-was-assessed">
              <h3>What was assessed</h3>
              <ul className="evaluation-missing-list coverage-list">
                {coverage.map((entry) => (
                  <li key={entry.field} data-coverage-status={entry.status} data-field={entry.field}>
                    <span className="coverage-mark" aria-hidden="true">
                      {COVERAGE_MARK[entry.status] || "·"}
                    </span>
                    <span>
                      {entry.label}
                      {entry.status !== "assessed" && entry.reason ? ` — ${entry.reason}` : ""}
                      {entry.status === "assessed" ? " — assessed" : ""}
                      {entry.status === "rule" ? " — fixed rule" : ""}
                      {entry.status === "not-scored" && !entry.reason ? " — used, not scored" : ""}
                    </span>
                    {roleLabel(entry.field, doc) ? (
                      <span
                        className="field-role-badge"
                        data-role-for={entry.field}
                        data-role={effectiveRole(entry.field, doc)}
                      >
                        {roleLabel(entry.field, doc)}
                      </span>
                    ) : null}
                    {entry.status === "failed" ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={saving}
                        onClick={() => onEvaluate?.()}
                      >
                        Retry
                      </button>
                    ) : null}
                    {entry.status === "needs-confirmation" ? (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          disabled={saving}
                          onClick={() => onConfirmField?.(entry.field)}
                        >
                          Use as written
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={saving}
                          onClick={() => onEditField?.(entry.field)}
                        >
                          Edit
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evaluationMissing.length ? (
            <ul className="evaluation-missing-list">
              {evaluationMissing.map((entry) => (
                <li key={entry.step || entry.label}>
                  <span>{entry.label || entry.step}</span>
                  {entry.failed ? (
                    <>
                      <span className="gonogo-blocked-note">
                        Failed: {entry.reason || "Try again"}
                      </span>
                      <button
                        type="button"
                        className="ghost"
                        disabled={saving}
                        onClick={() => onRetryStep?.(entry)}
                      >
                        Retry
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <div className="output-actions pdf-hide">
        <button type="button" className="output-btn-primary" disabled={saving} onClick={onEvaluate}>
          {saving ? <Loader2 size={15} className="spin" /> : null}
          Evaluate
        </button>
        <button type="button" className="output-btn-secondary" onClick={onBack}>
          <ArrowLeft size={15} /> View entered inputs
        </button>
      </div>
    </div>
  );
}

export function GoNoGoResultPage({
  result,
  advisoryChecks,
  category,
  ideaName,
  doc,
  savedDoc,
  onBack,
  onSubmit,
  saving,
  currentUser,
  onRequestReview,
  onApproveReview,
  onRejectReview,
  managerBusy,
  managerComment,
  onManagerComment,
  managerRejectReason,
  onManagerRejectReason,
  reviewAnnounce = "",
  pdfMode = false,
  onEvidenceRescore = null,
  legacyView = false,
  hideFilterCards = false,
  submitLabel = "Submit",
  allowPdfExport = true,
  sealedOutput = null,
  missingFormInputs = null,
}) {
  const pageRef = useRef(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [rescoreBusy, setRescoreBusy] = useState(false);

  async function handleDownloadPdf() {
    if (pdfBusy || !pageRef.current || !allowPdfExport) {
      if (!allowPdfExport) setPdfError("Not evaluated yet — run Evaluate before exporting PDF.");
      return;
    }
    setPdfError("");
    setPdfBusy(true);
    try {
      await exportElementToPdf(pageRef.current, {
        filename: outputPdfFilename(doc || savedDoc || {}, result),
        backgroundColor: "#0d0715",
      });
    } catch (e) {
      setPdfError(e?.message || "Could not export PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!result?.classification) return null;
  const checksFromSeal =
    sealedOutput?.filters && typeof sealedOutput.filters === "object"
      ? advisoryChecksFromOutput(sealedOutput) || {}
      : null;
  const checks =
    checksFromSeal && Object.keys(checksFromSeal).length
      ? checksFromSeal
      : advisoryChecks && typeof advisoryChecks === "object"
        ? advisoryChecks
        : {};
  // Single resolver: screened ideas always show the sealed snapshot (Part 128).
  const scoreBase = resolveOutputScore(checks, result.score, doc, result.scoreInputKey);
  const scorePct = Number.isFinite(Number(scoreBase?.pct)) ? Number(scoreBase.pct) : 0;
  const classification = result.classification;
  // Part 141 D72 — path panel follows the sealed verdict, not a live recompute.
  const score = {
    ...(scoreBase && typeof scoreBase === "object" ? scoreBase : {}),
    pct: scorePct,
    classification,
  };
  const tone = goNoGoTone(classification);
  const isGo = classification === "GO";
  const isWatch = classification === "WATCH";
  const isIncomplete = classification === "INCOMPLETE";
  const scoreStatus = String(result.scoreStatus || "").trim();
  const screenedWhen = result.screenedAt || result.at || "";
  const screenedLabel = screenedWhen
    ? new Date(screenedWhen).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "";
  const scoreStatusBanner =
    scoreStatus === "edited-since-evaluation"
      ? "Edited since evaluation — re-evaluate to refresh"
      : scoreStatus === "edited-since-screening"
        ? `Inputs changed since this score. This is the score from ${screenedLabel || "the last screen"}. Screen again to update it.`
        : scoreStatus === "older-ruleset" || legacyView
          ? "Scored under an older release"
          : "";
  const categoryName = String(category || result.category || "").trim();
  const divisionName = String(doc?.division || "").trim();
  const idea = String(ideaName || result.ideaName || "").trim();
  const liveRationale = safeCall(
    "live rationale",
    () =>
      buildGateRationale({
        classification,
        score,
        checks,
        ideaName: idea,
        category: categoryName,
      }),
    ""
  );
  const rationale = safeCall(
    "hero rationale",
    () =>
      rewriteUnmatchedDivisionCopy(
        result.rationale ||
          (score.total > 0 && liveRationale ? liveRationale : "No rationale returned."),
        categoryName
      ),
    String(result.rationale || "No rationale returned.")
  );
  const pathPlan = safeCall(
    "path to GO",
    () =>
      buildPathToGo({
        advisoryChecks: checks,
        sealedScore: score,
        scoreStatus: scoreStatus || "current",
        screenedAt: result.screenedAt || result.at || null,
        doc,
        listAllOpen: true,
      }),
    {
      kind: "path",
      currentPct: scorePct,
      toGo: { count: 0, pct: scorePct },
      allDonePct: scorePct,
      blockers: [],
      actions: [],
      message: "",
    }
  );
  const improvementItems = safeCall(
    "improvement items",
    () =>
      computeImprovementPointValues(checks).map((it) => ({
        ...it,
        text: rewriteUnmatchedDivisionCopy(it.text, categoryName),
      })),
    []
  );
  const pathBlockers = Array.isArray(pathPlan?.blockers) ? pathPlan.blockers : [];
  const pathActions = annotatePathActions(Array.isArray(pathPlan?.actions) ? pathPlan.actions : [], doc);
  const pathKind = String(pathPlan?.kind || "path");
  const coverage = safeCall("filter coverage", () => countFiltersWithEvidence(doc || {}), {
    have: 0,
    total: 6,
  });
  const screened = formatScreenedDuration(doc?.researchDurationMs);
  const dated = formatOutputDate(doc?.updatedAt || result.at);
  const arc = scoreArcColor(score.pct);
  const ringPct = Math.max(0, Math.min(100, scorePct));
  const sizeTier = safeCall("gram badge", () => ideaSizeForResult(doc || {}), null);

  return (
    <div className="gonogo-result-page" ref={pageRef}>
      <header className="output-meta">
        <span className="mono">
          IDEA · 6-FILTER RULESET{dated ? ` · ${dated}` : ""}
        </span>
        <span className="mono">
          {screened ? `Screened in ${screened} · ` : ""}
          {coverage.have} of {coverage.total} filters have evidence
        </span>
      </header>

      <div className="output-hero-row">
        {scoreStatusBanner ? (
          <p className="gonogo-blocked-note" role="status" data-score-status={scoreStatus}>
            {scoreStatusBanner}
          </p>
        ) : null}
        {(() => {
          const gaps =
            Array.isArray(missingFormInputs) && missingFormInputs.length
              ? missingFormInputs
              : listMissingFormInputs(doc || {});
          if (!gaps.length) return null;
          return (
            <div className="missing-inputs-block" role="status">
              <h3>Values you have not entered yet</h3>
              <ul className="evaluation-missing-list">
                {gaps.map((entry) => (
                  <li key={`${entry.filter}.${entry.field}`}>{entry.label}</li>
                ))}
              </ul>
            </div>
          );
        })()}
        <section className={`gonogo-hero tone-${tone}`} data-tone={tone}>
          <div className="gonogo-hero-copy">
            {idea ? <h1 className="gonogo-idea">{idea}</h1> : <h1 className="gonogo-idea">Untitled idea</h1>}
            <div className="gonogo-chips">
              {categoryName ? <span className="mono badge-chip">{categoryName}</span> : null}
              {divisionName ? <span className="mono badge-chip">{divisionName}</span> : null}
            </div>
            <div className="gonogo-badge-row">
              <div className={`gonogo-badge gonogo-classification tone-${tone}`}>{classification}</div>
              {Number.isFinite(Number(score.pct)) ? (
                <span className="mono badge-chip">
                  {Number.isFinite(Number(score.points))
                    ? `${score.points} of ${score.total || 17} relevance points · ${score.pct}%`
                    : `${score.pct}% relevance`}
                  {score.shadowMode && Number.isFinite(Number(score.legacyPct))
                    ? ` · legacy ${score.legacyPct}%`
                    : ""}
                </span>
              ) : isIncomplete && Number.isFinite(Number(score.done)) ? (
                <span className="mono badge-chip">
                  {score.done} of {score.total || 17} checks
                </span>
              ) : null}
              {!isIncomplete && sizeTier ? (
                <span
                  className="gonogo-scale-chip idea-size-badge"
                  data-provisional={sizeTier.provisional ? "true" : "false"}
                  title={sizeTier.derivation}
                >
                  {sizeTier.tier} · {sizeTier.label}
                  {sizeTier.provisional ? (
                    <span className="provisional-tag">estimated, pre-GO</span>
                  ) : null}
                </span>
              ) : null}
            </div>
            {!isIncomplete && sizeTier ? <p className="gonogo-scale-derivation">{sizeTier.derivation}</p> : null}
            <p className="gonogo-rationale">{rationale}</p>
            {storedVerdictWithoutInputs(savedDoc || doc) ? (
              <p className="gonogo-blocked-note">Stored verdict; inputs for this idea are missing</p>
            ) : null}
            {(scoreStatus === "older-ruleset" ||
              scoreStatus === "edited-since-screening" ||
              scoreStatus === "edited-since-evaluation") &&
            doc?.id &&
            typeof onEvidenceRescore === "function" &&
            String(currentUser?.role || "").trim() === "ADMIN" ? (
              <div className="gonogo-rescore-row pdf-hide">
                <button
                  type="button"
                  className="prop-save"
                  disabled={rescoreBusy}
                  onClick={async () => {
                    setRescoreBusy(true);
                    try {
                      await onEvidenceRescore(doc.id);
                    } catch (e) {
                      window.alert(e?.message || "Could not recompute without AI.");
                    } finally {
                      setRescoreBusy(false);
                    }
                  }}
                >
                  {rescoreBusy ? <Loader2 size={14} className="spin" /> : null}
                  Recompute without AI (admin)
                </button>
                <span className="mono" style={{ opacity: 0.7 }}>
                  No AI call — re-seals under the current rules from stored checks
                </span>
              </div>
            ) : null}
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

        <ErrorBoundary
          fallback={
            <aside className="path-panel">
              <p className="gonogo-blocked-note">This section hit an error. The verdict above is still valid.</p>
            </aside>
          }
        >
        <aside className="path-panel" data-path-kind={pathKind}>
          <div className="panel-kicker mono">Closest path to GO</div>
          {pathKind === "recompute" ? (
            <>
              <p className="path-empty">{pathPlan.message}</p>
              {doc?.id &&
              typeof onEvidenceRescore === "function" &&
              String(currentUser?.role || "").trim() === "ADMIN" ? (
                <button
                  type="button"
                  className="prop-save pdf-hide"
                  disabled={rescoreBusy}
                  onClick={async () => {
                    setRescoreBusy(true);
                    try {
                      await onEvidenceRescore(doc.id);
                    } catch (e) {
                      window.alert(e?.message || "Could not recompute without AI.");
                    } finally {
                      setRescoreBusy(false);
                    }
                  }}
                >
                  {rescoreBusy ? <Loader2 size={14} className="spin" /> : null}
                  Recompute without AI (admin)
                </button>
              ) : (
                <p className="path-if">Screen again to update under the current rules.</p>
              )}
            </>
          ) : pathKind === "go" ? (
            <>
              <p className="path-score-line">
                <span className="mono path-projected">{pathPlan.currentPct}%</span>
                <span className="path-if">{pathPlan.message || "GO, above 80%."}</span>
              </p>
              {pathActions.length ? (
                <ul className="path-top-list">
                  {pathActions.map((it, i) => (
                    <li key={`${it.id || it.filter}-${i}`}>
                      <span className="mono imp-filter-tag">{it.filter}</span>
                      <span className="path-action-text">
                        <span>{rewriteUnmatchedDivisionCopy(it.instruction || it.text, categoryName)}</span>
                        {it.why ? <small className="path-why">{it.why}</small> : null}
                        {it.optionalHint ? (
                          <small className="path-why path-optional-hint" data-role="optional">
                            {ROLE_LABEL.optional} — {it.optionalHint}
                          </small>
                        ) : null}
                      </span>
                      <span className="mono path-gain">
                        +{Number.isFinite(Number(it.gainPct)) ? it.gainPct : 7}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : pathKind === "blockers" ? (
            <>
              <p className="path-empty">{pathPlan.message}</p>
              <ul className="path-top-list">
                {pathBlockers.map((it, i) => (
                  <li key={`b-${it.id || i}`}>
                    <span className="mono imp-filter-tag">{it.filter}</span>
                    <span className="path-action-text">
                      <span>{rewriteUnmatchedDivisionCopy(it.instruction || it.text, categoryName)}</span>
                      {it.why ? <small className="path-why">{it.why}</small> : null}
                        {it.optionalHint ? (
                          <small className="path-why path-optional-hint" data-role="optional">
                            {ROLE_LABEL.optional} — {it.optionalHint}
                          </small>
                        ) : null}
                    </span>
                    {Number(it.gainPct) > 0 ? (
                      <span className="mono path-gain">
                        +{Number.isFinite(Number(it.gainPct)) ? it.gainPct : 7}%
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {pathActions.length ? (
                <>
                  <p className="path-if">Then open checks</p>
                  <ul className="path-top-list">
                    {pathActions.map((it, i) => (
                      <li key={`a-${it.id || i}`}>
                        <span className="mono imp-filter-tag">{it.filter}</span>
                        <span className="path-action-text">
                          <span>{rewriteUnmatchedDivisionCopy(it.instruction || it.text, categoryName)}</span>
                          {it.why ? <small className="path-why">{it.why}</small> : null}
                        {it.optionalHint ? (
                          <small className="path-why path-optional-hint" data-role="optional">
                            {ROLE_LABEL.optional} — {it.optionalHint}
                          </small>
                        ) : null}
                        </span>
                        <span className="mono path-gain">
                          +{Number.isFinite(Number(it.gainPct)) ? it.gainPct : 7}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="path-if">
                All cleared: {Number.isFinite(Number(pathPlan.allDonePct)) ? pathPlan.allDonePct : 100}%
              </p>
            </>
          ) : (
            <>
              <p className="path-score-line">
                <span className="mono">{pathPlan.currentPct}%</span>
                {pathActions.length > 0 ||
                Number(pathPlan.toGo?.pct) !== Number(pathPlan.currentPct) ? (
                  <>
                    <span className="path-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="mono path-projected">
                      {Number(pathPlan.toGo?.pct) > Number(pathPlan.currentPct)
                        ? pathPlan.toGo.pct
                        : Math.min(
                            100,
                            Number(pathPlan.currentPct) +
                              pathActions.reduce((s, a) => s + (Number(a.gainPct) || 0), 0)
                          )}
                      %
                    </span>
                  </>
                ) : null}
                <span className="path-if">
                  {pathPlan.message ||
                    (pathPlan.toGo?.count
                      ? `if these ${pathPlan.toGo.count} check${
                          pathPlan.toGo.count === 1 ? "" : "s"
                        } clear`
                      : "")}
                </span>
              </p>
              <ul className="path-top-list">
                {pathActions.map((it, i) => (
                  <li key={`${it.id || it.filter}-${i}`}>
                    <span className="mono imp-filter-tag">{it.filter}</span>
                    <span className="path-action-text">
                      <span>{rewriteUnmatchedDivisionCopy(it.instruction || it.text, categoryName)}</span>
                      {it.why ? <small className="path-why">{it.why}</small> : null}
                        {it.optionalHint ? (
                          <small className="path-why path-optional-hint" data-role="optional">
                            {ROLE_LABEL.optional} — {it.optionalHint}
                          </small>
                        ) : null}
                    </span>
                    <span className="mono path-gain">
                      +{Number.isFinite(Number(it.gainPct)) ? it.gainPct : 7}%
                    </span>
                  </li>
                ))}
              </ul>
              <p className="path-if">
                All {pathActions.length || improvementItems.length} cleared:{" "}
                {Number.isFinite(Number(pathPlan.allDonePct))
                  ? pathPlan.allDonePct
                  : 100}
                %
              </p>
              {improvementItems.length > pathActions.length ? (
                <a className="path-jump mono" href="#what-to-do-next">
                  See all next steps
                </a>
              ) : null}
            </>
          )}
        </aside>
        </ErrorBoundary>
      </div>

      <ErrorBoundary
        fallback={
          <p className="gonogo-blocked-note">This section hit an error. The verdict above is still valid.</p>
        }
      >
      <section className="score-explainer" id="how-this-was-scored">
        <h2>How was this scored?</h2>
        {scoreExplainerSections().map((section) => (
          <div key={section.heading}>
            <h3>{section.heading}</h3>
            <p>{section.body}</p>
          </div>
        ))}
      </section>

      {!hideFilterCards ? (
      <div className="filter-grid">
        {SIX_FILTERS_FORM.map((spec) => {
          const sealedFilter = sealedOutput?.filters?.[spec.key];
          const check = {
            ...(checks[spec.key] || {}),
            ...(sealedFilter?.label ? { checkLabel: sealedFilter.label } : {}),
          };
          const stored = stripFormAdminNarrative(
            String(sealedFilter?.narrative || result.filterNarratives?.[spec.key] || "").trim()
          );
          const awaiting = spec.key === "f6" && (check.checkLabel === "Awaiting panels" || check.infoLine);
          const narrative = rewriteUnmatchedDivisionCopy(
            awaiting
              ? (check.infoLine || "Awaiting prototype panels — Filter 6 is read when lab, consumer and pack results exist.")
              : stored || (sealedFilter?.narrative ? sealedFilter.narrative : fallbackFilterNarrative(check)),
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
      ) : null}

      {doc?.researchFindings?.evidenceRead &&
      doc.researchFindings.evidenceRead.status &&
      doc.researchFindings.evidenceRead.status !== "none" ? (
        <section className="evidence-provided-card" id="evidence-provided">
          <div className="next-steps-head">
            <h2>Evidence provided</h2>
            <span className="mono">{String(doc.researchFindings.evidenceRead.status).toUpperCase()}</span>
          </div>
          <p className="path-if">
            {doc.f1?.evidenceSourceFile?.name
              ? `File: ${doc.f1.evidenceSourceFile.name}`
              : doc.researchFindings.evidenceRead.file?.name
                ? `File: ${doc.researchFindings.evidenceRead.file.name}`
                : null}
            {doc.researchFindings.evidenceRead.link?.url
              ? ` · Link: ${doc.researchFindings.evidenceRead.link.url}`
              : ""}
          </p>
          {(doc.researchFindings.evidenceRead.used || []).length ? (
            <ul className="path-top-list">
              {(doc.researchFindings.evidenceRead.used || []).map((u, i) => (
                <li key={`ev-used-${i}`}>
                  <span className="mono imp-filter-tag">F1</span>
                  <span className="path-action-text">
                    Supported {u.check === "f1.growth" ? "category size" : u.check === "f1.benchmark" ? "benchmark" : "attribute"}
                  </span>
                  <span className="mono path-gain">+7%</span>
                </li>
              ))}
            </ul>
          ) : null}
          {(doc.researchFindings.evidenceRead.facts || []).some((f) => !f.verified) ? (
            <ul className="path-top-list">
              {(doc.researchFindings.evidenceRead.facts || [])
                .filter((f) => !f.verified)
                .map((f, i) => (
                  <li key={`ev-rej-${i}`}>
                    <span className="mono imp-filter-tag">—</span>
                    <span className="path-action-text">
                      Rejected ({f.topic}): {f.rejectReason || "not verified"}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
          {doc.researchFindings.evidenceRead.status === "unreadable" ? (
            <p className="path-empty">
              {doc.researchFindings.evidenceRead.reason}. {doc.researchFindings.evidenceRead.advice || ""}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="next-steps" id="what-to-do-next">
        <div className="next-steps-head">
          <h2>What to do next</h2>
          <span className="mono">Ordered by score impact</span>
        </div>
        {improvementItems.length ? (
          improvementItems.map((item, i) => (
            <div key={`${item.filter}-${i}`} className="next-step-card">
              <div className="point-badge" data-tier={item.pointValue >= 10 ? "high" : "normal"}>
                +{item.pointValue}%
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
          <p className="path-empty">
            {pathKind === "go"
              ? "Nothing outstanding on the scored Filter 1–4 checklist for this idea."
              : pathPlan.message ||
                "Nothing outstanding on the scored Filter 1–4 checklist for this idea."}
          </p>
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

      {isWatch && !pdfMode ? (
        <div className="pdf-hide">
          <ManagerReviewPanel
            classification={classification}
            scorePct={score.pct}
            review={doc?.managerReview}
            doc={doc}
            currentUser={currentUser}
            onRequest={onRequestReview}
            onApprove={onApproveReview}
            onReject={onRejectReview}
            busy={managerBusy}
            comment={managerComment}
            onComment={onManagerComment}
            rejectReason={managerRejectReason}
            onRejectReason={onManagerRejectReason}
            announcePreview={reviewAnnounce || doc?.managerReview?.announce || ""}
          />
        </div>
      ) : null}

      {!pdfMode ? (
        <div className="output-actions pdf-hide">
          <button
            type="button"
            className="output-btn-primary"
            disabled={saving}
            onClick={onSubmit}
          >
            {saving ? <Loader2 size={15} className="spin" /> : null}
            {submitLabel}
          </button>
          <button
            type="button"
            className="output-btn-secondary"
            disabled={pdfBusy || !allowPdfExport}
            onClick={handleDownloadPdf}
            title={
              allowPdfExport
                ? "Download this output page as PDF"
                : "Not evaluated yet — run Evaluate before exporting PDF"
            }
          >
            {pdfBusy ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            className="output-btn-secondary"
            onClick={onBack}
            title="Open the input form with every value already filled for this idea"
          >
            <ArrowLeft size={15} /> View entered inputs
          </button>
          {pdfError ? (
            <p className="gonogo-blocked-note" role="alert" style={{ width: "100%", margin: "4px 0 0" }}>
              {pdfError}
            </p>
          ) : null}
        </div>
      ) : null}
      </ErrorBoundary>
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
  const f1 = doc?.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  const attrs = [f1.declaredAttribute, f1.declaredAttribute2, f1.declaredAttribute3, f1.benchmark]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");
  return `${String(doc?.name || "").trim().toLowerCase()}|${String(doc?.ideaDescription || "").trim().toLowerCase()}|${String(doc?.category || "").trim().toLowerCase()}|${attrs}|${attachSig}`;
}

function preferOutputView(doc = null) {
  if (doc?._preferOutput) return true;
  const state = propositionEvalState(doc);
  return state === "evaluated" || state === "legacy";
}

export default function PropositionForm({
  initial,
  onSave,
  onSaveDraft,
  onUnsavedChange,
  saving,
  savedFlash,
  error,
  currentUser,
  llmProvider = "claude",
  onProcessingChange,
  importResult = null,
  setImportResult = () => {},
  onOpenImportedDraft,
  onSubmitImportedIdea,
}) {
  const [doc, setDoc] = useState(() => mergeProposition(initial));
  useEffect(() => {
    const accountName = String(currentUser?.name || "").trim();
    if (!accountName) return;
    setDoc((prev) => {
      if (String(prev?.submitterName || "").trim()) return prev;
      return { ...prev, submitterName: accountName };
    });
  }, [currentUser?.name, initial?.id]);
  useEffect(() => {
    const preferred = rememberedIdeaTeam(currentUser?.team);
    if (!preferred) return;
    setDoc((prev) => {
      if (String(prev?.submitterDepartment || "").trim()) return prev;
      return { ...prev, submitterDepartment: preferred, teamIsLegacy: false };
    });
  }, [currentUser?.team, initial?.id]);

  useEffect(() => {
    const team = String(doc.submitterDepartment || "").trim();
    if (!team) return;
    try {
      localStorage.setItem(LAST_TEAM_KEY, team);
    } catch {
      /* ignore */
    }
  }, [doc.submitterDepartment]);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiDismissed, setAiDismissed] = useState({});
  const [aiPassMeta, setAiPassMeta] = useState(null);
  /** field → true once the user clicked Keep as typed for that review issue. */
  const [inputReviewKept, setInputReviewKept] = useState({});
  const [localError, setLocalError] = useState("");
  const [slackNotice, setSlackNotice] = useState("");
  const [advisoryChecks, setAdvisoryChecks] = useState(() => initial?.advisoryChecks || null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [summaryStale, setSummaryStale] = useState(false);
  const [summaryChecks, setSummaryChecks] = useState(null);
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
  const [currentView, setCurrentView] = useState(() =>
    preferOutputView(initial) ? "goNoGoResult" : "propositionForm"
  );
  const openedFromLog = Boolean(initial?._openFromLog);
  const [readingGoNoGo, setReadingGoNoGo] = useState(false);
  const [proofError, setProofError] = useState("");
  const [evidenceFileError, setEvidenceFileError] = useState("");
  const [managerBusy, setManagerBusy] = useState(false);
  const [managerComment, setManagerComment] = useState("");
  const [managerRejectReason, setManagerRejectReason] = useState("");
  const [reviewAnnounce, setReviewAnnounce] = useState("");
  const [teamHeadHint, setTeamHeadHint] = useState("");
  const [aiSourced, setAiSourced] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [mrpBaseInr, setMrpBaseInr] = useState(null);
  const [mrpFinalInr, setMrpFinalInr] = useState(null);
  const [researchKeyAtRun, setResearchKeyAtRun] = useState(() =>
    initial?.researchRunAt ? researchInputKey(initial) : ""
  );
  const sourceDocRef = useRef(initial || null);
  const proofRef = useRef(null);
  const mrpTouchedByHuman = useRef(false);
  const f3RangeTouchedByHuman = useRef(false);
  const gstTouchedByHuman = useRef(false);
  const f3AutoFillRequested = useRef(false);
  const docRef = useRef(doc);
  const aiSourcedRef = useRef({});
  const [f3Filling, setF3Filling] = useState(false);
  const [f4Reassessing, setF4Reassessing] = useState(false);
  const [f4VerifyingKey, setF4VerifyingKey] = useState("");
  const [refreshingField, setRefreshingField] = useState("");
  const [conceptCardBusy, setConceptCardBusy] = useState(false);
  const [conceptCardError, setConceptCardError] = useState("");
  const [conceptCardNote, setConceptCardNote] = useState("");
  const [conceptCardName, setConceptCardName] = useState(() =>
    String(initial?.f1?.conceptCardName || "").trim()
  );
  /** Part 143 D87 — extra benefit boxes revealed by "+ Add another benefit" (0–2). */
  const [benefitExtra, setBenefitExtra] = useState(() => {
    const f1 = initial?.f1 || {};
    if (String(f1.declaredAttribute3 || "").trim()) return 2;
    if (String(f1.declaredAttribute2 || "").trim()) return 1;
    return 0;
  });
  /** Filters 2–4 start collapsed; expand via the header arrow. */
  const [filterOpen, setFilterOpen] = useState(() => ({ f2: false, f3: false, f4: false }));
  const [draftSaveState, setDraftSaveState] = useState("");
  // Part 140 B (D64) — a failed draft save is loud: banner, "Not saved" sidebar, auto-retry, leave warning.
  const [draftError, setDraftError] = useState("");
  const [lastGoodSaveAt, setLastGoodSaveAt] = useState(() => initial?.updatedAt || null);
  const [draftRetrying, setDraftRetrying] = useState(false);
  const [draftRetryNote, setDraftRetryNote] = useState("");
  const [whyBlockedOpen, setWhyBlockedOpen] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitFailed, setSubmitFailed] = useState(false);
  const [pressedBlocked, setPressedBlocked] = useState(false);
  const draftErrorRef = useRef("");
  const draftRetryRef = useRef({ count: 0, timer: null });
  const conceptCardRef = useRef(null);
  const skipDraftRef = useRef(true);
  const draftDirtyRef = useRef(false);
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;
  const onUnsavedChangeRef = useRef(onUnsavedChange);
  onUnsavedChangeRef.current = onUnsavedChange;

  /** One place that flips "has unsaved changes" so the leave warnings and the App guard agree. */
  function setDraftDirty(value) {
    draftDirtyRef.current = Boolean(value);
    onUnsavedChangeRef.current?.(draftDirtyRef.current || Boolean(draftErrorRef.current));
  }

  function clearDraftRetryTimer() {
    const r = draftRetryRef.current;
    if (r.timer) window.clearTimeout(r.timer);
    r.timer = null;
  }

  /**
   * Save the current doc as a draft. Resolves to nothing; every outcome is shown on screen.
   * `auto` marks a retry the form scheduled itself (10 s apart, at most 3 in a row).
   */
  async function performDraftSave({ auto = false } = {}) {
    const snap = docRef.current;
    if (!snap?.id || typeof onSaveDraftRef.current !== "function") return;
    clearDraftRetryTimer();
    if (!auto) draftRetryRef.current.count = 0;
    setDraftRetrying(true);
    let outcome;
    try {
      outcome = await onSaveDraftRef.current(snap);
    } catch (e) {
      outcome = { ok: false, error: plainDraftSaveError(e) };
    }
    setDraftRetrying(false);
    if (outcome && outcome.ok === undefined) {
      // Older callers resolved to the saved idea (or null) instead of { ok }.
      outcome = outcome.id ? { ok: true, proposition: outcome } : { ok: false, error: "" };
    }
    if (outcome?.ok) {
      draftRetryRef.current.count = 0;
      draftErrorRef.current = "";
      setDraftError("");
      setDraftRetryNote("");
      setLastGoodSaveAt(outcome.proposition?.updatedAt || new Date().toISOString());
      if (docRef.current === snap) setDraftDirty(false);
      else onUnsavedChangeRef.current?.(true);
      const saved = outcome.proposition || {};
      if (Array.isArray(saved.ignoredKeys) && saved.ignoredKeys.length) {
        const active = document.activeElement?.getAttribute?.("data-field") || "";
        setDoc((prev) => patchIgnoredKeys(prev, saved, saved.ignoredKeys, active).doc);
        setDraftSaveState("Kept a newer saved value. This screen matches the saved idea.");
        return;
      }
      setDraftSaveState("Draft saved");
      return;
    }
    const reason = String(outcome?.error || "").trim() || "the server did not accept the save";
    draftErrorRef.current = reason;
    setDraftError(reason);
    setDraftSaveState("Not saved");
    onUnsavedChangeRef.current?.(true);
    const r = draftRetryRef.current;
    if (r.count < DRAFT_AUTO_RETRY_MAX) {
      r.count += 1;
      setDraftRetryNote(`Trying again in ${DRAFT_AUTO_RETRY_MS / 1000} seconds (retry ${r.count} of ${DRAFT_AUTO_RETRY_MAX}).`);
      r.timer = window.setTimeout(() => {
        r.timer = null;
        performDraftSaveRef.current?.({ auto: true });
      }, DRAFT_AUTO_RETRY_MS);
    } else {
      setDraftRetryNote("We stopped retrying on our own. Press Retry when your connection is back.");
    }
  }
  const performDraftSaveRef = useRef(performDraftSave);
  performDraftSaveRef.current = performDraftSave;

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
    const evalState = propositionEvalState(initial);
    if (evalState === "evaluated" || evalState === "legacy") {
      setGoNoGo(goNoGoFromSealed(initial, initial?.goNoGo || null));
    } else {
      setGoNoGo(null);
    }
    if (initial?.sealedChecks) setSummaryChecks(initial.sealedChecks);
    else if (evalState === "evaluated") setSummaryChecks(sealedChecksForDoc(initial));
    setConceptCardName(String(initial?.f1?.conceptCardName || "").trim());
    setResearchKeyAtRun(initial?.researchRunAt ? researchInputKey(filled.doc) : "");
    sourceDocRef.current = filled.doc;
    f3RangeTouchedByHuman.current = false;
    gstTouchedByHuman.current = false;
    f3AutoFillRequested.current = false;
    skipDraftRef.current = true;
    clearDraftRetryTimer();
    draftRetryRef.current.count = 0;
    draftErrorRef.current = "";
    setDraftError("");
    setDraftRetryNote("");
    setDraftSaveState("");
    setLastGoodSaveAt(initial?.updatedAt || null);
    setDraftDirty(false);
  }, [initial?.id]);

  useEffect(() => {
    setAiDismissed({});
    setAiPassMeta(null);
    setInputReviewKept({});
    setLocalError("");
    setSlackNotice("");
    setProofError("");
    setEvidenceFileError("");
    setJustSubmitted(false);
    setSummaryStale(false);
    setSummaryChecks(null);
    const evalState = propositionEvalState(initial);
    if (evalState === "evaluated" || evalState === "legacy") {
      setGoNoGo(goNoGoFromSealed(initial, initial?.goNoGo || null));
    } else {
      setGoNoGo(null);
    }
    setCurrentView(preferOutputView(initial) ? "goNoGoResult" : "propositionForm");
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

  const f2Override = doc.f2?.mrpOverride === true;
  useEffect(() => {
    setDoc((prev) => {
      const nextF2 = applyDerivedMrpToF2(prev.f2 || {});
      const priced = resolveF2Price(nextF2);
      setMrpBaseInr(priced?.ok ? priced.preTaxMrp : null);
      setMrpFinalInr(priced?.ok ? priced.mrp : null);
      if (
        String(prev.f2?.mrpInr ?? "") === String(nextF2.mrpInr ?? "") &&
        String(prev.f2?.mrpPreTaxInr ?? "") === String(nextF2.mrpPreTaxInr ?? "") &&
        String(prev.f2?.gstAmountInr ?? "") === String(nextF2.gstAmountInr ?? "") &&
        Boolean(prev.f2?.mrpOverride) === Boolean(nextF2.mrpOverride)
      ) {
        return prev;
      }
      return { ...prev, f2: nextF2 };
    });
    if (!f2Override) {
      const derived = deriveMrp({
        cogsAtScale: f2Cogs,
        netMarginAtScale: f2Margin,
        gstRatePct: f2Gst,
      });
      if (derived?.ok) {
        setAiSourced((prev) =>
          prev[sourcedPath("f2", "mrpInr")] === true ? prev : { ...prev, [sourcedPath("f2", "mrpInr")]: true }
        );
      }
    }
  }, [f2Cogs, f2Margin, f2Gst, f2Override, doc.f2?.mrpInr]);

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
  // Part 138 D52 — no GST pre-fill. The field stays empty until a person enters the HSN rate.

  // Part 138 E5 — net margin starts at the division minimum; it follows a division change until a person edits it.
  const ideaDivision = doc.division;
  const ideaDivisionDetection = doc.researchFindings?.divisionDetection;
  useEffect(() => {
    setDoc((prev) => {
      const margin = applyDivisionMinimumMargin(prev);
      if (!margin.changed) return prev;
      const status = {
        ...(prev.autofillStatus && typeof prev.autofillStatus === "object" ? prev.autofillStatus : {}),
        [NET_MARGIN_STATUS_PATH]: divisionMinimumStatusEntry(margin.floor),
      };
      return { ...prev, f2: margin.f2, autofillStatus: status };
    });
  }, [ideaDivision, ideaDivisionDetection, doc.f2?.netMarginAtScale, doc.f2?.netMarginSource]);

  const propositionId = doc.id || initial?.id;
  const hasIdentity = hasSubmitterIdentity(doc);
  const progress = submitProgress(doc);
  const liveInputReview = reviewInputs(doc);
  const visibleInputReviewFields = liveInputReview.fields.filter(
    (f) => !(f.suggestion && inputReviewKept[f.field])
  );
  const inputBlocking = INVALID_INPUTS_BLOCK_SUBMIT && liveInputReview.blocking;
  const canSubmit = progress.requiredLeft === 0 && !inputBlocking;
  // Part 140 B (D64) — "Why can't I submit?": every reason in plain words.
  const submitBlockers = [];
  if (!hasIdentity) {
    submitBlockers.push({ id: "identity", blocking: true, text: "Enter your name and pick your team." });
  }
  if (progress.missingFieldLabels.length) {
    submitBlockers.push({
      id: "required",
      blocking: true,
      text: `Fill ${progress.missingFieldLabels.length === 1 ? "this required box" : "these required boxes"}: ${progress.missingFieldLabels.join(", ")}.`,
    });
  }
  for (const f of liveInputReview.fields.filter((x) => x.status === "invalid")) {
    submitBlockers.push({ id: `invalid-${f.field}`, blocking: INVALID_INPUTS_BLOCK_SUBMIT, text: f.message });
  }
  if (draftError) {
    submitBlockers.push({
      id: "save-failed",
      blocking: false,
      text: `Your changes are NOT saved: ${draftError}. Submit will try to save everything again.`,
    });
  }
  const blockingNow = submitBlockers.filter((w) => w.blocking);
  const submitBarError =
    pressedBlocked && blockingNow.length
      ? `Cannot submit yet: ${blockingNow.map((w) => w.text).join(" ")}`
      : submitMsg || (submitFailed ? String(error || "").trim() || "Submit did not go through. Try again." : "");

  function inputReviewIssue(field) {
    return visibleInputReviewFields.find((f) => f.field === field) || null;
  }

  function applyInputSuggestion(field, suggestion) {
    setInputReviewKept((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (field === "name" || field === "category" || field === "ideaDescription") {
      setTop(field, suggestion);
      return;
    }
    if (field === "declaredAttribute" || field === "benchmark" || field === "declaredGap") {
      setFilter("f1", field, suggestion);
      return;
    }
    if (
      field === "gstRatePct" ||
      field === "netMarginAtScale" ||
      field === "mrpInr" ||
      field === "cogsAtScale" ||
      field === "grammage"
    ) {
      setFilter("f2", field, suggestion);
    }
  }

  function keepInputTyped(field) {
    setInputReviewKept((prev) => ({ ...prev, [field]: true }));
  }
  const liveDoc = { ...doc, goNoGo: goNoGo || doc.goNoGo };
  const livePreviewChecks = previewAdvisoryChecks(liveDoc);
  // Filters 1–4 stay open; Filters 5–6 need GO/manager + proof.
  const proofGateReady = isFilterUnlocked("proof-gate", liveDoc);
  const mayUploadProof = canProceedToProofUpload(liveDoc) && proofGateReady;
  const f5Unlocked = isFilterUnlocked("f5", liveDoc);
  const unlockHint = nextLockedHint(liveDoc);
  const unlockedFilterKeys = new Set(
    SIX_FILTERS_FORM.map((s) => s.key).filter((k) => isFilterUnlocked(k, liveDoc))
  );
  const f3Unlocked = unlockedFilterKeys.has("f3");
  const missingFormInputs = listMissingFormInputs(liveDoc);
  // Part 135 — F3 is cliff research on Submit; no live band auto-fill spinner.
  const marginElasticityLoading = false;

  useEffect(() => {
    // Part 135 — do not auto-fill the retired safe-MRP band.
    if (true) return undefined;
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
    if (skipDraftRef.current) {
      skipDraftRef.current = false;
      return undefined;
    }
    if (!propositionId || typeof onSaveDraftRef.current !== "function" || saving) return undefined;
    if (isScoredProposition(sourceDocRef.current)) return undefined;
    setDraftDirty(true);
    const t = window.setTimeout(() => {
      if (!docRef.current?.id) return;
      performDraftSaveRef.current?.({});
    }, 2000);
    return () => window.clearTimeout(t);
  }, [doc, propositionId, saving]);

  useEffect(() => {
    return () => {
      clearDraftRetryTimer();
      if (
        draftDirtyRef.current &&
        typeof onSaveDraftRef.current === "function" &&
        docRef.current?.id &&
        !isScoredProposition(sourceDocRef.current)
      ) {
        // Last chance on the way out; the person has already been warned if this fails.
        Promise.resolve(onSaveDraftRef.current(docRef.current)).catch(() => {});
      }
      onUnsavedChangeRef.current?.(false);
    };
  }, []);

  // Part 140 B (D64) — closing or reloading the tab with changes that are not saved asks first.
  useEffect(() => {
    function warnBeforeUnload(event) {
      if (!draftDirtyRef.current && !draftErrorRef.current) return undefined;
      event.preventDefault();
      event.returnValue = "Your changes are not saved yet.";
      return event.returnValue;
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  useEffect(() => {
    const team = String(doc.submitterDepartment || "").trim();
    if (!propositionId || !team || managerReviewRequestedOn(doc)) {
      setTeamHeadHint("");
      return undefined;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/request-manager-review`, {
          method: "POST",
          credentials: "include",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preview: true, team }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || ctrl.signal.aborted) return;
        const names = Array.isArray(data.recipients)
          ? data.recipients.map((r) => r.name || r.email).filter(Boolean)
          : [];
        if (names.length === 1) setTeamHeadHint(`Reviewed by ${names[0]}`);
        else if (names.length > 1) setTeamHeadHint(`Reviewed by ${names.join(", ")}`);
        else setTeamHeadHint(String(data.announce || "").replace(/^Business heads?:\s*/i, "Reviewed by ") || "");
      } catch {
        if (!ctrl.signal.aborted) setTeamHeadHint("");
      }
    })();
    return () => ctrl.abort();
  }, [propositionId, doc.submitterDepartment, doc.managerReview?.requestedAt]);

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
    const by = String(currentUser?.name || currentUser?.email || "you").trim() || "you";
    setEditedFields((prev) => ({ ...prev, [path]: by }));
    setAiSourced((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }

  function storedSuggestionValue(filterKey, fieldKey) {
    if (!aiSuggestions || typeof aiSuggestions !== "object") return null;
    if (filterKey) return aiSuggestions[filterKey]?.[fieldKey] ?? null;
    return aiSuggestions.top?.[fieldKey] ?? aiSuggestions[fieldKey] ?? null;
  }

  function restoreAiValue(filterKey, fieldKey) {
    const raw = storedSuggestionValue(filterKey, fieldKey);
    if (raw == null) return;
    const path = sourcedPath(filterKey, fieldKey);
    if (filterKey === "f2" && fieldKey === "netMarginAtScale") {
      noteEdit();
      setDoc((prev) => ({
        ...prev,
        f2: { ...(prev.f2 || {}), netMarginAtScale: raw, netMarginSource: "ai" },
      }));
    } else if (filterKey) setFilter(filterKey, fieldKey, raw);
    else setTop(fieldKey, raw);
    setEditedFields((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setAiSourced((prev) => ({ ...prev, [path]: true }));
  }

  function handleMrpInput(value) {
    mrpTouchedByHuman.current = true;
    noteEdit();
    markEdited("f2", "mrpInr");
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
          userInputs: normalizeF4UserInputs(doc.f4?.userInputs),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not re-assess Filter 4 responses.");
        return;
      }
      if (data.proposition) {
        const next = mergeProposition(data.proposition);
        // Part 140 C — research never overwrites what the person said; keep their on-screen rating and view.
        const mineNow = docRef.current?.f4?.userInputs;
        const kept = mineNow && Object.keys(mineNow).length ? { ...next, f4: { ...(next.f4 || {}), userInputs: mineNow } } : next;
        setDoc(kept);
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

  // Part 138 D — say how much of Filters 5 and 6 the evidence file filled in.
  const evidenceF5F6 = doc.researchFindings?.evidenceRead?.f5f6;
  const evidenceF5F6Note =
    evidenceF5F6 && Array.isArray(evidenceF5F6.found) && doc.researchFindings?.evidenceRead?.status === "read"
      ? `Evidence file read: found ${evidenceF5F6.found.filter((h) => h.filter === "f5").length} of 5 Filter 5 values, ${
          evidenceF5F6.found.filter((h) => h.filter === "f6").length
        } of 3 Filter 6 values`
      : "";

  // Part 138 E6 (D54) — when Filter 2 is on screen and COGS is empty, fetch the AI estimate once, without a click.
  // The COGS value is labelled "AI estimate — review", is never scored, and "Re-run this estimate" stays available.
  const cogsAutoRequestedFor = useRef("");
  const f2Visible = unlockedFilterKeys.has("f2") && currentView === "propositionForm";
  const cogsBlank = isBlankValue(doc.f2?.cogsAtScale);
  const ideaHasDescription = String(ideaText || "").trim() !== "";
  const ideaHasCategory = String(ideaCategory || "").trim() !== "";
  const costAlreadyEstimated = doc.researchFindings?.f2?.costEstimate?.cogsAtScale != null;
  useEffect(() => {
    if (!f2Visible || !cogsBlank || !ideaHasDescription || !ideaHasCategory || costAlreadyEstimated) return undefined;
    if (!propositionId || cogsAutoRequestedFor.current === propositionId) return undefined;
    const timer = setTimeout(() => {
      if (cogsAutoRequestedFor.current === propositionId) return;
      if (!isBlankValue(docRef.current?.f2?.cogsAtScale)) return;
      cogsAutoRequestedFor.current = propositionId;
      handleRefreshField("cogsAtScale");
    }, 3000);
    return () => clearTimeout(timer);
    // handleRefreshField is re-created each render; the ref guard keeps this to one automatic call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f2Visible, cogsBlank, ideaHasDescription, ideaHasCategory, costAlreadyEstimated, propositionId, ideaText, ideaCategory]);

  /** Part 138 F (D56) — web-check a hand-entered Filter 4 rating; only the assessment + checks come back. */
  async function handleVerifyF4Dimension(dimensionKey, nextUserInputs) {
    if (!propositionId || !dimensionKey) return;
    setF4VerifyingKey(dimensionKey);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/verify-f4`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: llmProvider,
          dimensionKey,
          // Part 140 C — the person's rating and view are the context; research never writes them back.
          userInputs: normalizeF4UserInputs(nextUserInputs ?? docRef.current?.f4?.userInputs),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not web-check that Filter 4 rating.");
        return;
      }
      if (data.proposition) {
        const saved = mergeProposition(data.proposition);
        // Keep whatever the person typed meanwhile — take only the stored findings.
        setDoc((prev) => ({ ...prev, researchFindings: saved.researchFindings || prev.researchFindings }));
        if (data.advisoryChecks) {
          setAdvisoryChecks(data.advisoryChecks);
          setSummaryChecks(data.advisoryChecks);
        }
        if (saved.goNoGo?.classification) setGoNoGo(saved.goNoGo);
      }
    } catch (e) {
      setLocalError(e.message || "Could not web-check that Filter 4 rating.");
    } finally {
      setF4VerifyingKey("");
    }
  }

  async function handleRefreshField(fieldKey) {
    if (!propositionId || refreshingField || saving) return;
    const pathGuess = fieldKey.includes(".") ? fieldKey : `f2.${fieldKey}`;
    const editedName = editedFields[pathGuess] || editedFields[fieldKey] || "";
    if (editedName) {
      const current =
        pathGuess.includes(".")
          ? docRef.current?.[pathGuess.split(".")[0]]?.[pathGuess.split(".")[1]]
          : docRef.current?.[fieldKey];
      const stored = storedSuggestionValue(pathGuess.split(".")[0] || "f2", pathGuess.split(".")[1] || fieldKey);
      const ok = window.confirm(
        `You edited this field (${editedName}). Re-run will replace your value.\n\nCurrent: ${String(current ?? "(empty)")}\nAI estimate: ${String(stored ?? "(new run)")}\n\nReplace your edit?`
      );
      if (!ok) return;
    }
    setRefreshingField(fieldKey);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/refresh-field`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: fieldKey,
          provider: llmProvider,
          proposition: docRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not re-run that estimate.");
        return;
      }
      const filterKey = data.filterKey;
      const nextKey = data.fieldKey || fieldKey;
      const path = sourcedPath(filterKey, nextKey);
      noteEdit();
      setEditedFields((prev) => {
        if (!prev[path]) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      });
      setDoc((prev) => {
        const nextFilter = { ...(prev[filterKey] || {}), [nextKey]: data.value };
        if (data.extra && typeof data.extra === "object") Object.assign(nextFilter, data.extra);
        return { ...prev, [filterKey]: nextFilter };
      });
      setAiSourced((prev) => ({ ...prev, [path]: true }));
    } catch (e) {
      setLocalError(e.message || "Could not re-run that estimate.");
    } finally {
      setRefreshingField("");
    }
  }

  async function handleRetryFilter(filterKey) {
    const preview = retryStepCostPreview(filterKey);
    if (!preview || !propositionId || refreshingField || saving) return;
    if (!window.confirm(`${preview}\n\nContinue?`)) return;
    setRefreshingField(filterKey);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/retry-step`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: filterKey, provider: llmProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not retry that filter.");
        return;
      }
      if (data.proposition) setDoc((prev) => ({ ...prev, ...data.proposition }));
      if (data.advisoryChecks) {
        setAdvisoryChecks(data.advisoryChecks);
        setSummaryChecks(data.advisoryChecks);
      }
    } catch (e) {
      setLocalError(e.message || "Could not retry that filter.");
    } finally {
      setRefreshingField("");
    }
  }

  async function handleRunMissingSteps() {
    const plan = planResearch(docRef.current || {});
    if (plan.researchState !== "incomplete" || !plan.steps.length || !propositionId || refreshingField || saving) return;
    if (!window.confirm(`${missingStepsCostPreview(plan.steps)}\n\nContinue?`)) return;
    setRefreshingField("missing");
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/retry-step`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missing: true, provider: llmProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.error || "Could not run the missing steps.");
        return;
      }
      if (data.proposition) {
        setDoc((prev) => {
          const merged = { ...prev, ...data.proposition };
          return {
            ...merged,
            evaluationState: data.proposition.evaluationState ?? merged.evaluationState,
            evaluationMissing: data.proposition.evaluationMissing ?? computeEvaluationStatus(merged).missing,
          };
        });
      }
      if (data.advisoryChecks) {
        setAdvisoryChecks(data.advisoryChecks);
      }
    } catch (e) {
      setLocalError(e.message || "Could not run the missing steps.");
    } finally {
      setRefreshingField("");
    }
  }

  async function handleConceptCardFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !propositionId) return;
    setConceptCardError("");
    setConceptCardBusy(true);
    try {
      const uploaded = await readUploadFile(file, setConceptCardError, { allowExcel: true, allowImage: true });
      if (!uploaded) return;
      setConceptCardName(uploaded.name || file.name);
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/concept-card`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment: uploaded, provider: llmProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConceptCardName("");
        setConceptCardError(data.error || "Could not read that concept card.");
        return;
      }
      if (data.conceptCardName) setConceptCardName(data.conceptCardName);
      // Part 138 B — only values the document states are suggested; say how many were left out.
      const keptCount = Array.isArray(data.extractedKeys) ? data.extractedKeys.length : 0;
      const droppedCount = Number(data.droppedCount) || 0;
      setConceptCardNote(
        `Suggested from the concept card (AI-suggested, review): ${keptCount} field${keptCount === 1 ? "" : "s"} kept` +
          (droppedCount ? `; ${droppedCount} dropped because the document does not state ${droppedCount === 1 ? "it" : "them"}.` : ".")
      );
      if (data.proposition) setDoc(mergeProposition(data.proposition));
      if (data.suggestions) {
        setAiSuggestions((prev) => ({
          ...(prev || {}),
          top: { ...(prev?.top || {}), ...(data.suggestions.top || {}) },
          f1: { ...(prev?.f1 || {}), ...(data.suggestions.f1 || {}) },
        }));
      }
    } catch (err) {
      setConceptCardName("");
      setConceptCardError(err.message || "Could not read that concept card.");
    } finally {
      setConceptCardBusy(false);
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
      if (filterKey === "f2" && fieldKey === "netMarginAtScale") {
        nextFilter.netMarginSource = "user";
        if (prev.autofillStatus?.[NET_MARGIN_STATUS_PATH]?.source === DIVISION_MINIMUM_SOURCE) {
          return {
            ...prev,
            [filterKey]: nextFilter,
            autofillStatus: {
              ...prev.autofillStatus,
              [NET_MARGIN_STATUS_PATH]: { status: "kept", source: "user", at: new Date().toISOString() },
            },
          };
        }
      }
      if (
        filterKey === "f5" &&
        fieldKey !== "forumVerdict" &&
        fieldKey !== "verdictNote" &&
        fieldKey !== "confirmedByHuman" &&
        isFilterUnlocked("f5", prev)
      ) {
        nextFilter.confirmedByHuman = true;
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

  function confirmAiField(filterKey, fieldKey) {
    const path = sourcedPath(filterKey, fieldKey);
    noteEdit();
    setDoc((prev) => {
      const findings = { ...(prev.researchFindings || {}) };
      const status = { ...(findings.autofillStatus || {}) };
      const entry = { ...(status[path] || {}) };
      entry.confirmed = true;
      status[path] = entry;
      findings.autofillStatus = status;
      return { ...prev, researchFindings: findings };
    });
  }

  function fieldControlExtras(filterKey, field) {
    const path = sourcedPath(filterKey, field.key);
    const editedName = editedFields[path] || "";
    const canRestore = storedSuggestionValue(filterKey, field.key) != null && Boolean(editedName);
    const entry = autofillStatusFor(doc, path);
    const needsConfirm =
      Boolean(field.aiConfirmable) &&
      entry?.aiSuggested != null &&
      entry?.confirmed !== true;
    return {
      ideaDoc: doc,
      editedName,
      canRestoreAi: canRestore,
      onRestoreAi: canRestore ? () => restoreAiValue(filterKey, field.key) : undefined,
      onConfirmAi: needsConfirm ? () => confirmAiField(filterKey, field.key) : undefined,
    };
  }

  async function readUploadFile(file, setErr, { allowExcel = false, allowImage = true } = {}) {
    const name = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    const excel =
      allowExcel &&
      (mime.includes("spreadsheet") ||
        mime.includes("excel") ||
        /\.(xlsx?|xlsm|csv)$/i.test(name));
    const ok =
      (allowImage && isImageUpload(name, mime)) ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      /\.(pdf|docx?)$/i.test(name) ||
      excel;
    if (!ok) {
      setErr(
        allowExcel
          ? "Upload a Word file (.doc / .docx), PDF, or Excel file (.xls / .xlsx)."
          : "Upload a PDF, Word file (.doc / .docx), or image (JPG, PNG, GIF, WebP, BMP)."
      );
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

  async function handleEvidenceSourceFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || saving) return;
    const uploaded = await readUploadFile(file, setEvidenceFileError, {
      allowExcel: true,
      allowImage: false,
    });
    if (!uploaded) return;
    setFilter("f1", "evidenceSourceFile", uploaded);
    noteEdit();
  }

  function clearEvidenceSourceFile() {
    if (saving) return;
    setFilter("f1", "evidenceSourceFile", null);
    setEvidenceFileError("");
    noteEdit();
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
    setSlackNotice("");
    try {
      const previewRes = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/request-manager-review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const preview = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) throw new Error(preview.error || "Could not prepare manager review.");
      const announce = preview.announce || "Business head: (ADMIN)";
      setReviewAnnounce(announce);
      const ok = window.confirm(
        `Request manager review?\n\n${announce}\n\nThey will get a Slack direct message with a link to this idea.`
      );
      if (!ok) return;
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/request-manager-review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not request manager review.");
      if (data.proposition) setDoc(mergeProposition({ ...doc, ...data.proposition }));
      if (data.announce) setReviewAnnounce(data.announce);
      if (data.slackWarning) setSlackNotice(data.slackWarning);
      else if (data.announce) setSlackNotice(data.announce);
    } catch (e) {
      setLocalError(e.message || "Could not request manager review.");
    } finally {
      setManagerBusy(false);
    }
  }

  async function handleApproveManagerReview() {
    if (!propositionId || managerBusy || String(managerComment || "").trim().length < 10) return;
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

  async function handleRejectManagerReview() {
    if (!propositionId || managerBusy || String(managerRejectReason || "").trim().length < 10) return;
    setManagerBusy(true);
    setLocalError("");
    try {
      const res = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/manager-reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: managerRejectReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reject.");
      if (data.proposition) setDoc(mergeProposition({ ...doc, ...data.proposition }));
      setManagerRejectReason("");
    } catch (e) {
      setLocalError(e.message || "Could not reject.");
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

  async function handleSubmit(providerOverride, submitOpts = {}) {
    if (saving || f3Filling || f4Reassessing) return;
    // Part 140 B (D64) — the button stays pressable; a blocked press explains itself in the Submit bar.
    if (!hasSubmitterIdentity(doc) || !canSubmit) {
      setPressedBlocked(true);
      setSubmitMsg("");
      setSubmitFailed(false);
      setWhyBlockedOpen(true);
      if (!hasSubmitterIdentity(doc)) {
        setLocalError("Enter your name and pick the team for this idea before Submit.");
      } else if (inputBlocking) {
        setLocalError(
          liveInputReview.fields
            .filter((f) => f.status === "invalid")
            .map((f) => f.message)
            .join(" ") || "Fix invalid inputs before Submit."
        );
      } else if (!canSubmit) {
        setLocalError(
          progress.missingFieldLabels.length
            ? `Fill ${progress.missingFieldLabels.join(", ")} before Submit.`
            : "Fill the required fields before Submit."
        );
      }
      return;
    }
    setSubmitMsg("");
    setSubmitFailed(false);
    setPressedBlocked(false);
    setLocalError("");
    setFailedBanner(null);
    const provider = providerOverride || llmProvider;
    const ideaChanged = Boolean(
      doc.researchRunAt && researchKeyAtRun && researchInputKey(doc) !== researchKeyAtRun
    );
    const asNew = shouldForkLogResubmit(sourceDocRef.current, doc);
    const hadResearchRunAt = Boolean(doc.researchRunAt);
    const repairPlan = planResearch(doc);
    const repairing =
      repairPlan.researchState === "incomplete" && !ideaChanged && !asNew && !submitOpts.forceResearch;
    if (repairing && !window.confirm(missingStepsCostPreview(repairPlan.steps))) return;
    setJustSubmitted(true);
    setSummaryStale(false);
    const persistDuration = Boolean(
      submitOpts.forceResearch || ideaChanged || asNew || !hadResearchRunAt
    );
    const startedAt = Date.now();
    const expectedMs = expectedProcessMs({
      forceResearch: Boolean(submitOpts.forceResearch),
      researchRunAt: asNew ? null : doc.researchRunAt,
      ideaChanged: ideaChanged || asNew,
    });
    onProcessingChange?.({ busy: true, startedAt, expectedMs });
    let savedOk = false;
    let result = null;
    try {
    result = await onSave(doc, provider, {
      forceResearch: Boolean(submitOpts.forceResearch),
      asNew,
      confirmMissingSteps: repairing,
    });
    if (!result?.proposition) {
      // onSave returns null on failure and has already set the error; say so in the Submit bar too.
      setSubmitFailed(true);
      return;
    }
    savedOk = true;
    // Part 140 B — Submit saved everything, so any earlier draft failure is moot.
    clearDraftRetryTimer();
    draftErrorRef.current = "";
    setDraftError("");
    setDraftRetryNote("");
    setDraftSaveState("Draft saved");
    setLastGoodSaveAt(result.proposition.updatedAt || new Date().toISOString());
    setSubmitFailed(false);
    setDraftDirty(false);
    const saved = mergeProposition(result.proposition);
    const researchRan = Boolean(result.researchRan) || (!hadResearchRunAt && result.suggestions);
    const filled = researchRan && result.suggestions ? applyResearchResult(result, saved) : saved;
    if (result.researchError) {
      setSubmitMsg(`Your idea was saved, but the research step failed: ${String(result.researchError).replace(/[.\s]+$/, "")}.`);
      setLocalError(result.researchError);
      setFailedBanner({
        label: result.failedProviderLabel || provider || "Claude",
        provider: result.failedProvider || provider,
        body: result.researchError,
      });
    } else {
      setLocalError("");
      setFailedBanner(null);
    }
    const nextDoc = result.suggestions
      ? { ...filled, suggestions: result.suggestions }
      : filled;
    if (nextDoc.researchRunAt) setResearchKeyAtRun(researchInputKey(nextDoc));
    const mergedProp = {
      ...nextDoc,
      evaluationState: result.proposition.evaluationState,
      evaluationMissing: result.proposition.evaluationMissing,
      output: result.proposition.output ?? result.output ?? nextDoc.output,
      sealedChecks: result.proposition.sealedChecks ?? result.sealedChecks ?? nextDoc.sealedChecks,
      goNoGo: result.proposition.goNoGo ?? null,
    };
    setDoc(mergedProp);
    const checks =
      mergedProp.sealedChecks ||
      result.sealedChecks ||
      result.advisoryChecks ||
      result.proposition.advisoryChecks ||
      null;
    if (result.advisoryChecks || result.proposition.advisoryChecks) {
      setAdvisoryChecks(result.advisoryChecks || result.proposition.advisoryChecks);
    }
    setSummaryChecks(checks);
    const evalState = propositionEvalState(mergedProp);
    const savedGo =
      mergedProp.goNoGo && typeof mergedProp.goNoGo === "object" ? mergedProp.goNoGo : null;
    const ideaName = formIdeaLabel(mergedProp);
    const category = formCategoryLabel(mergedProp);
    if (evalState === "evaluated" || evalState === "legacy") {
      const nextGo = goNoGoFromSealed(mergedProp, savedGo) || savedGo;
      setGoNoGo(
        nextGo
          ? {
              ...nextGo,
              ideaName: nextGo.ideaName || ideaName,
              category: nextGo.category || category,
            }
          : null
      );
      setCurrentView("goNoGoResult");
    } else {
      setGoNoGo(null);
      setCurrentView("goNoGoResult");
    }
    setJustSubmitted(true);
    setSummaryStale(false);
    sourceDocRef.current = mergedProp;
    } finally {
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      onProcessingChange?.({ busy: false });
      const durationId = result?.proposition?.id || propositionId;
      if (persistDuration && savedOk && durationId) {
        setDoc((prev) => ({ ...prev, researchDurationMs: elapsedMs }));
        fetch(`/api/propositions/${encodeURIComponent(durationId)}/go-nogo`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationOnly: true, researchDurationMs: elapsedMs }),
        }).catch(() => {});
      }
    }
  }

  const outputEvalState = propositionEvalState(doc);
  const evaluationMissingList =
    (Array.isArray(doc.evaluationMissing) && doc.evaluationMissing.length
      ? doc.evaluationMissing
      : computeEvaluationStatus(doc).missing) || [];
  const evalProgressStatus = computeEvaluationStatus(doc);
  const evalProgressLabel =
    evalProgressStatus.required.length
      ? `${evalProgressStatus.done.length} of ${evalProgressStatus.required.length} steps done`
      : saving
        ? "Running evaluation…"
        : "";

  if (currentView === "goNoGoResult") {
    if (outputEvalState === "not-evaluated" || outputEvalState === "incomplete") {
      return (
        <main className="prop-page output-page" data-view="goNoGoResult">
          <style>{PROP_CSS}</style>
          <EvaluationPendingPage
            evaluationState={outputEvalState}
            evaluationMissing={evaluationMissingList}
            missingFormInputs={listMissingFormInputs(doc)}
            doc={doc}
            ideaName={formIdeaLabel(doc)}
            category={formCategoryLabel(doc)}
            saving={saving || readingGoNoGo || Boolean(refreshingField)}
            progressLabel={evalProgressLabel}
            onBack={() => setCurrentView("propositionForm")}
            onEvaluate={() => handleSubmit()}
            onRetryStep={(entry) => handleRetryFilter(evaluationStepFilterKey(entry?.step))}
            onConfirmField={(fieldPath) => {
              const [filterKey, fieldKey] = String(fieldPath || "").split(".");
              if (filterKey && fieldKey) confirmAiField(filterKey, fieldKey);
            }}
            onEditField={() => setCurrentView("propositionForm")}
          />
        </main>
      );
    }
    if (goNoGo?.classification || outputEvalState === "legacy" || outputEvalState === "evaluated") {
      const sealedOutput = doc.output || doc.goNoGo?.output || null;
      const displayGo =
        goNoGoFromSealed(doc, goNoGo) ||
        goNoGo || {
          classification: sealedOutput?.classification,
          rationale: sealedOutput?.rationale,
          score: sealedOutput?.score,
          at: sealedOutput?.sealedAt,
        };
      const displayChecks = summaryChecks || sealedChecksForDoc(doc) || {};
      return (
        <main className="prop-page output-page" data-view="goNoGoResult">
          <style>{PROP_CSS}</style>
          <GoNoGoResultPage
            key={displayGo.at || displayGo.classification}
            result={displayGo}
            advisoryChecks={displayChecks}
            sealedOutput={sealedOutput}
            missingFormInputs={listMissingFormInputs(doc)}
            category={formCategoryLabel(doc) || displayGo.category}
            ideaName={formIdeaLabel(doc) || displayGo.ideaName}
            doc={doc}
            savedDoc={initial}
            saving={saving || readingGoNoGo}
            onBack={() => setCurrentView("propositionForm")}
            onSubmit={() => handleSubmit()}
            submitLabel={outputEvalState === "legacy" ? "Evaluate" : "Submit"}
            legacyView={outputEvalState === "legacy"}
            hideFilterCards={outputEvalState === "legacy"}
            allowPdfExport={outputEvalState === "evaluated" || outputEvalState === "legacy"}
            currentUser={currentUser}
            onRequestReview={handleRequestManagerReview}
            onApproveReview={handleApproveManagerReview}
            onRejectReview={handleRejectManagerReview}
            managerBusy={managerBusy}
            managerComment={managerComment}
            onManagerComment={setManagerComment}
            managerRejectReason={managerRejectReason}
            onManagerRejectReason={setManagerRejectReason}
            reviewAnnounce={reviewAnnounce}
            onEvidenceRescore={async (id) => {
              const res = await fetch(
                `/api/propositions/${encodeURIComponent(id)}/rescore-from-evidence`,
                {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || "Recompute failed.");
              if (data.goNoGo) {
                setGoNoGo(data.goNoGo);
                setDoc((prev) => ({
                  ...prev,
                  ...(data.proposition || {}),
                  goNoGo: data.goNoGo,
                  classification: data.goNoGo.classification,
                }));
              }
            }}
          />
        </main>
      );
    }
  }

  return (
    <main className="prop-page prop-form-page" data-view="propositionForm">
      <style>{PROP_CSS}</style>

      {outputEvalState === "evaluated" || outputEvalState === "legacy" ? (
        <div className="prop-output-return" role="region" aria-label="Saved output">
          <p>
            {openedFromLog
              ? "Opened from the log with saved inputs. Switch to the output page anytime without re-entering values."
              : "This idea already has a GO/NO-GO output. Open it without re-running research."}
          </p>
          <button
            type="button"
            className="prop-save run"
            onClick={() => setCurrentView("goNoGoResult")}
          >
            View GO/NO-GO output
          </button>
        </div>
      ) : null}

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
        {draftError ? (
          <p className="draft-saved draft-not-saved mono" data-testid="sidebar-not-saved" role="status">
            Not saved
            <br />
            {lastGoodSaveAt
              ? `Last good save ${formatSavedAt(lastGoodSaveAt) || "earlier"}`
              : "Nothing saved yet"}
          </p>
        ) : (
          <p className="draft-saved mono">
            {Number(doc.version) > 1 || doc.updatedAt
              ? `Draft saved ${formatSavedAt(lastGoodSaveAt || doc.updatedAt) || ""}`.trim()
              : "Not yet saved for the team"}
          </p>
        )}
      </aside>

      <div className="prop-form-main">
      {draftError ? (
        <div className="draft-save-banner" role="alert" data-testid="draft-save-banner">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="draft-save-banner-text">
            Your changes are NOT saved: {draftError}. {draftRetryNote}
          </span>
          <button
            type="button"
            className="draft-save-retry"
            data-testid="draft-save-retry"
            disabled={draftRetrying}
            onClick={() => performDraftSave({})}
          >
            {draftRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}
      <section className="prop-identity-strip" aria-label="Submitter">
        {PROPOSITION_TOP_FIELDS.filter((f) => f.key === "submitterName").map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            fieldPath="submitterName"
            value={doc[field.key]}
            onChange={(v) => setTop(field.key, v)}
            currentUser={currentUser}
            aiSourced={false}
            {...fieldControlExtras("", field)}
          />
        ))}
        <label className="field" htmlFor="fld-submitterDepartment">
          <span className="field-label prop-label" data-field-label="submitterDepartment">
            Your team
            <FieldRoleBadge path="submitterDepartment" doc={doc} />
          </span>
          {doc.teamIsLegacy && !isCanonicalTeam(doc.submitterDepartment) ? (
            <input
              id="fld-submitterDepartment"
              data-field="submitterDepartment"
              value={`Legacy: ${doc.submitterDepartment}`}
              disabled
              readOnly
              aria-label="Your team"
            />
          ) : (
            <select
              id="fld-submitterDepartment"
              data-field="submitterDepartment"
              value={doc.submitterDepartment || currentUser?.team || ""}
              disabled={false}
              onChange={(e) => setTop("submitterDepartment", e.target.value)}
              aria-label="Your team"
            >
              <option value="">Select team…</option>
              {SUBMITTER_DEPARTMENTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {managerReviewRequestedOn(doc) ? (
            <p className="autofill-status">A pending manager review will be re-routed if you change the team.</p>
          ) : null}
        </label>
      </section>

      {String(currentUser?.role || "") === "ADMIN" &&
      (doc.researchFindings?.autofillReport?.fields || doc.researchFindings?.autofillStatus) ? (
        <details className="ai-fill-report">
          <summary>AI fill report</summary>
          <ul>
            {Object.entries(
              doc.researchFindings?.autofillReport?.fields || doc.researchFindings?.autofillStatus || {}
            ).map(([path, entry]) => (
              <li key={path}>
                <code>{path}</code>: {entry?.status || "?"}
                {entry?.reason ? ` — ${entry.reason}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section id="the-proposition" className="prop-form-hero">
        <h1>Start with the idea</h1>
        <p>Three fields. Research fills the rest, you edit it.</p>
        <IdeaImportPanel
          result={importResult}
          setResult={setImportResult}
          llmProvider={llmProvider}
          onOpenDraft={onOpenImportedDraft}
          onSubmitIdea={onSubmitImportedIdea}
        />
        <div className="prop-label hero-label" data-field-label="name">
          <label htmlFor="fld-name">{getFieldRole("name")?.label}</label>
          <FieldRoleBadge path="name" doc={doc} />
        </div>
        <input
          id="fld-name"
          data-field="name"
          placeholder="Enter the proposition name — e.g. Herbal cooling hair oil"
          value={doc.name || ""}
          onChange={(e) => {
            setInputReviewKept((prev) => {
              const next = { ...prev };
              delete next.name;
              return next;
            });
            setTop("name", e.target.value);
          }}
          aria-label="Proposition name"
        />
        <InputReviewHint
          issue={inputReviewIssue("name")}
          onUseSuggestion={(s) => applyInputSuggestion("name", s)}
          onKeepTyped={() => keepInputTyped("name")}
        />
        <div className="prop-label hero-label" data-field-label="category">
          <label htmlFor="fld-category">{getFieldRole("category")?.label}</label>
          <span className="ai-fills-badge" data-ai-fills="category" title="The AI first pass fills this — check it or type over it">
            AI fills this
          </span>
          <FieldRoleBadge path="category" doc={doc} />
        </div>
        <input
          id="fld-category"
          data-field="category"
          className="is-ai-expected-input"
          placeholder="Enter the category — e.g. Hair oils"
          list="primus-fmcg-categories"
          value={doc.category || ""}
          onChange={(e) => {
            setInputReviewKept((prev) => {
              const next = { ...prev };
              delete next.category;
              return next;
            });
            setTop("category", e.target.value);
          }}
          aria-label="Category"
        />
        <InputReviewHint
          issue={inputReviewIssue("category")}
          onUseSuggestion={(s) => applyInputSuggestion("category", s)}
          onKeepTyped={() => keepInputTyped("category")}
        />
        <datalist id="primus-fmcg-categories">
          {FMCG_CATEGORIES.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        {(() => {
          const sp = suggestionProps("", { key: "category" }, doc.category);
          return sp.suggestion != null ? (
            <SuggestionChip
              field={{ key: "category" }}
              suggestion={sp.suggestion}
              onAccept={sp.onAcceptSuggestion}
              onDismiss={sp.onDismissSuggestion}
            />
          ) : null;
        })()}
        <div className="prop-label hero-label" data-field-label="ideaDescription">
          <label htmlFor="fld-ideaDescription">{getFieldRole("ideaDescription")?.label}</label>
          <FieldRoleBadge path="ideaDescription" doc={doc} />
        </div>
        <textarea
          id="fld-ideaDescription"
          data-field="ideaDescription"
          placeholder="Describe the product idea, or attach a PDF, Word file, or image with the insight."
          value={doc.ideaDescription || ""}
          onChange={(e) => {
            setInputReviewKept((prev) => {
              const next = { ...prev };
              delete next.ideaDescription;
              return next;
            });
            setTop("ideaDescription", e.target.value);
          }}
          aria-label="Idea / insight description"
          rows={4}
        />
        <InputReviewHint
          issue={inputReviewIssue("ideaDescription")}
          onUseSuggestion={(s) => applyInputSuggestion("ideaDescription", s)}
          onKeepTyped={() => keepInputTyped("ideaDescription")}
        />
        {(() => {
          const sp = suggestionProps("", { key: "ideaDescription", type: "textarea" }, doc.ideaDescription);
          return sp.suggestion != null ? (
            <SuggestionChip
              field={{ key: "ideaDescription", type: "textarea" }}
              suggestion={sp.suggestion}
              onAccept={sp.onAcceptSuggestion}
              onDismiss={sp.onDismissSuggestion}
            />
          ) : null;
        })()}
        <div className="prop-attach concept-card-upload">
          <input
            ref={conceptCardRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={handleConceptCardFile}
          />
          <button
            type="button"
            className="ghost"
            disabled={conceptCardBusy}
            title="PDF, Word, or Excel. Extracts only fields the document states."
            onClick={() => conceptCardRef.current?.click()}
          >
            {conceptCardBusy ? <Loader2 size={15} className="spin" /> : <FileUp size={15} />}
            Upload concept card
          </button>
          {conceptCardName ? (
            <span className="chip file prop-file-chip">
              <FileText size={15} />
              {conceptCardName}
            </span>
          ) : null}
        </div>
        {conceptCardError ? (
          <div className="prop-err">
            <AlertTriangle size={14} /> {conceptCardError}
          </div>
        ) : null}
        {conceptCardNote ? <p className="autofill-status">{conceptCardNote}</p> : null}
        <AiPassResultBanner meta={aiPassMeta} />
      </section>

      {SIX_FILTERS_FORM.map((spec) => {
        const researchPlan = planResearch(doc);
        const missingStep = researchPlan.researchState === "incomplete" && researchPlan.steps.includes(spec.key.toUpperCase());
        const unlocked = unlockedFilterKeys.has(spec.key);
        if (!unlocked && (spec.key === "f5" || spec.key === "f6")) {
          return (
            <FilterTeaserCard
              key={spec.key}
              spec={spec}
              checkLabel="Not yet run"
              sub={
                spec.key === "f5"
                  ? "Opens once the idea reads GO and proof is uploaded."
                  : "Opens together with Filter 5 after proof is uploaded."
              }
            />
          );
        }
        const values = doc[spec.key] || {};
        const check =
          spec.key === "f1" || spec.key === "f2" || spec.key === "f3" || spec.key === "f4"
            ? livePreviewChecks[spec.key]
            : advisoryChecks?.[spec.key] || livePreviewChecks[spec.key] || { checkLabel: "Not yet run", items: [] };
        const f3CheckPending = spec.key === "f3" && marginElasticityLoading;
        const rawCheckLabel = f3CheckPending ? "Calculating…" : check.checkLabel;
        const checkLabel = formShowsCheckLabel(rawCheckLabel) ? rawCheckLabel : "";
        const visibleItems = f3CheckPending ? [] : analysisCheckItems(check.items);
        const f5Sizing = spec.key === "f5"
          ? (check.items || []).find((it) => /Year-3 revenue|Sizing incomplete/i.test(it.text))
          : null;
        const collapsible = spec.key === "f2" || spec.key === "f3" || spec.key === "f4";
        const filterExpanded = !collapsible || Boolean(filterOpen[spec.key]);
        const toggleFilter = () => {
          if (!collapsible) return;
          setFilterOpen((prev) => ({ ...prev, [spec.key]: !prev[spec.key] }));
        };
        return (
          <section
            key={spec.key}
            id={spec.key}
            className={`prop-filter${spec.key === "f5" || spec.key === "f6" ? " f5f6-card" : ""}${collapsible ? " is-collapsible" : ""}${collapsible && !filterExpanded ? " is-collapsed" : ""}`}
            style={{ borderLeftColor: spec.accentBg }}
            data-filter-open={collapsible ? (filterExpanded ? "yes" : "no") : undefined}
          >
            <div
              className={`prop-filter-h${collapsible ? " is-toggle" : ""}`}
              role={collapsible ? "button" : undefined}
              tabIndex={collapsible ? 0 : undefined}
              aria-expanded={collapsible ? filterExpanded : undefined}
              onClick={collapsible ? toggleFilter : undefined}
              onKeyDown={
                collapsible
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleFilter();
                      }
                    }
                  : undefined
              }
            >
              {collapsible ? (
                <span className="prop-filter-chevron" aria-hidden="true">
                  {filterExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
              ) : null}
              <span className="prop-badge" style={{ background: spec.accentBg, color: spec.accentFg }}>
                {spec.num}
              </span>
              <div>
                <h2 className="prop-filter-title">
                  {spec.title}
                </h2>
                <p className="prop-filter-sub">{filterSubtitle(spec, doc.division)}</p>
                {spec.key === "f2" && doc.division ? (
                  <p className="prop-filter-sub">
                    {doc.researchFindings?.divisionDetection?.needsConfirmation
                      ? `Detected: ${doc.division || "—"} (to be confirmed)`
                      : doc.division === "International Business" &&
                          doc.researchFindings?.divisionDetection?.respectiveDivision
                        ? `International Business · respective division ${doc.researchFindings.divisionDetection.respectiveDivision} · locked minimum (INR at group level)`
                        : `Division: ${doc.division}`}
                    {currentUser?.role === "ADMIN" && doc.researchFindings?.divisionDetection?.source
                      ? ` · source ${doc.researchFindings.divisionDetection.source}${
                          doc.researchFindings.divisionDetection.reason
                            ? ` — ${doc.researchFindings.divisionDetection.reason}`
                            : ""
                        }`
                      : ""}
                  </p>
                ) : null}
                {spec.key === "f2" ? (
                  <div className="margin-hint-block" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <p className="prop-filter-sub">{formatMinimumMarginHint(doc)}</p>
                    {doc.researchFindings?.divisionDetection?.reason || doc.division ? (
                      <details className="why-division">
                        <summary>Why this division?</summary>
                        <p>
                          {doc.researchFindings?.divisionDetection?.needsConfirmation
                            ? `Detected: ${doc.division || "—"} (to be confirmed). `
                            : ""}
                          {doc.researchFindings?.divisionDetection?.reason ||
                            (doc.division ? `Stored division: ${doc.division}.` : "No division detected yet.")}
                        </p>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!propositionId || saving}
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                `/api/propositions/${encodeURIComponent(propositionId)}/request-division-review`,
                                {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    suggestion: "",
                                    detected: doc.division || null,
                                  }),
                                }
                              );
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data.error || "Could not notify admin.");
                              setLocalError("");
                              window.alert(data.message || "Admin notified.");
                            } catch (e) {
                              setLocalError(e.message || "Could not notify admin.");
                            }
                          }}
                        >
                          Division looks wrong? Ask the admin to change it
                        </button>
                      </details>
                    ) : null}
                    {marginBelowFloorWarning(values.netMarginAtScale ?? doc.f2?.netMarginAtScale, doc) ? (
                      <p className="margin-below-warn">
                        {marginBelowFloorWarning(values.netMarginAtScale ?? doc.f2?.netMarginAtScale, doc)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="prop-status-wrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {checkLabel ? (
                  <span className="check-pill" data-tone={toneFor(checkLabel)}>
                    Check: {checkLabel}
                  </span>
                ) : null}
                {missingStep ? (
                  <>
                    <span className="check-pill" data-tone="watch">
                      Research incomplete: {researchPlan.steps.join(", ")} did not run
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleSubmit()}
                      disabled={Boolean(refreshingField) || saving}
                    >
                      {saving ? "Evaluating…" : "Evaluate"}
                    </button>
                  </>
                ) : null}
                {checkNeedsResearchRetry(check) ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleRetryFilter(spec.key)}
                    disabled={Boolean(refreshingField) || saving}
                  >
                    {refreshingField === spec.key ? "Retrying…" : "Retry this step"}
                  </button>
                ) : null}
              </div>
            </div>
            {filterExpanded ? (
            <>
            <InlineFloorFail check={check} />
            {(spec.key === "f5" || spec.key === "f6") && evidenceF5F6Note ? (
              <p className="autofill-status">{evidenceF5F6Note}</p>
            ) : null}

            <div className="prop-grid">
              {(spec.key === "f1"
                ? (() => {
                    const has2 = Boolean(String(values.declaredAttribute2 || "").trim());
                    const has3 = Boolean(String(values.declaredAttribute3 || "").trim());
                    const show2 = has2 || has3 || benefitExtra >= 1;
                    const show3 = has3 || benefitExtra >= 2;
                    return spec.fields.filter((field) => {
                      if (field.key === "declaredAttribute2") return show2;
                      if (field.key === "declaredAttribute3") return show3;
                      return true;
                    });
                  })()
                : spec.fields
              ).flatMap((field) => {
                const nodes = [];
                if (field.type === "computed") {
                  nodes.push(
                  <div key={field.key} className="prop-field span-2" data-field={`${spec.key}.${field.key}`}>
                    <div className="prop-label" data-field-label={`${spec.key}.${field.key}`}>
                      <span>{field.label}</span>
                      <FieldRoleBadge path={`${spec.key}.${field.key}`} doc={doc} />
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
                  );
                } else {
                  nodes.push(
                  <div key={field.key} className="prop-field-wrap">
                    <FieldControl
                      field={field}
                      fieldPath={`${spec.key}.${field.key}`}
                      value={values[field.key]}
                      onChange={(v) => {
                        setInputReviewKept((prev) => {
                          const next = { ...prev };
                          delete next[field.key];
                          return next;
                        });
                        setFilter(spec.key, field.key, v);
                      }}
                      currentUser={currentUser}
                      aiSourced={Boolean(aiSourced[sourcedPath(spec.key, field.key)])}
                      fileValue={field.fileKey ? values[field.fileKey] : null}
                      onPickFile={field.fileKey ? handleEvidenceSourceFile : undefined}
                      onClearFile={field.fileKey ? clearEvidenceSourceFile : undefined}
                      fileError={field.fileKey ? evidenceFileError : ""}
                      fileBusy={field.fileKey ? saving : false}
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
                      onVerifyDimension={
                        spec.key === "f4" && field.key === "techShiftRisk" ? handleVerifyF4Dimension : undefined
                      }
                      verifyingDimension={
                        spec.key === "f4" && field.key === "techShiftRisk" ? f4VerifyingKey : ""
                      }
                      mitigationResponses={spec.key === "f4" ? values.f4MitigationResponses : null}
                      onMitigationChange={
                        spec.key === "f4" && field.key === "techShiftRisk"
                          ? (key, text) => {
                              const prevMap =
                                values.f4MitigationResponses && typeof values.f4MitigationResponses === "object"
                                  ? values.f4MitigationResponses
                                  : {};
                              setFilter("f4", "f4MitigationResponses", { ...prevMap, [key]: text });
                            }
                          : undefined
                      }
                      onUserInputChange={
                        spec.key === "f4" && field.key === "techShiftRisk"
                          ? (nextInputs) => setFilter("f4", "userInputs", nextInputs)
                          : undefined
                      }
                      rangeOverride={spec.key === "f3" ? values.f3RangeOverride : null}
                      onRangeOverride={
                        spec.key === "f3" && field.key === "marginElasticity"
                          ? (next) => setFilter("f3", "f3RangeOverride", next)
                          : undefined
                      }
                      onMrpOverrideChange={
                        spec.key === "f2" && field.key === "mrpInr"
                          ? (on) => {
                              setFilter("f2", "mrpOverride", on);
                              if (!on) {
                                // Switching back recomputes from COGS / margin / GST.
                                setDoc((prev) => ({
                                  ...prev,
                                  f2: applyDerivedMrpToF2({ ...(prev.f2 || {}), mrpOverride: false }),
                                }));
                              }
                            }
                          : undefined
                      }
                      onRefresh={
                        (spec.key === "f2" && field.key === "cogsAtScale") ||
                        (spec.key === "f3" && field.key === "marginElasticity") ||
                        (spec.key === "f4" && field.key === "techShiftRisk")
                          ? () => handleRefreshField(field.key)
                          : undefined
                      }
                      refreshing={refreshingField === field.key}
                      liveNote=""
                      breakdownNote={
                        spec.key === "f2" && field.key === "gstRatePct"
                          ? String(values.gstBasis || "").trim()
                          : ""
                      }
                      {...suggestionProps(spec.key, field, values[field.key])}
                      {...fieldControlExtras(spec.key, field)}
                    />
                    <InputReviewHint
                      issue={inputReviewIssue(field.key)}
                      onUseSuggestion={(s) => applyInputSuggestion(field.key, s)}
                      onKeepTyped={() => keepInputTyped(field.key)}
                    />
                  </div>
                  );
                }
                if (
                  spec.key === "f1" &&
                  field.key === "declaredAttribute" &&
                  !(
                    Boolean(String(values.declaredAttribute2 || "").trim()) ||
                    Boolean(String(values.declaredAttribute3 || "").trim()) ||
                    benefitExtra >= 1
                  )
                ) {
                  nodes.push(
                    <div key="add-benefit-1" className="prop-field-wrap span-2 benefit-add-wrap">
                      <button
                        type="button"
                        className="benefit-add"
                        data-testid="add-another-benefit"
                        onClick={() => setBenefitExtra((n) => Math.min(2, Math.max(1, n + 1)))}
                      >
                        + Add another benefit
                      </button>
                    </div>
                  );
                } else if (
                  spec.key === "f1" &&
                  field.key === "declaredAttribute2" &&
                  !(
                    Boolean(String(values.declaredAttribute3 || "").trim()) ||
                    benefitExtra >= 2
                  )
                ) {
                  nodes.push(
                    <div key="add-benefit-2" className="prop-field-wrap span-2 benefit-add-wrap">
                      <button
                        type="button"
                        className="benefit-add"
                        data-testid="add-another-benefit"
                        onClick={() => setBenefitExtra(2)}
                      >
                        + Add another benefit
                      </button>
                    </div>
                  );
                }
                return nodes;
              })}
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
            </>
            ) : null}
          </section>
        );
      })}

      {unlockHint && !f5Unlocked && !justSubmitted ? <p className="unlock-hint">{unlockHint}</p> : null}

      {liveDoc.goNoGo?.classification === "WATCH" || hasManagerApproval(liveDoc) ? (
        <ManagerReviewPanel
          classification={liveDoc.goNoGo?.classification}
          scorePct={liveDoc.goNoGo?.score?.pct}
          review={doc.managerReview}
          doc={liveDoc}
          currentUser={currentUser}
          onRequest={handleRequestManagerReview}
          onApprove={handleApproveManagerReview}
          onReject={handleRejectManagerReview}
          busy={managerBusy}
          comment={managerComment}
          onComment={setManagerComment}
          rejectReason={managerRejectReason}
          onRejectReason={setManagerRejectReason}
          slackNotice={slackNotice}
          onDismissSlack={() => setSlackNotice("")}
          announcePreview={reviewAnnounce || doc.managerReview?.announce || ""}
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

      {(error || localError) ? (
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
      </section>
      ) : null}
      </div>
      </div>

      {whyBlockedOpen ? (
        <div className="why-blocked-panel" role="dialog" aria-label="Why you cannot submit" data-testid="why-blocked-panel">
          <h3>Why can't I submit?</h3>
          {submitBlockers.length ? (
            <ul>
              {submitBlockers.map((w) => (
                <li key={w.id} data-blocking={w.blocking ? "yes" : "no"}>
                  {w.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="why-note">Nothing is blocking you. Press Submit for verdict.</p>
          )}
          <button type="button" className="ghost" onClick={() => setWhyBlockedOpen(false)}>
            Close
          </button>
        </div>
      ) : null}

      <div className="submit-bar">
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.pct}%` }} /></div>
        <span className="submit-bar-message" data-testid="submit-bar-message">{submitBarMessageTwoLabels(doc)}</span>
        <span className="mono field-list">{progress.missingFieldLabels.join(" · ")}</span>
        {liveInputReview.fields.length ? (
          <span className="mono field-list" title={liveInputReview.fields.map((f) => f.message).join(" ")}>
            {liveInputReview.fields.filter((f) => f.status === "invalid").length
              ? `${liveInputReview.fields.filter((f) => f.status === "invalid").length} invalid input(s) block Submit`
              : `${liveInputReview.fields.length} input warning(s)`}
          </span>
        ) : null}
        <span className={`save-state${draftError ? " save-state-bad" : ""}`} data-testid="save-state">
          v{doc.version || 1} ·{" "}
          {draftError
            ? "Not saved"
            : draftSaveState || (Number(doc.version) > 1 || doc.updatedAt ? "saved for the team" : "not yet saved for the team")}
        </span>
        {submitBarError ? (
          <span className="submit-bar-error" data-testid="submit-bar-error" role="alert">
            {submitBarError}
          </span>
        ) : null}
        {!canSubmit || !hasIdentity || draftError ? (
          <button
            type="button"
            className="why-blocked-btn ghost"
            data-testid="why-cant-submit"
            aria-expanded={whyBlockedOpen}
            onClick={() => {
              setPressedBlocked(true);
              setWhyBlockedOpen((open) => !open);
            }}
          >
            Why can't I submit?
          </button>
        ) : null}
        <button
          type="button"
          className={canSubmit && hasIdentity ? undefined : "submit-blocked"}
          onClick={() => handleSubmit()}
          disabled={saving || readingGoNoGo || !canSubmit || marginElasticityLoading}
          title={
            !hasIdentity
              ? "Enter your name and department before Submit"
              : inputBlocking
              ? liveInputReview.fields
                  .filter((f) => f.status === "invalid")
                  .map((f) => f.message)
                  .join(" ")
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
      </div>
    </main>
  );
}

export const PROP_CSS = `
${IDEA_IMPORT_CSS}
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
  --chip-review-bg:#E5E8EC; --chip-review-fg:#3A4A5C;
  --floor-fail-bg:#2a1220; --floor-fail-border:#7f2547; --floor-fail-text:#fda4c0; --floor-fail-body:#e8c9d7;
  /* Part 143 D88 — type scale and colours */
  --fs-section:22px; --c-section:#ddd6fe;
  --fs-status:13px; --c-status:#c4b5d8; --c-error:#fda4c0;
  --fs-label:16px; --c-label:#f6eefb;
  --fs-input:15px; --c-input:#efe8f5;
  --fs-placeholder:15px; --c-placeholder:#9a89ae;
  --fs-badge:12px; --c-required:#f5b562; --c-optional:#b9a9cc;
  --gap-label:8px; --gap-field:22px; --h-input:44px;
  font-family:'Sora',system-ui,sans-serif;
  background:var(--bg); color:var(--ink);
  max-width:none; margin:0; padding:20px 24px 80px;
}
.prop-form-page .mono{font-family:'IBM Plex Mono',monospace;}
.prop-output-return{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;
  margin:0 0 16px;padding:12px 16px;border-radius:14px;
  background:rgba(90,46,166,.18);border:1px solid rgba(201,160,232,.35);color:var(--ink);
}
.prop-output-return p{margin:0;font-size:13.5px;line-height:1.45;color:var(--ink-muted-85);max-width:52rem;}
.prop-output-return .prop-save{margin:0;white-space:nowrap;}
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
  width:100%;min-height:var(--h-input);background:var(--input-bg);border:1px solid var(--input-border);border-radius:12px;
  color:var(--c-input);font-family:inherit;font-size:var(--fs-input);font-weight:400;padding:11px 13px;outline:none;box-sizing:border-box;}
.prop-form-page input::placeholder,.prop-form-page textarea::placeholder{
  color:var(--c-placeholder);font-size:var(--fs-placeholder);font-weight:400;opacity:1;}
.prop-form-page textarea{min-height:84px;resize:vertical;}
.inline-floor-fail{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:var(--floor-fail-bg);border:1px solid var(--floor-fail-border);}
.inline-floor-fail .fail-title{font-weight:700;color:var(--floor-fail-text);margin:0 0 6px;font-size:13.5px;}
.inline-floor-fail p{margin:0;color:var(--floor-fail-body);font-size:13px;line-height:1.45;}
.teaser-card{display:flex;align-items:center;gap:14px;background:var(--f5f6-card-bg);border:1px dashed var(--f5f6-card-border);border-radius:16px;padding:16px 18px;}
.teaser-card .check-pill{margin-left:auto;flex-shrink:0;}
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
/* Part 140 B (D64) — a blocked Submit keeps its full colour; the reason is in the bar and under "Why can't I submit?". */
.submit-bar button.submit-blocked:disabled{opacity:1;cursor:help;}
.submit-bar .why-blocked-btn{margin-left:0;background:transparent;border:1px solid var(--header-border);color:var(--ink);padding:8px 14px;font-size:13px;font-weight:600;}
.submit-bar .save-state-bad{color:#ff9d9d;font-weight:700;}
.submit-bar .submit-bar-error{flex:1 1 100%;order:-1;font-size:13px;line-height:1.4;color:#ffb4b4;
  border:1px solid rgba(255,120,120,.45);background:rgba(120,20,20,.25);border-radius:8px;padding:8px 12px;}
.why-blocked-panel{position:fixed;right:24px;bottom:92px;z-index:41;max-width:min(460px,calc(100vw - 48px));
  background:var(--header-bg);border:1px solid var(--header-border);border-radius:12px;padding:14px 16px;color:var(--ink);
  box-shadow:0 12px 32px rgba(8,4,16,.45);font-size:13px;line-height:1.45;}
.why-blocked-panel h3{margin:0 0 8px;font-size:14px;}
.why-blocked-panel ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;}
.why-blocked-panel .why-note{color:var(--ink-muted-2);}
.draft-save-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:12px 14px;border-radius:10px;
  border:1px solid rgba(255,120,120,.6);background:rgba(120,20,20,.35);color:#ffd4d4;font-size:13.5px;line-height:1.4;}
.draft-save-banner .draft-save-banner-text{flex:1 1 260px;min-width:0;overflow-wrap:anywhere;}
.draft-save-retry{background:#ffd4d4;color:#3a0d0d;border:none;border-radius:999px;padding:7px 16px;font-weight:700;cursor:pointer;font-family:inherit;}
.draft-save-retry:disabled{opacity:.6;cursor:wait;}
.draft-not-saved{color:#ff9d9d;font-weight:700;}
.prop-page{max-width:1080px;margin:0 auto;padding:0 28px 40px;color:#F3EAF8;}
.prop-page.prop-form-page{max-width:none;margin:0;padding:20px 24px 80px;color:var(--ink);}
.prop-page.output-page{max-width:none;margin:0;min-height:calc(100vh - 88px);padding:8px 32px 40px;}
.prop-top{background:#191919;border:1px solid rgba(243,234,248,.12);
  border-radius:16px;padding:18px 20px 16px;margin:0 0 22px;box-shadow:0 12px 32px rgba(8,4,16,.35);}
.prop-version{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.55);margin:0 0 14px;}
.prop-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap-field) 16px;}
.prop-idea-block{display:flex;flex-direction:column;gap:10px;}
.prop-field{display:flex;flex-direction:column;gap:var(--gap-label);margin:0;}
.prop-field-inner{display:flex;flex-direction:column;gap:var(--gap-label);}
.prop-field.span-2,.prop-check.span-2,.span-2,.benefit-add-wrap{grid-column:1 / -1;}
.prop-label{font-family:'Sora',system-ui,sans-serif;font-size:var(--fs-label);font-weight:600;letter-spacing:0;color:var(--c-label);display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;min-width:0;}
.prop-label label,.prop-label > span:first-child{font:inherit;color:inherit;min-width:0;overflow-wrap:anywhere;}
.prop-filter-title{font-size:var(--fs-section);font-weight:600;color:var(--c-section);margin:0;}
.prop-filter-sub{font-size:var(--fs-status);font-weight:400;color:var(--ink-secondary);margin:4px 0 0;line-height:1.4;}
.benefit-add{display:inline-flex;align-items:center;gap:6px;margin:0;padding:8px 0;background:none;border:none;color:#c4b5fd;font-family:inherit;font-size:var(--fs-status);font-weight:500;cursor:pointer;text-align:left;flex-wrap:wrap;}
.benefit-add:hover{text-decoration:underline;}
${FIELD_ROLE_CSS}
.submit-bar .submit-bar-message{flex:1 1 260px;min-width:0;font-size:var(--fs-status);line-height:1.4;}
.autofill-status{margin-top:4px;font-size:var(--fs-status);font-weight:400;line-height:1.35;color:var(--c-status);}
.autofill-status[data-tone="ai"]{color:var(--c-status);}
.autofill-status[data-tone="edited"]{color:#93c5fd;}
.autofill-status[data-tone="na"]{color:var(--c-required);}
.autofill-status .ghost-link{margin-left:8px;font-size:var(--fs-status);color:#c4b5fd;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;}
.prop-err,.derived-note.error{color:var(--c-error);}
.ai-fill-report{margin:12px 0 20px;padding:10px 12px;border:1px solid rgba(201,160,232,.25);border-radius:8px;font-size:12px;color:#c4b5d8;}
.ai-fill-report summary{cursor:pointer;font-weight:600;color:#E8D5F5;}
.ai-fill-report ul{margin:8px 0 0;padding-left:18px;}
.ai-fill-report li{margin:4px 0;}
.ai-sourced-tag{display:inline-block;margin-top:4px;font-family:var(--fm);font-size:10.5px;letter-spacing:.04em;
  color:#C9A0E8;background:rgba(201,160,232,.12);border:1px solid rgba(201,160,232,.28);
  border-radius:999px;padding:3px 8px;width:fit-content;}
.ai-fills-badge{display:inline-block;margin-left:2px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;
  letter-spacing:.02em;color:#c4b5fd;border:1px solid rgba(196,181,253,.55);background:rgba(139,92,246,.16);
  white-space:nowrap;}
.prop-field.is-ai-expected,.prop-check.is-ai-expected{border-radius:12px;padding:10px 12px;margin:-2px -4px 0;
  background:rgba(139,92,246,.07);border:1px solid rgba(196,181,253,.28);}
.prop-field.is-ai-expected input,.prop-field.is-ai-expected select,.prop-field.is-ai-expected textarea,
.prop-form-page input.is-ai-expected-input{
  border-color:rgba(196,181,253,.55);background:rgba(139,92,246,.1);}
.prop-filter.is-collapsible .prop-filter-h.is-toggle{cursor:pointer;user-select:none;}
.prop-filter-chevron{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  flex-shrink:0;color:var(--c-section,#ddd6fe);margin-top:6px;}
.prop-filter.is-collapsed .prop-filter-h{margin-bottom:0;}
.prop-filter.is-collapsed{padding-bottom:14px;}
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
.f3-inflation-label{display:flex;flex-direction:column;gap:6px;margin:10px 0 8px;font-family:var(--fm);
  font-size:11px;letter-spacing:.04em;color:rgba(243,234,248,.72);font-weight:600;}
.f3-inflation-label input{font-weight:500;letter-spacing:0;}
.f3-cliff-preview{margin:8px 0 4px;padding:10px 12px;border-radius:10px;
  border:1px solid rgba(232,181,99,.28);background:rgba(232,181,99,.08);}
.f3-cliff-list{margin:6px 0 0;padding:0 0 0 18px;font-size:13px;line-height:1.45;color:rgba(243,234,248,.85);}
.f3-cliff-list li+li{margin-top:4px;}
.price-events-register{margin:8px 0 0;padding:0 0 0 18px;font-size:12.5px;line-height:1.45;color:rgba(243,234,248,.78);}
.f4-dimension-editor{display:flex;flex-direction:column;gap:12px;margin:8px 0 12px;}
.f4-dimension-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;align-items:start;
  padding:10px 12px;border:1px solid rgba(243,234,248,.12);border-radius:10px;background:rgba(0,0,0,.18);}
.f4-dimension-row .dimension-response-label{grid-column:1 / -1;font-size:13px;font-weight:600;color:rgba(243,234,248,.9);}
.f4-dimension-block{display:flex;flex-direction:column;gap:6px;min-width:0;}
.f4-block-title{font-family:var(--fm);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:rgba(243,234,248,.62);}
.f4-dimension-row select{width:100%;min-height:42px;}
.f4-dimension-row textarea{width:100%;min-height:52px;}
.f4-dimension-row .dimension-finding{overflow-wrap:anywhere;}
.f4-dimension-row > .dimension-finding{grid-column:1 / -1;}
.f4-check-again{align-self:flex-start;}
@media (max-width:720px){.f4-dimension-row{grid-template-columns:minmax(0,1fr);}}
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
.web-check-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}
.web-check-line{font-size:12.5px;line-height:1.5;color:rgba(243,234,248,.78);overflow-wrap:anywhere;}
.web-check-line a{color:#C9A0E8;margin-left:6px;text-decoration:underline;}
.output-page .f4-analysis-dims{margin-top:12px;}
.output-page .f4-analysis-dims li{font-size:13.5px;line-height:1.5;color:var(--ink-muted-85);}
.ai-wand{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;color:#C9A0E8;
  vertical-align:middle;flex-shrink:0;}
.ai-wand svg{display:block;}
.prop-field.is-ai input,.prop-field.is-ai select,.prop-field.is-ai textarea{
  border-color:rgba(201,160,232,.45);}
.prop-helper{display:block;font-size:11.5px;color:rgba(243,234,248,.48);line-height:1.4;white-space:normal;}
.prop-attach{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:8px;}
.prop-attach .ghost{padding:8px 12px;font-size:12.5px;}
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
.prop-notice{display:flex;align-items:center;gap:8px;margin:10px 0 0;padding:10px 14px;border-radius:10px;
  background:var(--chip-review-bg, #E5E8EC);color:var(--chip-review-fg, #3A4A5C);font-size:13px;line-height:1.4;}
.prop-notice span{flex:1;}
.prop-notice button{border:none;background:transparent;color:inherit;cursor:pointer;display:inline-flex;padding:2px;}
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
}
.output-page .mono{font-family:'JetBrains Mono',monospace;}
.prop-page.output-page{color:var(--ink);}
.output-meta{
  display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 16px;
  padding:10px 14px;margin:0 0 16px;
  background:var(--header-bg);border:1px solid var(--header-border);border-radius:12px;
  font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted);
}
.output-hero-row{
  display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;margin:0 0 20px;
  align-items:stretch;min-height:11.25rem;position:relative;z-index:1;
}
.gonogo-hero{
  display:flex;align-items:flex-start;justify-content:space-between;gap:20px;
  padding:24px 22px;border-radius:18px;margin:0;min-height:11.25rem;height:100%;
  background:var(--hero-bg);border:1px solid var(--hero-border);
  position:relative;z-index:1;isolation:isolate;
}
.gonogo-hero-copy{min-width:0;flex:1;}
.output-page h1.gonogo-idea{margin:0 0 10px;font-size:26px;font-weight:700;letter-spacing:-.4px;line-height:1.2;color:var(--ink);}
.gonogo-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}
.badge-chip{
  background:var(--badge-chip-bg);color:var(--badge-chip-text);
  border-radius:999px;padding:4px 10px;font-size:11px;letter-spacing:.04em;
}
.gonogo-badge-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;}
.gonogo-scale-chip{
  display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:700;letter-spacing:.04em;
  padding:6px 12px;border-radius:999px;background:var(--badge-chip-bg);color:var(--badge-chip-text);
}
.gonogo-scale-chip[data-provisional="true"]{opacity:.95;}
.provisional-tag{
  font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--watch);opacity:.9;
}
.gonogo-scale-derivation{margin:0 0 12px;font-size:12.5px;line-height:1.45;color:var(--ink-muted);}
.field-refresh{
  display:inline-flex;align-items:center;gap:6px;margin-left:8px;
  border:1px solid rgba(201,174,239,.35);background:transparent;color:#C9AEEF;
  border-radius:999px;padding:4px 10px;font-size:11px;font-family:inherit;cursor:pointer;
}
.field-refresh:disabled{opacity:.55;cursor:not-allowed;}
.concept-card-upload{align-items:flex-start;}
.concept-card-upload .prop-helper{margin:0;max-width:420px;}
.gonogo-badge{
  display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;
  padding:6px 12px;border-radius:999px;margin:0;
}
.gonogo-badge.tone-pass{background:rgba(126,224,168,.16);color:var(--pass);}
.gonogo-badge.tone-watch{background:rgba(240,193,75,.16);color:var(--watch);}
.gonogo-badge.tone-incomplete{background:rgba(180,160,90,.18);color:#d4c48a;border:1px solid rgba(180,160,90,.35);}
.gonogo-badge.tone-fail{background:var(--nogo-bg);color:var(--nogo-text);border:1px solid var(--nogo-border);}
.gonogo-hero.tone-incomplete{border-color:rgba(180,160,90,.35);}
.gonogo-rescore-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;}
.path-gain{margin-left:auto;flex-shrink:0;opacity:.95;color:var(--watch,#f0c14b);font-weight:600;}
.path-action-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.path-why{display:block;font-size:11px;line-height:1.35;opacity:.72;margin-top:2px;}
.input-review-hint{margin:.35rem 0 .55rem;padding:.45rem .65rem;border-radius:6px;font-size:12px;line-height:1.4;
  display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;}
.input-review-hint.is-invalid{background:rgba(180,40,40,.12);border:1px solid rgba(180,40,40,.35);color:#7a1f1f;}
.input-review-hint.is-fix{background:rgba(160,110,20,.1);border:1px solid rgba(160,110,20,.35);color:#6a4a10;}
.input-review-actions{display:inline-flex;gap:6px;flex-wrap:wrap;}
.input-review-actions button{font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid currentColor;
  background:transparent;cursor:pointer;}
.input-review-actions button:hover{opacity:.85;}
.prop-field-wrap{display:contents;}
.field-review-msg{margin:4px 0 0;font-size:12px;line-height:1.4;color:#f0a8a8;}
.field-review-msg[data-status="warn"]{color:#e6c07b;}
.field-review-actions{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;}
.field-review-actions button{font-size:11px;padding:2px 8px;}
.path-top-list li{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;}
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
  border-radius:18px;padding:20px 18px;height:100%;
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
.filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 22px;align-items:stretch;}
.filter-status-card{
  background:var(--card-bg);border:1px solid var(--card-border);border-left-width:4px;
  border-radius:16px;padding:16px 16px 14px;height:100%;
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
.filter-status-card p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-secondary);}
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
.evaluation-pending-page .gonogo-pending-title{margin:12px 0 8px;font-size:20px;font-weight:700;color:var(--ink);}
.evaluation-missing-list{margin:16px 0 0;padding-left:20px;color:var(--ink-muted-85);}
.evaluation-missing-list li{margin:10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
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
  border-radius:16px;padding:18px 20px 16px;margin:0;}
.prop-filter.is-locked{opacity:.78;}
.prop-filter-h{display:flex;align-items:flex-start;gap:12px;margin:0 0 14px;}
.prop-badge{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-family:var(--fm);
  font-size:13px;font-weight:700;flex-shrink:0;}
.prop-form-page .prop-filter-title{margin:0;font-size:var(--fs-section);font-weight:600;letter-spacing:-.3px;color:var(--c-section);}
.prop-form-page .prop-filter-sub{margin:4px 0 0;font-size:var(--fs-status);font-weight:400;color:var(--ink-secondary);line-height:1.4;}
.prop-status-wrap{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;}
.filter-score{font-family:var(--fm);font-size:11px;color:rgba(243,234,248,.7);}
.evidence-line{margin:8px 0 0;font-size:12px;line-height:1.45;color:rgba(243,234,248,.62);}
.score-explainer{margin:18px 0 8px;padding:14px 16px;border:1px solid rgba(243,234,248,.12);border-radius:12px;}
.score-explainer h2{margin:0 0 8px;font-size:16px;}
.score-explainer h3{margin:10px 0 4px;font-size:13px;}
.score-explainer p{margin:0;font-size:13px;line-height:1.45;color:rgba(243,234,248,.78);}
.filter-check-list{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}
.filter-check-list li{font-size:12.5px;line-height:1.4;color:rgba(243,234,248,.78);padding-left:16px;position:relative;}
.filter-check-list li::before{content:"";position:absolute;left:0;top:6px;width:7px;height:7px;border-radius:50%;background:rgba(232,181,99,.75);}
.filter-check-list li[data-status="done"]::before{background:#7EDCA8;}
.check-pill{font-family:var(--fm);font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:5px 10px;border-radius:999px;white-space:nowrap;}
.check-pill[data-tone="pass"]{color:var(--pass);background:rgba(var(--pass-rgb),.16);}
.check-pill[data-tone="fail"]{color:var(--fail);background:rgba(var(--fail-rgb),.16);}
.check-pill[data-tone="watch"]{color:var(--watch);background:rgba(232,181,99,.16);}
.check-pill[data-tone="idle"]{color:rgba(243,234,248,.55);background:rgba(243,234,248,.08);}
.prop-cross{margin:12px 0 4px;padding:8px 12px;border-radius:10px;font-size:12.5px;
  background:rgba(232,181,99,.1);color:#E8B563;border:1px dashed rgba(232,181,99,.4);}
.prop-computed{background:#22113A;border:1px solid rgba(243,234,248,.14);border-radius:12px;padding:12px 14px;
  display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;}
.prop-computed.is-empty{color:rgba(243,234,248,.45);font-size:13.5px;}
@media (max-width:1099px){
  .prop-form-page .prop-grid{grid-template-columns:1fr;}
}
@media (max-width:760px){
  .prop-grid{grid-template-columns:1fr;}
  .prop-top{position:static;}
  .prop-page{padding:0 16px 40px;}
  .prop-form-shell{grid-template-columns:1fr;}
  .prop-sidebar{position:static;}
  .prop-identity-strip{grid-template-columns:1fr;}
  .prop-page.prop-form-page{margin:0;padding:16px 16px 96px;}
  .prop-page.output-page{margin:0;padding:8px 16px 32px;}
  .submit-bar{padding:10px 16px 12px;}
  .prop-check{flex-wrap:wrap;}
  .prop-label{align-items:flex-start;}
  .field-role{flex:1 1 100%;margin-left:0;margin-top:4px;}
  .benefit-add{width:100%;}
}
`;
