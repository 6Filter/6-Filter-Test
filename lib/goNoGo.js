/**
 * Browser-safe GO / NO-GO / WATCH helpers. No DB, no Node APIs.
 */
import { classifyGoNoGoFromBands, GONOGO_SCORE_BANDS } from "./lockedConstants.js";
import { checkF1, checkF3, checkF4, checkF6, checkFilter, overallLabel, analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { categoryCheckCopy, formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { ensureStop } from "./filterNarrativeText.js";

/** Bands live in lockedConstants — <NOGO_MAX NO-GO · NOGO_MAX–WATCH_MAX WATCH · >WATCH_MAX GO. */
export function classifyGoNoGoFromScore(pct) {
  return classifyGoNoGoFromBands(pct);
}

/** A filter that never produced scored items cannot carry a GO. */
export function filterBlocksGo(check) {
  if (!check || typeof check !== "object") return true;
  const label = String(check.checkLabel || "");
  if (!label || label === "Not yet run") return true;
  const items = Array.isArray(check.items) ? check.items : [];
  if (items.length === 0) return true;
  return items.some((it) => /Research failed — retry/.test(String(it?.text || "")));
}

export function computeGoNoGo(advisoryChecks = {}) {
  if (goNoGoIsFloorFailure(advisoryChecks)) return "NO-GO";
  const { pct } = scoreAdvisoryChecks(advisoryChecks);
  const band = classifyGoNoGoFromScore(pct);
  const unscored = ["f1", "f2", "f3", "f4"].some((key) => filterBlocksGo(advisoryChecks[key]));
  if (unscored && band === "GO") return "WATCH";
  return band;
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
  const f5 = doc.f5 || {};
  const f6 = doc.f6 || {};
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};

  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const division = String(doc.division || "").trim();
  const category = String(doc.category || "").trim();
  const f2Items = [
    ...(!division
      ? [
          item(category ? "done" : "pending", categoryCheckCopy(category), {
            formAdmin: !category,
          }),
        ]
      : []),
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
    f2: checkFilter(f2, () => ({ checkLabel: overallLabel(f2Items), items: f2Items })),
    f3: checkF3(f2, f3, findings.f3 || {}),
    f4: checkF4(f4, findings.f4 || {}),
    f5: checkFilter(f5, () => ({ checkLabel: "Evidence missing", items: [] })),
    f6: checkF6(f6, false),
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
    if (gap) {
      return `${subject} is WATCH${scoreBit}. Outstanding on the form: ${ensureStop(gap)}`;
    }
    const unscored = ["f1", "f2", "f3", "f4"].filter((key) => filterBlocksGo(checks[key]));
    if (unscored.length) {
      return `${subject} is WATCH${scoreBit} — ${unscored
        .map((k) => k.toUpperCase())
        .join(", ")} ${unscored.length === 1 ? "has" : "have"} not produced a complete scored checklist yet.`;
    }
    if (Number.isFinite(pct) && pct > GONOGO_SCORE_BANDS.WATCH_MAX) {
      return `${subject} is WATCH${scoreBit} — the Filter 1–4 checklist still blocks GO even though the percent cleared the ${GONOGO_SCORE_BANDS.WATCH_MAX}% line.`;
    }
    if (Number.isFinite(pct) && pct >= GONOGO_SCORE_BANDS.NOGO_MAX && pct <= GONOGO_SCORE_BANDS.WATCH_MAX) {
      return `${subject} is WATCH${scoreBit} — the score is in the ${GONOGO_SCORE_BANDS.NOGO_MAX}–${GONOGO_SCORE_BANDS.WATCH_MAX} band.`;
    }
    return `${subject} is WATCH${scoreBit}.`;
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
