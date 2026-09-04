/**
 * Browser-safe GO / NO-GO / WATCH helpers. No DB, no Node APIs.
 */
import { checkF1, checkF3, checkF4, overallLabel, analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { ensureStop } from "./filterNarrativeText.js";

/** <60 NO-GO · 60–80 WATCH · >80 GO. Floor failure overrides this. */
export function classifyGoNoGoFromScore(pct) {
  const n = Number(pct);
  const score = Number.isFinite(n) ? n : 0;
  if (score > 80) return "GO";
  if (score >= 60) return "WATCH";
  return "NO-GO";
}

export function computeGoNoGo(advisoryChecks = {}) {
  if (goNoGoIsFloorFailure(advisoryChecks)) return "NO-GO";
  const { pct } = scoreAdvisoryChecks(advisoryChecks);
  return classifyGoNoGoFromScore(pct);
}

export function goNoGoTone(classification) {
  if (classification === "GO") return "pass";
  if (classification === "WATCH") return "watch";
  return "fail";
}

export function goNoGoIsFloorFailure(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"].some((k) => (advisoryChecks[k] || {}).checkLabel === "Below floor");
}

export function financeSignatureCopy(signed) {
  return signed
    ? "Finance has confirmed the margin computation"
    : "The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence, per v4's rule that unconfirmed figures are treated as a gap";
}

export { overallLabel, analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";

export function filterCheckScore(check) {
  const items = analysisCheckItems(check?.items);
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

function item(status, text, extra = {}) {
  return extra.formAdmin ? { status, text, formAdmin: true } : { status, text };
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
      f2.mrpInr && f2.grammage ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared",
      { formAdmin: !(f2.mrpInr && f2.grammage) }
    ),
    item(
      hasMargin ? "done" : "pending",
      hasMargin
        ? `Net margin ${Number(f2.netMarginAtScale)}% recorded — floor applied after Submit`
        : "Net margin at scale not yet computed",
      { formAdmin: !hasMargin }
    ),
    item(
      f2.qcomTrajectory ? "done" : "pending",
      f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)",
      { formAdmin: !f2.qcomTrajectory }
    ),
    item(
      f2.financeSigned ? "done" : "pending",
      financeSignatureCopy(f2.financeSigned),
      { formAdmin: true }
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
  const score = scoreAdvisoryChecks(checks);
  const ideaName = formIdeaLabel(doc);
  const category = formCategoryLabel(doc);
  const classification = computeGoNoGo(checks);
  return {
    checks,
    classification,
    score,
    ideaScale: ideaScaleFromDoc(doc),
    ideaName,
    category,
    rationale: buildGateRationale({ classification, score, checks, ideaName, category }),
  };
}

/**
 * Deterministic hero copy from the form + check items. Same inputs → same paragraph.
 * Quotes the recorded numbers; does not restate every pending gap (those stay in the list).
 */
export function buildGateRationale({
  classification,
  score,
  checks = {},
  ideaName = "",
  category = "",
} = {}) {
  const idea = String(ideaName || "").trim();
  const cat = String(category || "").trim();
  const pct = Number(score?.pct);
  const scoreBit = Number.isFinite(pct) ? ` at ${pct}%` : "";
  const subject = idea || (cat ? `This ${cat} idea` : "This idea");

  const floorLeads = [];
  const otherPending = [];
  for (const k of ["f1", "f2", "f3", "f4"]) {
    const check = checks[k] || {};
    const pending = (Array.isArray(check.items) ? check.items : []).filter(
      (i) => i.status === "pending" && String(i.text || "").trim() && !isFormAdminCheck(i)
    );
    if (check.checkLabel === "Below floor") {
      const lead = pending[0]?.text || `${k.toUpperCase()} is below a non-negotiable floor`;
      floorLeads.push(lead);
    } else {
      for (const item of pending) otherPending.push(item.text);
    }
  }

  if (classification === "GO") {
    return `${subject} reads GO${scoreBit} on the Filter 1–4 parameters recorded on the form.`;
  }

  if (floorLeads.length) {
    return `${subject} is ${classification}${scoreBit} because ${ensureStop(floorLeads.join("; "))}`;
  }

  if (classification === "WATCH") {
    const gap = otherPending[0];
    return gap
      ? `${subject} is WATCH${scoreBit}. Outstanding on the form: ${ensureStop(gap)}`
      : `${subject} is WATCH${scoreBit} — the score is in the 60–80 band.`;
  }

  const gap = otherPending[0];
  return gap
    ? `${subject} is NO-GO${scoreBit} — ${ensureStop(gap)}`
    : `${subject} is NO-GO${scoreBit} until Filter 1–4 evidence on the form is complete.`;
}

export function summarizeChecksForPrompt(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"]
    .map((k) => {
      const c = advisoryChecks[k] || {};
      const items = analysisCheckItems(c.items);
      const lines = items.map((it) => `  - [${it.status}] ${it.text}`).join("\n");
      const label =
        c.checkLabel === "Below floor" || c.checkLabel === "Exempt"
          ? c.checkLabel
          : overallLabel(c.items, c.checkLabel === "Below floor");
      return `${k.toUpperCase()}: ${label}\n${lines}`;
    })
    .join("\n\n");
}
