/**
 * Browser-safe narrative helpers. Describe already-computed checks — never score.
 */

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
  if ((label === "Cleared" || label === "Exempt") && /\bbelow floor\b/i.test(t) && !/\bnot\s+below floor\b/i.test(t)) {
    return true;
  }
  return false;
}

export function fallbackFilterNarrative(check = {}) {
  const label = check.checkLabel || "Evidence missing";
  const items = Array.isArray(check.items) ? check.items : [];
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status === "done");
  const analyzed = done.map((i) => i.text).filter(Boolean).join("; ");
  const gaps = pending.map((i) => i.text).filter(Boolean).join("; ");

  if (label === "Cleared" || label === "Exempt") {
    return analyzed
      ? `${analyzed}. Nothing outstanding on this filter.`
      : "This filter is cleared. Nothing outstanding.";
  }

  if (label === "Below floor") {
    const lead = pending[0]?.text || "A recorded number is past a non-negotiable floor.";
    const rest = pending.slice(1).map((i) => i.text).filter(Boolean);
    const secondary = rest.length ? ` Secondary to that: ${rest.join("; ")}.` : "";
    return `${lead} That is an analytical floor failure, not unfinished paperwork.${secondary}`;
  }

  const head = analyzed ? `Already on record: ${analyzed}. ` : "";
  if (!gaps) return `${head}Evidence on this filter is still incomplete.`;
  return `${head}Still needed: ${gaps}.`;
}

export function reconcileNarratives(raw, advisoryChecks = {}) {
  const out = {};
  for (const key of FILTER_KEYS) {
    const check = advisoryChecks[key] || {};
    const text = String(raw?.[key] || "").trim();
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
      const label = advisoryChecks.f3?.checkLabel || "";
      out.f3 =
        label === "Below floor" && current
          ? `${current} ${competitiveNote}`
          : current
            ? `${competitiveNote} ${current}`
            : competitiveNote;
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
