/**
 * Full-detail Log Excel export. Browser-safe (SheetJS).
 */
import * as XLSX from "xlsx";
import { closestPathToGo, computeImprovementPointValues } from "./improvementPoints.js";
import { uiResearchState } from "./researchProgress.js";
import { computeIdeaRevenueCr, ideaScaleFromDoc, ideaSizeForResult } from "./ideaScale.js";
import { TECH_SHIFT_DIMENSIONS, effectiveDimensionRisk, effectiveOverallRisk } from "./techShiftRisk.js";
import { reviewDisplayState } from "./managerReview.js";
import { getFieldRole, roleLabel } from "./fieldRoles.js";
import { escapeFormulaText } from "./spreadsheetSafe.js";
import { SCREENING_VERDICT_LABEL } from "./researchFailureCopy.js";

/** Display name for the classification column. The Excel key stays "classification" so import still matches. */
export const CLASSIFICATION_EXPORT_LABEL = SCREENING_VERDICT_LABEL;

export const FULL_EXPORT_COLUMNS = [
  "id",
  "name",
  "category",
  "division",
  "submitterName",
  "submitterDepartment",
  "ideaDescription",
  "version",
  "createdAt",
  "updatedAt",
  "f1.declaredAttribute",
  "f1.declaredAttribute2",
  "f1.declaredAttribute3",
  "f1.benchmark",
  "f1.declaredGap",
  "f1.gapDerivation",
  "f1.parityExceptions",
  "f1.targetConsumer",
  "f1.growthRoute",
  "f1.growthArgument",
  "f1.evidenceSourceLink",
  "f1.pureCommodity",
  "f1.checkLabel",
  "f1.narrative",
  "f1.nielsenMatchedOn",
  "f1.kantarMatchedOn",
  "f1.searchesUsed",
  "f1.sourceCount",
  "f1.evidenceAsOf",
  "f1.cacheHit",
  "f2.cogsAtScale",
  "f2.netMarginAtScale",
  "f2.gstRatePct",
  "f2.grammage",
  "f2.mrpInr",
  "f2.qcomTrajectory",
  "f2.financeSigned",
  "f2.checkLabel",
  "f2.narrative",
  "f2.nielsenMatchedOn",
  "f2.kantarMatchedOn",
  "f2.searchesUsed",
  "f2.sourceCount",
  "f2.evidenceAsOf",
  "f2.cacheHit",
  "f3.plannedAnnualIncreasePct",
  "f3.minMrpInr",
  "f3.maxMrpInr",
  "f3.checkLabel",
  "f3.narrative",
  "f3.nielsenMatchedOn",
  "f3.kantarMatchedOn",
  "f3.searchesUsed",
  "f3.sourceCount",
  "f3.evidenceAsOf",
  "f3.cacheHit",
  // Filter 4 — the person's own rating and view for each point (the same columns the upload template has).
  ...TECH_SHIFT_DIMENSIONS.flatMap((k) => [`f4.userInputs.${k}.rating`, `f4.userInputs.${k}.pov`, `f4.f4MitigationResponses.${k}`]),
  "f4.functionalCoreStability",
  "f4.consumptionContextStability",
  "f4.manufacturingDisruptionRisk",
  "f4.userHabitShiftPotential",
  "f4.adjacentSubstitutionThreat",
  "f4.purchaseFrequencyShift",
  "f4.regulatoryDisruptionRisk",
  "f4.overallRisk",
  "f4.checkLabel",
  "f4.narrative",
  "f4.nielsenMatchedOn",
  "f4.kantarMatchedOn",
  "f4.searchesUsed",
  "f4.sourceCount",
  "f4.evidenceAsOf",
  "f4.cacheHit",
  "f5.householdsReachedY3Mn",
  "f5.trialRatePct",
  "f5.repeatConversionPct",
  "f5.purchaseFrequencyYr",
  "f5.avgPackValueInr",
  "f5.computedRevenue",
  "f5.cmiSigned",
  "f5.nielsenMatchedOn",
  "f5.kantarMatchedOn",
  "f5.searchesUsed",
  "f5.sourceCount",
  "f5.evidenceAsOf",
  "f5.cacheHit",
  "f5.checkLabel",
  "f6.labGap",
  "f6.consumerPanelBeaters",
  "f6.packStandout",
  "f6.bmAttendedAll30",
  "f6.forumVerdict",
  "classification",
  "researchState",
  "scorePercent",
  "closestPathToGo",
  "ideaSizeTier",
  "ideaSizeEstimatedOrConfirmed",
  "managerReviewComment",
  "managerApprovedBy",
  "managerReviewStatus",
  "managerReviewDecisionBy",
  "managerReviewDecisionDate",
  "managerReviewDecisionComment",
  "finalSummaryText",
  "finalSummaryBusinessImpact",
];

