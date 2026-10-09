/**
 * Full-detail Log Excel export. Browser-safe (SheetJS).
 */
import * as XLSX from "xlsx";
import { closestPathToGo, computeImprovementPointValues } from "./improvementPoints.js";
import { uiResearchState } from "./researchProgress.js";
import { computeIdeaRevenueCr, ideaScaleFromDoc, ideaSizeForResult } from "./ideaScale.js";
import { TECH_SHIFT_DIMENSIONS, effectiveDimensionRisk, effectiveOverallRisk } from "./techShiftRisk.js";

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
  "f1.growthRoute",
  "f1.growthArgument",
  "f1.evidenceSourceLink",
  "f1.pureCommodity",
  "f1.checkLabel",
  "f1.narrative",
  "f2.cogsAtScale",
  "f2.netMarginAtScale",
  "f2.gstRatePct",
  "f2.grammage",
  "f2.mrpInr",
  "f2.qcomTrajectory",
  "f2.financeSigned",
  "f2.checkLabel",
  "f2.narrative",
  "f3.minMrpInr",
  "f3.maxMrpInr",
  "f3.checkLabel",
  "f3.narrative",
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
  "f5.householdsReachedY3Mn",
  "f5.trialRatePct",
  "f5.repeatConversionPct",
  "f5.purchaseFrequencyYr",
  "f5.avgPackValueInr",
  "f5.computedRevenue",
  "f5.cmiSigned",
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
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
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

function narrativeOf(prop, key) {
  return String(prop.goNoGo?.filterNarratives?.[key] || prop.filterNarratives?.[key] || "").trim();
}

function pathToGoCopy(prop) {
  const checks = prop.advisoryChecks || {};
  const items = computeImprovementPointValues(checks);
  const path = closestPathToGo(checks, items);
  if (path.reachesGo && !path.items.length) return "Already above GO";
  return (path.items || [])
    .map((it) => String(it?.text || it || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function ideaSizeCells(prop) {
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
  const resolved = {
    ...prop,
    "f1.checkLabel": checkLabelOf(prop, "f1"),
    "f1.narrative": narrativeOf(prop, "f1"),
    "f2.checkLabel": checkLabelOf(prop, "f2"),
    "f2.narrative": narrativeOf(prop, "f2"),
    "f3.checkLabel": checkLabelOf(prop, "f3"),
    "f3.narrative": narrativeOf(prop, "f3"),
    "f4.checkLabel": checkLabelOf(prop, "f4"),
    "f4.narrative": narrativeOf(prop, "f4"),
    "f4.overallRisk": effectiveOverallRisk(f4) || f4.overallRisk || "",
    "f5.checkLabel": checkLabelOf(prop, "f5"),
    closestPathToGo: pathToGoCopy(prop),
    "f5.computedRevenue": computeIdeaRevenueCr(prop.f5 || {}) ?? "",
    ideaSizeTier: size.ideaSizeTier,
    ideaSizeEstimatedOrConfirmed: size.ideaSizeEstimatedOrConfirmed,
    researchState: uiResearchState(prop),
  };
  const typedResponses = prop.f4?.f4MitigationResponses || {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    resolved[`f4.${key}`] = formatDimension(dimensions[key], typedResponses[key]);
  }

  const flat = {};
  for (const col of FULL_EXPORT_COLUMNS) {
    let value;
    if (Object.prototype.hasOwnProperty.call(resolved, col) && resolved[col] !== undefined && resolved[col] !== "") {
      value = resolved[col];
    } else {
      const aliases = ALIASES[col] || [col];
      value = firstNested(prop, aliases);
    }
    flat[col] = asCell(value);
  }
  return flat;
}

export function buildExportWorkbook(propositions = []) {
  const rows = (Array.isArray(propositions) ? propositions : []).map(flattenProposition);
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], {
    header: FULL_EXPORT_COLUMNS,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Propositions");
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
