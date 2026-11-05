/**
 * Browser-safe narrative helpers. Describe already-computed checks — never score.
 * Part 136 — mark-downs say what lost points and what to do; only declared-gap < 2.0
 * and Filter 4 overall High are described as stops. No version tags, no "non-negotiable"
 * for mark-downs, no "has not been run yet" (an output that exists has run).
 */
import { analysisCheckItems, isFormAdminCheck, overallLabel } from "./filterChecks.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4"];

export function narrativeContradictsStatus(checkLabel, text) {
  const label = String(checkLabel || "");
  const t = String(text || "");
  if (!t.trim()) return true;
  if (label === "Below floor") {
    const claimsCleared = /\bcleared\b/i.test(t) && !/\bnot\s+cleared\b/i.test(t);
    const admitsFloor = /\bbelow floor\b|\bfloor failure\b|\bpast (a |the )?floor\b|\bceiling\b|\bbreach/i.test(t);
    if (claimsCleared && !admitsFloor) return true;
  }
  if (label === "Marked down") {
    const claimsCleared = /\bcleared\b/i.test(t) && !/\bnot\s+cleared\b/i.test(t);
    const admitsMarkDown = /\bmarked down\b|\bvolume loss\b|\bceiling\b|\bmark-down\b|\blost points\b/i.test(t);
    if (claimsCleared && !admitsMarkDown) return true;
  }
  if ((label === "Cleared" || label === "Exempt") && /\bbelow floor\b/i.test(t) && !/\bnot\s+below floor\b/i.test(t)) {
    return true;
  }
  return false;
}

export function ensureStop(text) {
  const s = String(text || "").trim();
  if (!s) return s;
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

export function fallbackFilterNarrative(check = {}) {
  if (check.checkLabel === "Locked") {
    return "Filter 5 unlocks after a GO read (or manager-approved WATCH) and market-research proof.";
  }
  if (check.checkLabel === "Awaiting panels") {
    return (
      check.infoLine ||
      "Awaiting prototype panels — Filter 6 is read when lab, consumer and pack results exist."
    );
  }
  const belowFloor = check.checkLabel === "Below floor";
  const stated = String(check.checkLabel || "");
  const label =
    stated === "Exempt" || stated === "Evidence missing" || stated === "Not yet run" || stated === "Below floor"
      ? stated
      : overallLabel(check.items, belowFloor);
  const items = analysisCheckItems(check.items);
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "done");
  const analyzed = done.map((i) => i.text).filter(Boolean).join("; ");
  const gaps = pending.map((i) => i.text).filter(Boolean).join("; ");

  // An output that exists has run — never say the filter has not been run yet.
  if (label === "Not yet run" || (label === "Evidence missing" && !gaps && !analyzed)) {
    return "This filter has no scored evidence for this idea yet — fill its inputs and Submit so research can check them.";
  }

  if (label === "Cleared" || label === "Exempt") {
    return analyzed
      ? `${ensureStop(analyzed)} Nothing outstanding on this filter.`
      : "This filter is cleared. Nothing outstanding.";
  }

  // Hard stops only: declared gap below floor, or Filter 4 overall High.
  if (label === "Below floor") {
    const lead = pending[0]?.text || "This idea stops on a hard floor — raise the declared gap or lower Filter 4 risk.";
    const rest = pending.slice(1).map((i) => i.text).filter(Boolean);
    const secondary = rest.length ? ` Also: ${rest.map(ensureStop).join(" ")}` : "";
    return `${ensureStop(lead)}${secondary}`;
  }

  if (stated === "Marked down" || check.markedDown === true) {
    const lead =
      pending[0]?.text ||
      "This filter is marked down — one check earned no credit. Fix the open item to recover those points.";
    const rest = pending.slice(1).map((i) => i.text).filter(Boolean);
    const secondary = rest.length ? ` Also: ${rest.map(ensureStop).join(" ")}` : "";
    return `${ensureStop(lead)}${secondary}`;
  }

  // Open gaps only — never echo cleared form inputs as "Already on record / Still needed".
  if (!gaps) {
    const rawPending = (Array.isArray(check.items) ? check.items : [])
      .filter((i) => i?.status === "pending")
      .map((i) => i.text)
      .filter(Boolean);
    if (rawPending.length) {
      return ensureStop(rawPending.join("; "));
    }
    return "No open analytical gaps remain on this filter.";
  }
  return ensureStop(gaps);
}

const FORM_ADMIN_NARRATIVE =
  /hasn't been confirmed by Finance|Finance has confirmed the margin|Finance has not confirmed|Finance still needs to confirm|Finance confirmation|CMI signature|signature pending|unsigned checkbox|tick mark|not yet declared|not yet entered|not yet computed|not yet assessed|not yet confirmed|left blank|isn't entered yet|not filled on the input form|fields? (left |still )?blank/i;

export function stripFormAdminNarrative(text) {
  const kept = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      const t = s.trim();
      if (!t) return false;
      if (FORM_ADMIN_NARRATIVE.test(t)) return false;
      return !isFormAdminCheck({ text: t });
    });
  return kept.join(" ").replace(/[ \t]{2,}/g, " ").trim();
}

export function reconcileNarratives(raw, advisoryChecks = {}) {
  const out = {};
  for (const key of FILTER_KEYS) {
    const check = advisoryChecks[key] || {};
    const text = stripFormAdminNarrative(String(raw?.[key] || "").trim());
    out[key] =
      !text || narrativeContradictsStatus(check.checkLabel, text)
        ? fallbackFilterNarrative(check)
        : text;
  }
  return out;
}

function alreadyStates(text, fragment) {
  const hay = String(text || "");
  const needle = String(fragment || "").trim();
  if (!needle) return true;
  if (hay.includes(needle)) return true;
  const head = needle.slice(0, Math.min(48, needle.length));
  return Boolean(head) && hay.includes(head);
}

/** Drop prompt-placeholder fragments the model sometimes copies into user-facing copy. */
export function stripNarrativeInstructionLeak(text) {
  return String(text || "")
    .replace(/\s*\(not yet computed[^)]*\)/gi, "")
    .replace(/\s*do not invent[^.]*\./gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Bake F3 competitive position and F4 five-year verdict into cached prose. Idempotent. */
export function applyVerdictLeads(narratives = {}, extras = {}, advisoryChecks = {}) {
  const out = { ...narratives };
  for (const key of ["f1", "f2", "f3", "f4"]) {
    if (out[key]) out[key] = stripNarrativeInstructionLeak(out[key]);
  }
  const competitiveNote = String(extras.competitiveNote || "").trim();
  const obsolescenceVerdict = String(extras.obsolescenceVerdict || "").trim();

  if (competitiveNote) {
    const current = String(out.f3 || "").trim();
    if (!alreadyStates(current, competitiveNote)) {
      out.f3 = current ? `${competitiveNote} ${current}` : competitiveNote;
    }
  }

  if (obsolescenceVerdict) {
    const current = String(out.f4 || "").trim();
    if (!alreadyStates(current, obsolescenceVerdict)) {
      out.f4 = current ? `${obsolescenceVerdict} ${current}` : obsolescenceVerdict;
    }
  }
  return out;
}
