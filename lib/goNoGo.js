/**
 * Browser-safe GO / NO-GO helpers. No DB, no Node APIs.
 */
import { checkF1, checkF3, checkF4, overallLabel } from "./filterChecks.js";

export function computeGoNoGo(advisoryChecks = {}) {
  const relevant = ["f1", "f2", "f3", "f4"].map(
    (k) => advisoryChecks[k] || { checkLabel: "Evidence missing" }
  );
  const allClearOrExempt = relevant.every(
    (c) => c.checkLabel === "Cleared" || c.checkLabel === "Exempt"
  );
  return allClearOrExempt ? "GO" : "NO-GO";
}

export function goNoGoTone(classification) {
  return classification === "GO" ? "pass" : "fail";
}

export function goNoGoIsFloorFailure(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"].some((k) => (advisoryChecks[k] || {}).checkLabel === "Below floor");
}

export function filterCheckScore(check) {
  const items = Array.isArray(check?.items) ? check.items : [];
  const done = items.filter((i) => i.status === "done").length;
  return {
    done,
    total: items.length,
    pct: items.length ? Math.round((100 * done) / items.length) : 0,
  };
}

export function scoreAdvisoryChecks(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  const byFilter = {};
  let done = 0;
  let total = 0;
  for (const k of keys) {
    const s = filterCheckScore(advisoryChecks[k]);
    byFilter[k] = s;
    done += s.done;
    total += s.total;
  }
  return {
    byFilter,
    done,
    total,
    pct: total ? Math.round((100 * done) / total) : 0,
  };
}

function item(status, text) {
  return { status, text };
}

/** Instant Filter 1–4 checks in the browser (no division floors). Server re-scores after save. */
export function previewAdvisoryChecks(doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const f3 = doc.f3 || {};
  const f4 = doc.f4 || {};
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};

  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const f2Items = [
    item(
      f2.mrpInr && f2.grammage ? "done" : "pending",
      f2.mrpInr && f2.grammage ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared"
    ),
    item(
      hasMargin ? "done" : "pending",
      hasMargin
        ? `Net margin ${Number(f2.netMarginAtScale)}% recorded — floor applied after Submit`
        : "Net margin at scale not yet computed"
    ),
    item(
      f2.qcomTrajectory ? "done" : "pending",
      f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)"
    ),
    item(
      f2.financeSigned ? "done" : "pending",
      f2.financeSigned ? "Finance signature recorded" : "Finance signature pending — missing evidence counts as FAIL (v4)"
    ),
  ];

  return {
    f1: checkF1(f1, findings.f1 || {}),
    f2: { checkLabel: overallLabel(f2Items), items: f2Items },
    f3: checkF3(f2, f3, findings.f3 || {}),
    f4: checkF4(f4, findings.f4 || {}),
  };
}

export function applyLocalGate(doc) {
  const checks = previewAdvisoryChecks(doc);
  const classification = computeGoNoGo(checks);
  return { checks, classification, score: scoreAdvisoryChecks(checks) };
}

export function summarizeChecksForPrompt(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"]
    .map((k) => {
      const c = advisoryChecks[k] || {};
      const items = Array.isArray(c.items)
        ? c.items.map((it) => `  - [${it.status}] ${it.text}`).join("\n")
        : "";
      return `${k.toUpperCase()}: ${c.checkLabel || "Evidence missing"}\n${items}`;
    })
    .join("\n\n");
}
