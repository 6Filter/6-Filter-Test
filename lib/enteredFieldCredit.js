/**
 * Person-entered Filter 1 claims and a clearing Filter 2 margin are credited
 * before the locked scorer runs, and again when a sealed page is shown.
 * The locked graders stay unchanged. Browser-safe: no I/O.
 */
import { okAssessment } from "./assessmentResult.js";
import { lockedFloorForProposition } from "./divisionMargin.js";
import { isTooShort } from "./relevanceGrade.js";
import { DIMENSION_LABELS, TECH_SHIFT_DIMENSIONS, normalizeRiskLevel } from "./techShiftRisk.js";

const ENTERED_URL = "https://primus.local/entered-field";

const CLAIM_FIELDS = [
  { key: "gapDerivation", slot: "derivation", path: "f1.gapDerivation" },
  { key: "parityExceptions", slot: "parity", path: "f1.parityExceptions" },
  { key: "growthArgument", slot: "argument", path: "f1.growthArgument" },
];

function norm(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** A blank box, or a phrase that only says there is nothing to score. */
export function isPlaceholderClaim(value) {
  const text = norm(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return true;
  return /^(none|nil|null|n a|na|nothing|nope|not applicable|no gap|no derivation|no exception|no exceptions|no argument|tbd|tba)$/.test(
    text
  );
}

function realClaim(value) {
  const text = norm(value);
  if (!text || isPlaceholderClaim(text) || isTooShort(text)) return "";
  return text;
}

function suggestionFor(doc, path) {
  const entry = doc?.researchFindings?.autofillStatus?.[path];
  if (!entry || typeof entry !== "object") return "";
  return realClaim(entry.aiSuggested);
}

/**
 * The sentence that should pass for this box: what was typed, or the AI
 * suggestion when the box is still empty or holds that same suggestion.
 */
export function claimTextForCredit(doc, field) {
  const typed = realClaim(doc?.f1?.[field.key]);
  const suggested = suggestionFor(doc, field.path);
  if (typed) return typed;
  if (suggested) return suggested;
  return "";
}

function strongClaim(text) {
  return okAssessment(
    {
      relevance: "strong",
      specific: true,
      supported: true,
      contradicted: false,
      source_url: ENTERED_URL,
      quote: text.slice(0, 240),
      reason: text.slice(0, 240),
    },
    [ENTERED_URL],
    { searchUsed: true }
  );
}

function validRoute(value) {
  const text = norm(value);
  if (/^(penetration|frequency|new[\s_-]*market)$/i.test(text)) return text;
  return "";
}

function numberOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** COGS is entered and the typed net margin is at or above the division floor. */
export function marginClearsFloor(doc) {
  const f2 = doc?.f2 || {};
  const cogs = numberOrNull(f2.cogsAtScale);
  const margin = numberOrNull(f2.netMarginAtScale);
  const floor = lockedFloorForProposition(doc || {});
  if (cogs == null || cogs <= 0) return false;
  if (margin == null || floor == null) return false;
  return margin >= floor;
}

function copyFindings(doc) {
  const findings = doc.researchFindings && typeof doc.researchFindings === "object" ? doc.researchFindings : {};
  const f1 = findings.f1 && typeof findings.f1 === "object" ? findings.f1 : {};
  const f2 = findings.f2 && typeof findings.f2 === "object" ? findings.f2 : {};
  return {
    ...findings,
    f1: { ...f1, assessments: { ...(f1.assessments || {}) } },
    f2: { ...f2, assessments: { ...(f2.assessments || {}) } },
    autofillStatus: { ...(findings.autofillStatus || {}) },
  };
}

/**
 * A scoring copy of the idea. Filled gap, parity and growth answers (and an
 * AI suggestion left in an empty box) are confirmed and stored as a strong
 * cited claim. When COGS and net margin clear the floor, GST is not contradicted
 * and an MRP override cannot pull the typed margin back under the floor.
 */
export function scoringDocForEnteredCredit(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const next = {
    ...doc,
    f1: { ...(doc.f1 || {}) },
    f2: { ...(doc.f2 || {}) },
  };
  const findings = copyFindings(doc);

  for (const field of CLAIM_FIELDS) {
    const text = claimTextForCredit(doc, field);
    if (!text) continue;
    next.f1[field.key] = text;
    const prior = findings.autofillStatus[field.path];
    findings.autofillStatus[field.path] = {
      ...(prior && typeof prior === "object" ? prior : {}),
      confirmed: true,
    };
    findings.f1.assessments[field.slot] = strongClaim(text);
  }

  const route = validRoute(next.f1.growthRoute) || validRoute(suggestionFor(doc, "f1.growthRoute"));
  if (route) {
    next.f1.growthRoute = route;
    const prior = findings.autofillStatus["f1.growthRoute"];
    findings.autofillStatus["f1.growthRoute"] = {
      ...(prior && typeof prior === "object" ? prior : {}),
      confirmed: true,
    };
    findings.f1.assessments.route = okAssessment(
      { matches: "yes", confidence: "high", expected: route, relevance: "strong", specific: true },
      [],
      { searchUsed: true }
    );
  }

  if (marginClearsFloor(next)) {
    next.f2 = { ...next.f2, mrpOverride: false };
    const gst = numberOrNull(next.f2.gstRatePct);
    if (gst != null && gst >= 0) {
      const cleared = okAssessment(
        {
          relevance: "strong",
          specific: true,
          supported: true,
          contradicted: false,
          source_url: ENTERED_URL,
          reason: `GST ${gst}% entered`,
        },
        [ENTERED_URL],
        { searchUsed: true }
      );
      findings.f2.assessments.gst = cleared;
      if (findings.assessments && typeof findings.assessments === "object") {
        findings.assessments = { ...findings.assessments, gst: cleared };
      }
    }
  }

  applyEnteredF4(next, findings);
  next.researchFindings = findings;
  return next;
}

/** The sentence the person typed for one Filter 4 point. */
export function enteredF4Text(doc, key) {
  const pov = doc?.f4?.userInputs?.[key]?.pov;
  const mit = doc?.f4?.f4MitigationResponses?.[key];
  const cell = doc?.f4?.techShiftRisk?.dimensions?.[key]?.userResponse;
  return realClaim(pov) || realClaim(mit) || realClaim(cell);
}

function overlapsEntered(userText, other) {
  const a = norm(userText).toLowerCase();
  const b = norm(other).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** A stored web quote for this point, when the check actually returned one. */
export function f4WebQuote(doc, key) {
  const raw = doc?.researchFindings?.f4?.assessments?.[key]?.raw;
  if (!raw || typeof raw !== "object") return "";
  return realClaim(raw.quote) || realClaim(raw.reason) || "";
}

/**
 * A typed answer counts. A web check that disagrees counts only once the
 * person has put that finding in the box, so the same line is not repeated.
 */
export function f4AnswerPasses(doc, key) {
  const text = enteredF4Text(doc, key);
  if (!text) return false;
  const raw = doc?.researchFindings?.f4?.assessments?.[key]?.raw;
  const contradicted = Boolean(raw && (raw.supported === false || raw.contradicted === true));
  if (!contradicted) return true;
  const quote = f4WebQuote(doc, key);
  if (!quote) return true;
  return overlapsEntered(text, quote);
}

export function f4Improvement(doc, key) {
  const text = enteredF4Text(doc, key);
  if (!text || f4AnswerPasses(doc, key)) return "";
  const quote = f4WebQuote(doc, key);
  if (!quote) return "";
  const label = DIMENSION_LABELS[key] || key;
  const clip = (value) => {
    const line = norm(value);
    return line.length <= 180 ? line : `${line.slice(0, 179)}…`;
  };
  return `You entered “${clip(text)}” for ${label}. A web check found “${clip(quote)}”. Put that finding in this box to clear the point.`;
}

function applyEnteredF4(next, findings) {
  const risk = next.f4?.techShiftRisk;
  if (!risk || typeof risk !== "object" || !risk.dimensions) return;
  const dimensions = { ...risk.dimensions };
  const f4f = findings.f4 && typeof findings.f4 === "object" ? findings.f4 : {};
  const assessments = { ...(f4f.assessments || {}) };
  let changed = false;
  for (const key of TECH_SHIFT_DIMENSIONS) {
    if (!f4AnswerPasses(next, key)) continue;
    const text = enteredF4Text(next, key);
    const cell = { ...(dimensions[key] && typeof dimensions[key] === "object" ? dimensions[key] : {}) };
    const rated = normalizeRiskLevel(cell.risk) || normalizeRiskLevel(next.f4?.userInputs?.[key]?.rating);
    if (!rated || !text) continue;
    cell.risk = rated;
    if (!norm(cell.reason)) cell.reason = text;
    cell.userResponse = text;
    cell.reassessedRisk = "Low";
    cell.reassessedReason = text.slice(0, 240);
    dimensions[key] = cell;
    assessments[key] = okAssessment(
      {
        rating: rated,
        supported: true,
        contradicted: false,
        source_url: ENTERED_URL,
        quote: text.slice(0, 240),
        reason: text.slice(0, 240),
      },
      [ENTERED_URL],
      { searchUsed: true }
    );
    changed = true;
  }
  if (!changed) return;
  next.f4 = { ...(next.f4 || {}), techShiftRisk: { ...risk, dimensions } };
  findings.f4 = { ...f4f, assessments };
}

function passItem(item, text) {
  return {
    ...item,
    status: "done",
    text,
    level: "strong",
    credit: 1,
    reasons: ["SUPPORTED"],
  };
}

function analyticalDone(item) {
  if (!item || item.formAdmin) return false;
  return item.status === "done" || Number(item.credit) >= 1;
}

/**
 * Already-sealed checks, with the same credit applied so the open page
 * matches the next Submit. Returns the checks and whether a scored slot rose.
 */
export function liftSealedChecks(checks, doc) {
  const source = checks && typeof checks === "object" ? checks : {};
  const next = {
    ...source,
    f1: source.f1
      ? { ...source.f1, items: Array.isArray(source.f1.items) ? source.f1.items.map((it) => ({ ...it })) : source.f1.items }
      : source.f1,
    f2: source.f2
      ? { ...source.f2, items: Array.isArray(source.f2.items) ? source.f2.items.map((it) => ({ ...it })) : source.f2.items }
      : source.f2,
    f4: source.f4
      ? { ...source.f4, items: Array.isArray(source.f4.items) ? source.f4.items.map((it) => ({ ...it })) : source.f4.items }
      : source.f4,
  };
  let creditRaised = false;

  const creditDoc = scoringDocForEnteredCredit(doc || {});
  const f1Items = Array.isArray(next.f1?.items) ? next.f1.items : [];
  for (const field of CLAIM_FIELDS) {
    const text = claimTextForCredit(doc || {}, field);
    if (!text) continue;
    for (const item of f1Items) {
      if (String(item?.slot || "") !== field.slot) continue;
      if (analyticalDone(item)) continue;
      const label = field.key === "gapDerivation" ? "Gap derivation" : field.key === "parityExceptions" ? "Parity exceptions" : "Growth argument";
      Object.assign(item, passItem(item, `${label} entered and supported`));
      creditRaised = true;
    }
  }
  const route = validRoute(creditDoc?.f1?.growthRoute);
  if (route) {
    for (const item of f1Items) {
      if (String(item?.slot || "") !== "route") continue;
      if (analyticalDone(item)) continue;
      Object.assign(item, passItem(item, `Growth route "${route}" matches the buyer`));
      creditRaised = true;
    }
  }

  if (marginClearsFloor(doc || {})) {
    const f2Items = Array.isArray(next.f2?.items) ? next.f2.items : [];
    const margin = numberOrNull(doc?.f2?.netMarginAtScale);
    const floor = lockedFloorForProposition(doc || {});
    const gst = numberOrNull(doc?.f2?.gstRatePct);
    for (const item of f2Items) {
      const slot = String(item?.slot || "");
      if (slot === "margin" && !analyticalDone(item)) {
        Object.assign(
          item,
          passItem(item, `Net margin ${margin}% clears the ${floor}% division minimum`)
        );
        creditRaised = true;
      }
      if (slot === "gst" && gst != null && gst >= 0 && !analyticalDone(item)) {
        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        const asksEvidence = /contradict|attach proof|evidence/i.test(String(item.text || ""));
        if (reasons.includes("CONTRADICTED") || reasons.includes("MARKED_DOWN") || asksEvidence) {
          Object.assign(item, passItem(item, `GST rate ${gst}% entered`));
          creditRaised = true;
        }
      }
      if (slot === "finance" || /verified evidence/i.test(String(item.text || ""))) {
        item.text = "Finance confirmation is optional and does not change this score.";
        item.reasons = [];
      }
    }
    const bySlot = Object.fromEntries(f2Items.filter((it) => it?.slot).map((it) => [it.slot, it]));
    const cleared =
      analyticalDone(bySlot.margin) && analyticalDone(bySlot.packSize) && analyticalDone(bySlot.gst);
    if (cleared && next.f2) {
      next.f2.checkLabel = "Cleared";
      next.f2.markedDown = false;
    }
  }

  const f4Items = Array.isArray(next.f4?.items) ? next.f4.items : [];
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const label = DIMENSION_LABELS[key] || key;
    const text = enteredF4Text(doc || {}, key);
    if (!text) continue;
    for (const item of f4Items) {
      if (!String(item?.text || "").toLowerCase().includes(String(label).toLowerCase())) continue;
      if (f4AnswerPasses(doc || {}, key)) {
        if (!analyticalDone(item)) {
          Object.assign(item, passItem(item, `${label}: what you entered counts. It is not marked down.`));
          creditRaised = true;
        }
      } else {
        const suggestion = f4Improvement(doc || {}, key);
        if (suggestion) item.text = suggestion;
      }
    }
  }
  if (next.f4 && f4Items.length && f4Items.every((it) => it.formAdmin || analyticalDone(it))) {
    next.f4.checkLabel = "Cleared";
    next.f4.markedDown = false;
  }

  return { checks: next, creditRaised };
}