const ALIASES = {
  "f1.evidenceSourceLink": ["f1.evidenceSourceDate", "f1.evidenceSourceLink"],
  "f3.minMrpInr": ["f3.marginElasticity.minMrpInr", "f3.minMrpInr"],
  "f3.maxMrpInr": ["f3.marginElasticity.maxMrpInr", "f3.maxMrpInr"],
  "f5.cmiSigned": ["f5.cmiHeadSigned", "f5.cmiSigned"],
  "f6.labGap": ["f6.labGapVsBenchmark", "f6.labGap"],
  "f6.packStandout": ["f6.packStandoutGap", "f6.packStandout"],
  classification: ["goNoGo.classification", "classification"],
  scorePercent: ["goNoGo.score.pct", "score.pct", "scorePercent"],
  managerReviewComment: ["managerReview.comment", "managerApproval.comment", "managerReviewComment"],
  managerApprovedBy: ["managerReview.managerName", "managerApproval.managerName", "managerApprovedBy"],
  managerReviewStatus: ["managerReviewExport.status", "managerReviewStatus"],
  managerReviewDecisionBy: ["managerReviewExport.decisionBy", "managerReviewDecisionBy"],
  managerReviewDecisionDate: ["managerReviewExport.decisionDate", "managerReviewDecisionDate"],
  managerReviewDecisionComment: ["managerReviewExport.comment", "managerReviewDecisionComment"],
  finalSummaryText: ["finalSummary.summaryText", "finalSummaryText"],
  finalSummaryBusinessImpact: ["finalSummary.expectedBusinessImpact", "finalSummaryBusinessImpact"],
};

