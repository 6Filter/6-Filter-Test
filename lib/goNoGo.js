/**
 * Browser-safe GO / NO-GO / WATCH helpers. No DB, no Node APIs.
 */
import {
  classifyGoNoGoFromBands,
  GONOGO_SCORE_BANDS,
  INCOMPLETE_VERDICT_MODE,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  RELEVANCE_SHADOW_MODE,
} from "./lockedConstants.js";
import { checkF1, checkF3, checkF4, checkF6, checkFilter, overallLabel, analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { applyFilter2Rules } from "./filter2Check.js";
import { formCategoryLabel, formIdeaLabel, ideaScaleFromDoc } from "./ideaScale.js";
import { ensureStop } from "./filterNarrativeText.js";
import { scoreFixedSlots } from "./scoreSlots.js";
import { lockedFloorForProposition } from "./divisionMargin.js";

/** Bands live in lockedConstants — <NOGO_MAX NO-GO · NOGO_MAX–WATCH_MAX WATCH · >WATCH_MAX GO. */
export function classifyGoNoGoFromScore(pct) {
  return classifyGoNoGoFromBands(pct);
}

/** A filter that never produced scored items cannot carry a GO. */
export function filterBlocksGo(check) {
  if (!check || typeof check !== "object") return true;
  const label = String(check.checkLabel || "");
  if (!label || label === "Not yet run") return true;
  // Part 134 revised — "Marked down" does not block as unfinished (WATCH cap is separate).
  const items = Array.isArray(check.items) ? check.items : [];
  if (items.length === 0) return true;
  // Undetected division leaves F2 unfinished → INCOMPLETE (or WATCH cap when mode is as-built).
  if (items.some((it) => /Pending:\s*division not determined/i.test(String(it?.text || "")))) {
    return true;
  }
  return items.some((it) => /Research failed — retry/.test(String(it?.text || "")));
}

export function filtersIncomplete(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"].some((key) => filterBlocksGo(advisoryChecks[key]));
}

export function hasProvisionalFloor(advisoryChecks = {}) {
  // Part 134 revised — provisional AI-COGS hard stop removed.
  return false;
}

/** Part 134 D26 / Part 133 D24 — a mark-down filter caps GO at WATCH. */
export function hasMarkedDown(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"].some(
    (k) =>
      (advisoryChecks[k] || {}).checkLabel === "Marked down" ||
      (advisoryChecks[k] || {}).markedDown === true
  );
}

/**
 * Part 135 D35 / Part 133 D24 — weak evidence on a cleared check also caps GO at WATCH
 * (adequate does not). Mark-downs already set capsGo.
 */
export function hasGoCap(advisoryChecks = {}) {
  if (hasMarkedDown(advisoryChecks)) return true;
  return ["f1", "f2", "f3", "f4"].some((k) => {
    const c = advisoryChecks[k] || {};
    if (c.capsGo === true || c.weakPass === true) return true;
    const items = Array.isArray(c.items) ? c.items : [];
    return items.some(
      (it) =>
        it &&
        !it.formAdmin &&
        String(it.level || "") === "weak" &&
        (it.status === "done" || Number(it.credit) > 0)
    );
  });
}

export function computeGoNoGo(advisoryChecks = {}) {
  if (goNoGoIsFloorFailure(advisoryChecks)) return "NO-GO";
  const incomplete = filtersIncomplete(advisoryChecks);
  if (INCOMPLETE_VERDICT_MODE === "incomplete" && incomplete) return "INCOMPLETE";
  const scored = scoreAdvisoryChecks(advisoryChecks);
  // D18 shadow: keep the user-facing band on the legacy binary count until the owner flips.
  const pct =
    RELEVANCE_SHADOW_MODE && Number.isFinite(Number(scored.legacyPct))
      ? Number(scored.legacyPct)
      : scored.pct;
  const band = classifyGoNoGoFromScore(pct);
  // as-built only: unfinished filters that would otherwise read GO promote to WATCH.
  if (incomplete && band === "GO") return "WATCH";
  // Mark-down or weak evidence never hard-stops — caps GO at WATCH.
  if (hasGoCap(advisoryChecks) && band === "GO") return "WATCH";
  return band;
}

export function goNoGoTone(classification) {
  if (classification === "GO") return "pass";
  if (classification === "WATCH") return "watch";
  if (classification === "INCOMPLETE") return "incomplete";
  return "fail";
}

export function goNoGoIsFloorFailure(advisoryChecks = {}) {
  // Part 134/135 — Filter 2 and Filter 3 never emit "Below floor" (mark-downs).
  // Remaining hard stops: F1 declared-gap floor and F4 overall High (owner-confirmed list).
  return ["f1", "f4"].some((k) => (advisoryChecks[k] || {}).checkLabel === "Below floor");
}

