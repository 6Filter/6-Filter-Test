import { hideFilterTalk } from "../lib/publicCopy.js";
import { scoreToFive, statusOf } from "./scoringUi.js";

const PRODUCT_DIMS = [
  { key: "novelty", label: "Novelty", weight: 0.4, phaseShare: 0.6, maxPts: 24 },
  { key: "market", label: "Market relevance", weight: 0.3, phaseShare: 0.6, maxPts: 18 },
  { key: "evidence", label: "Evidence", weight: 0.3, phaseShare: 0.6, maxPts: 18 },
];

const PROCESS_DIMS = [
  { key: "efficiency", label: "Efficiency gain", weight: 0.5, phaseShare: 0.4, maxPts: 20 },
  { key: "feasibility", label: "Feasibility", weight: 0.3, phaseShare: 0.4, maxPts: 12 },
  { key: "scalability", label: "Scalability", weight: 0.2, phaseShare: 0.4, maxPts: 8 },
];

const FILTERS = [
  { key: "filter1", label: "Opportunity to Grow" },
  { key: "filter2", label: "Net Margin Gate" },
  { key: "filter3", label: "Price Resilient" },
  { key: "filter4", label: "Tech & Habit Shift" },
];

function isProcess(result) {
  return result?.ideaType === "process" || Boolean(result?.efficiency && result?.feasibility && result?.scalability);
}

function filterReason(filter) {
  return hideFilterTalk(
    String(filter?.verdictReason || filter?.reason || filter?.evidenceSummary || "").trim()
  );
}

export function overallPassFail(result) {
  if (result?.overallVerdict === "CLEARED") return { key: "passed", label: "Passed" };
  if (result?.overallVerdict === "FAIL") return { key: "failed", label: "Failed" };
  if (result?.overallVerdict === "NEEDS_INPUT") return { key: "needs", label: "Needs input" };
  const max = Number(result?.phase1Max) > 0 ? Number(result.phase1Max) : isProcess(result) ? 40 : 60;
  const st = statusOf(Number(result?.phase1) || 0, max);
  if (st.key === "approved") return { key: "passed", label: "Passed" };
  if (st.key === "rejected") return { key: "failed", label: "Failed" };
  return { key: "needs", label: "Needs input" };
}

export function deductionsFor(result) {
  const rows = [];
  const dims = isProcess(result) ? PROCESS_DIMS : PRODUCT_DIMS;
  for (const d of dims) {
    const dim = result?.[d.key];
    const score100 = Number(dim?.score);
    if (!Number.isFinite(score100)) continue;
    const earned = Math.round(score100 * d.weight * d.phaseShare * 10) / 10;
    const deducted = Math.round((d.maxPts - earned) * 10) / 10;
    if (deducted <= 0.2) continue;
    rows.push({
      title: d.label,
      marks: `−${deducted} of ${d.maxPts} pts · ${scoreToFive(score100)}/5`,
      detail: hideFilterTalk(String(dim?.rationale || "").trim()),
    });
  }

  if (!isProcess(result)) {
    for (const f of FILTERS) {
      const filter = result?.[f.key];
      const v = String(filter?.verdict || "").toUpperCase();
      if (v !== "FAIL" && v !== "NEEDS_INPUT") continue;
      rows.push({
        title: f.label,
        marks: v === "FAIL" ? "Gate failed" : "Incomplete — no pass yet",
        detail: filterReason(filter),
      });
    }
  }

  return rows;
}

export function mistakesFor(result) {
  const items = [];
  const seen = new Set();
  const push = (value) => {
    const t = String(value || "").trim();
    if (!t || t.length < 8) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(t);
  };

  push(result?.evidence?.gap);
  push(result?.feasibility?.barrier);
  if (!isProcess(result)) {
    for (const f of FILTERS) {
      const filter = result?.[f.key];
      if (String(filter?.verdict || "").toUpperCase() === "FAIL") {
        push(filterReason(filter));
      }
    }
  }
  push(result?.refinementPivot);
  push(result?.oneLiner);
  if (items.length < 3 && Array.isArray(result?.improvements)) {
    result.improvements.forEach(push);
  }
  return items.slice(0, 8);
}