export function getNestedValue(obj, path) {
  if (obj == null || path == null || path === "") return undefined;
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function firstNested(obj, paths) {
  for (const path of paths) {
    const value = getNestedValue(obj, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asCell(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Part 140 D69 — a text cell that starts = + @ - must not run as a formula in Excel.
  if (Array.isArray(value)) {
    return escapeFormulaText(value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" · "));
  }
  if (typeof value === "object") return escapeFormulaText(JSON.stringify(value));
  return escapeFormulaText(value);
}

function formatDimension(dim, typedResponse = "") {
  if (!dim || typeof dim !== "object") return "";
  const risk = effectiveDimensionRisk(dim) || dim.risk || "";
  const parts = [];
  if (risk) parts.push(risk);
  if (dim.reason) parts.push(String(dim.reason).trim());
  const response = String(typedResponse || dim.userResponse || "").trim();
  if (response) parts.push(`Response: ${response}`);
  if (dim.reassessedRisk) {
    const after = dim.reassessedReason
      ? `After response: ${dim.reassessedRisk} — ${dim.reassessedReason}`
      : `After response: ${dim.reassessedRisk}`;
    parts.push(after);
  }
  return parts.filter(Boolean).join(" | ");
}

function checkLabelOf(prop, key) {
  const checks = prop.advisoryChecks || {};
  const labels = prop.goNoGo?.checkLabels || prop.checkLabels || {};
  const raw = checks[key]?.checkLabel ?? labels[key];
  return typeof raw === "string" ? raw : raw?.checkLabel || "";
}

function evidenceCells(prop, key) {
  const evidence = prop.researchFindings?.[key]?.evidence || {};
  return {
    [`${key}.nielsenMatchedOn`]: evidence.nielsenMatchedOn || "",
    [`${key}.kantarMatchedOn`]: evidence.kantarMatchedOn || "",
    [`${key}.searchesUsed`]: evidence.searchesUsed ?? "",
    [`${key}.sourceCount`]: evidence.sourceCount ?? "",
    [`${key}.evidenceAsOf`]: evidence.asOf || "",
    [`${key}.cacheHit`]: evidence.cacheHit === true ? "Yes" : evidence.cacheHit === false ? "No" : "",
  };
}

function narrativeOf(prop, key) {
  return String(prop.goNoGo?.filterNarratives?.[key] || prop.filterNarratives?.[key] || "").trim();
}

function pathToGoCopy(prop) {
  const checks = prop.advisoryChecks || {};
  const items = computeImprovementPointValues(checks);
  const sealed = prop.goNoGo?.score || prop.score || null;
  const path = closestPathToGo(checks, items, sealed);
  if (path.reachesGo && !path.items.length) return "Already above GO";
  return (path.items || [])
    .map((it) => String(it?.text || it || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function ideaSizeCells(prop) {
  if (String(prop?.goNoGo?.classification || "").trim() === "INCOMPLETE") {
    return { ideaSizeTier: "", ideaSizeEstimatedOrConfirmed: "" };
  }
  const sized = ideaSizeForResult(prop);
  return {
    ideaSizeTier: sized?.tier || ideaScaleFromDoc(prop) || "",
    ideaSizeEstimatedOrConfirmed: sized ? (sized.provisional ? "estimated" : "confirmed") : "",
  };
}

export function flattenProposition(prop = {}) {
  const f4 = prop.f4?.techShiftRisk || prop.f4 || {};
  const dimensions = f4.dimensions || {};
  const size = ideaSizeCells(prop);
  const reviewUi = reviewDisplayState(prop);
  const decision = prop.managerReviewState?.decision || null;
  const resolved = {
    ...prop,
    managerReviewExport: {
      status: reviewUi.statusKey || "none",
      decisionBy:
        decision?.actor_name ||
        prop.managerApproval?.managerName ||
        prop.managerReview?.managerName ||
        prop.managerReview?.rejectedBy?.name ||
        "",
      decisionDate: decision?.created_at || prop.managerApproval?.approvedAt || prop.managerReview?.approvedAt || prop.managerReview?.rejectedAt || "",
      comment: reviewUi.comment || "",
    },
    "f1.checkLabel": checkLabelOf(prop, "f1"),
    "f1.narrative": narrativeOf(prop, "f1"),
    ...evidenceCells(prop, "f1"),
    "f2.checkLabel": checkLabelOf(prop, "f2"),
    "f2.narrative": narrativeOf(prop, "f2"),
    ...evidenceCells(prop, "f2"),
    "f3.checkLabel": checkLabelOf(prop, "f3"),
    "f3.narrative": narrativeOf(prop, "f3"),
    ...evidenceCells(prop, "f3"),
    "f4.checkLabel": checkLabelOf(prop, "f4"),
    "f4.narrative": narrativeOf(prop, "f4"),
    ...evidenceCells(prop, "f4"),
    "f4.overallRisk": effectiveOverallRisk(f4) || f4.overallRisk || "",
    "f5.checkLabel": checkLabelOf(prop, "f5"),
    ...evidenceCells(prop, "f5"),
    closestPathToGo: pathToGoCopy(prop),
    "f5.computedRevenue": computeIdeaRevenueCr(prop.f5 || {}) ?? "",
    ideaSizeTier: size.ideaSizeTier,
    ideaSizeEstimatedOrConfirmed: size.ideaSizeEstimatedOrConfirmed,
    researchState: uiResearchState(prop),
  };
  const researchState = resolved.researchState;
  const blankWhenUnfinished = new Set();
  if (researchState !== "complete") {
    resolved.classification = "";
    resolved.scorePercent = "";
    resolved.closestPathToGo = "";
    blankWhenUnfinished.add("classification");
    blankWhenUnfinished.add("scorePercent");
    blankWhenUnfinished.add("closestPathToGo");
  }
  const typedResponses = prop.f4?.f4MitigationResponses || {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    resolved[`f4.${key}`] = formatDimension(dimensions[key], typedResponses[key]);
  }

  const flat = {};
  for (const col of FULL_EXPORT_COLUMNS) {
    let value;
    if (blankWhenUnfinished.has(col)) {
      value = "";
    } else if (Object.prototype.hasOwnProperty.call(resolved, col) && resolved[col] !== undefined && resolved[col] !== "") {
      value = resolved[col];
    } else {
      const aliases = ALIASES[col] || [col];
      value = firstNested(prop, aliases);
    }
    flat[col] = asCell(value);
  }
  return flat;
}

/** Name of the second sheet: one row per input column, with its Part 139 role label. */
export const FIELD_LABEL_SHEET_NAME = "Field labels";

function rolePathForColumn(col) {
  const candidates = [col, ...(ALIASES[col] || [])];
  for (const c of candidates) {
    if (getFieldRole(c)) return c;
    const twoPart = String(c).split(".").slice(0, 2).join(".");
    if (getFieldRole(twoPart)) return twoPart;
  }
  return "";
}

/**
 * "Label" for every input column that has a role (Required, Scored, Optional …). The words come
 * from lib/fieldRoles.js. When ideas disagree (e.g. Benchmark under a New market route) both show.
 */
export function fieldLabelRows(propositions = []) {
  const props = Array.isArray(propositions) && propositions.length ? propositions : [{}];
  const rows = [];
  for (const col of FULL_EXPORT_COLUMNS) {
    const path = rolePathForColumn(col);
    if (!path) continue;
    const labels = [...new Set(props.map((p) => roleLabel(path, p)).filter(Boolean))];
    if (!labels.length) continue;
    rows.push({ Column: col, Label: labels.join(" / ") });
  }
  return rows;
}

export function buildExportWorkbook(propositions = []) {
  const rows = (Array.isArray(propositions) ? propositions : []).map(flattenProposition);
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], {
    header: FULL_EXPORT_COLUMNS,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Propositions");
  // Part 139 F — a "Label" for each field column, kept off the data sheet so its rows stay one idea each.
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(fieldLabelRows(propositions), { header: ["Column", "Label"] }),
    FIELD_LABEL_SHEET_NAME
  );
  return workbook;
}

function safeFilenameHint(hint) {
  return String(hint || "propositions")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "propositions";
}

export function exportPropositionsToExcel(propositions, filenameHint = "propositions") {
  const workbook = buildExportWorkbook(propositions);
  const filename = `${safeFilenameHint(filenameHint)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}

export async function resolveFullPropositions(rows = [], fetchFull) {
  const list = Array.isArray(rows) ? rows : [];
  if (typeof fetchFull !== "function") return list;
  const out = [];
  const chunk = 8;
  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk);
    const got = await Promise.all(
      slice.map(async (row) => {
        if (!row?.id) return row;
        try {
          const full = await fetchFull(row.id);
          return full && typeof full === "object" ? { ...row, ...full } : row;
        } catch {
          return row;
        }
      })
    );
    out.push(...got);
  }
  return out;
}