export function financeSignatureCopy(signed) {
  return signed
    ? "Finance has confirmed the margin computation"
    : "The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence; unconfirmed figures are treated as a gap";
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

/**
 * A filter with no scored checklist yet (Not yet run, or only form-admin gaps)
 * must still weigh against 100%. Otherwise cleared F1–F3 + unrun F4 reads 100%
 * whenever research/COGS auto-populate fails — the "every idea is 100%" bug.
 */
export function filterIsUnscoredForAggregate(check) {
  const label = String(check?.checkLabel || "");
  if (label === "Not yet run") return true;
  const scored = analysisCheckItems(check?.items);
  if (scored.length) return false;
  return label !== "Cleared" && label !== "Exempt";
}

export function scoreAdvisoryChecks(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  if (SCORE_DENOMINATOR_MODE === "fixed-slots") {
    return scoreFixedSlots(advisoryChecks, keys);
  }
  // Legacy `"as-built"` denominator (pre-v4.1) — kept for SCORE_DENOMINATOR_MODE rollback only.
  const byFilter = {};
  let done = 0;
  let total = 0;
  for (const k of keys) {
    const check = advisoryChecks[k];
    const s = filterCheckScore(check);
    if (filterIsUnscoredForAggregate(check)) {
      byFilter[k] = { done: 0, total: 1, pct: 0, unscored: true };
      total += 1;
      continue;
    }
    byFilter[k] = s;
    done += s.done;
    total += s.total;
  }
  return {
    byFilter,
    done,
    total,
    pct: total ? Math.round((100 * done) / total) : 0,
    denominatorMode: SCORE_DENOMINATOR_MODE,
  };
}

function item(status, text, extra = {}) {
  const row = { status, text };
  if (extra.formAdmin) row.formAdmin = true;
  if (extra.slot) row.slot = extra.slot;
  if (extra.credit != null) row.credit = extra.credit;
  if (extra.level != null) row.level = extra.level;
  if (extra.code) row.code = extra.code;
  return row;
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

  const division = String(doc.division || "").trim();
  // Part 134 revised — preview uses the locked division floor (browser-safe) so it matches the server.
  const floor = lockedFloorForProposition(doc);
  const f2Preview = applyFilter2Rules(f2, {
    floor,
    divisionPending: !division || floor == null,
    divisionLabel: division,
  });
  const f2Items = f2Preview.items;

  // Judged Filter 1 checks: preview never invents a percent — Submit assesses relevance.
  const f1Preview = checkF1(f1, findings.f1 || {}, {
    evidenceRead: findings.evidenceRead,
    autofillStatus: findings.autofillStatus,
  });
  if (f1Preview?.items?.length) {
    for (const it of f1Preview.items) {
      if (["benchmark", "attributes", "derivation", "route", "argument"].includes(it.slot)) {
        if (it.reasons?.includes("NOT_ASSESSED") || it.credit === 0) {
          if (!/Below floor|not named|not declared|missing|TOO_SHORT|NEEDS_CONFIRMATION/i.test(it.text)) {
            it.text = `${it.slot} — assessed when you Submit`;
            it.status = "pending";
          }
        }
      }
    }
  }

  return {
    f1: f1Preview,
    f2: checkFilter(f2, () => ({ checkLabel: overallLabel(f2Items), items: f2Items })),
    // Part 135 — browser preview never invents a Filter 3 cliff verdict.
    f3: checkF3(f2, f3, findings.f3 || {}, {
      autofillStatus: findings.autofillStatus || {},
      preview: true,
    }),
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
    ...(classification === "INCOMPLETE" ? {} : { ideaScale: ideaScaleFromDoc(doc) }),
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
      const lead = pending[0]?.text || `${k.toUpperCase()} is below the required floor`;
      floorLeads.push(lead);
    } else {
      for (const item of pending) otherPending.push(item.text);
    }
  }

  if (classification === "GO") {
    return `${subject} reads GO${scoreBit} on the Filter 1–4 parameters recorded on the form.`;
  }

  if (classification === "INCOMPLETE") {
    const points = Number(score?.points ?? score?.done);
    const total = Number(score?.total) || SCORE_CHECK_SLOTS_TOTAL;
    const pct = Number(score?.pct);
    const scoreBit = Number.isFinite(points)
      ? `${points} of ${total} relevance points${Number.isFinite(pct) ? ` (${pct}%)` : ""}`
      : `checks of ${total}`;
    return `Research did not finish (${scoreBit}). Screen again to complete it.`;
  }

  if (floorLeads.length) {
    return `${subject} is ${classification}${scoreBit} because ${ensureStop(floorLeads.join("; "))}`;
  }

  if (classification === "WATCH") {
    const gap = otherPending[0];
    if (gap) {
      return `${subject} is WATCH${scoreBit}. Outstanding on the form: ${ensureStop(gap)}`;
    }
    // Reachable only when INCOMPLETE_VERDICT_MODE is "as-built" (WATCH cap for unfinished filters).
    const unscored = ["f1", "f2", "f3", "f4"].filter((key) => filterBlocksGo(checks[key]));
    if (unscored.length && INCOMPLETE_VERDICT_MODE === "as-built") {
      return `${subject} is WATCH${scoreBit} — ${unscored
        .map((k) => k.toUpperCase())
        .join(", ")} ${unscored.length === 1 ? "has" : "have"} not produced a complete scored checklist yet.`;
    }
    if (Number.isFinite(pct) && pct > GONOGO_SCORE_BANDS.WATCH_MAX && INCOMPLETE_VERDICT_MODE === "as-built") {
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
