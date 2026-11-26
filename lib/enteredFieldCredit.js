/**
 * Person-entered Filter 1 claims and a clearing Filter 2 margin are credited
 * before the locked scorer runs, and again when a sealed page is shown.
 * The locked graders stay unchanged. Browser-safe: no I/O.
 */
import { okAssessment } from "./assessmentResult.js";
import {
  difficultyFromDoc,
  gstClearsLevel2,
  packSizeClearsLevel2,
  volumeLossNoteClearsLevel2,
} from "./difficultyLevel.js";
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
  return /^(none|nil|null|n a|na|nothing|nope|not applicable|no gap|no derivation|no exception|no exceptions|no argument|tbd|tba|yes|no|ok|okay|y|n)$/.test(
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
  const raw = norm(doc?.f1?.[field.key]);
  // A typed stub (no, none, yes) does not count, even when a suggestion exists.
  if (raw && isPlaceholderClaim(raw)) return "";
  const typed = realClaim(raw);
  if (typed) return typed;
  if (!raw) return suggestionFor(doc, field.path);
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
  const synced = syncF4ViewsForScore(doc);
  const next = {
    ...synced,
    f1: { ...(synced.f1 || {}) },
    f2: { ...(synced.f2 || {}) },
    f4: synced.f4 && typeof synced.f4 === "object" ? { ...synced.f4 } : synced.f4,
  };
  const findings = copyFindings(synced);

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

  const route = validRoute(next.f1.growthRoute);
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

/** Drop Closest-path rows for Filter 4 points the person has already cleared. */
export function dropClearedF4PathActions(actions, doc) {
  const list = Array.isArray(actions) ? actions : [];
  if (!doc) return list;
  return list.filter((action) => {
    const filterKey = String(action?.filter || "").trim().toLowerCase();
    if (filterKey !== "f4") return true;
    const line = String(action?.instruction || action?.text || "").toLowerCase();
    const dim = TECH_SHIFT_DIMENSIONS.find((key) => {
      const label = String(DIMENSION_LABELS[key] || key).toLowerCase();
      return label && line.includes(label);
    });
    // Matching views leave the path; Level 1 contradictions stay as output notes, not path gains.
    return !(dim && f4ViewClearsPoint(doc, dim));
  });
}

/**
 * True when the sealed Filter 4 snapshot still has an open row the person has now cleared
 * with Your view (paste / match). Forces a reseal even if the lock fingerprint did not move.
 * Sealed rows often store generic ITEM_COPY without the dimension name — then any cleared
 * Medium/High view still beats the seal.
 */
export function sealedF4OpenClearedByViews(doc, sealedF4) {
  const items = Array.isArray(sealedF4?.items) ? sealedF4.items : [];
  const open = items.filter(
    (item) => item && !item.formAdmin && item.status !== "done" && !(Number(item.credit) >= 1)
  );
  if (!doc || !open.length) return false;
  let labeledOpen = 0;
  for (const item of open) {
    const line = String(item.text || "").toLowerCase();
    const dim = TECH_SHIFT_DIMENSIONS.find((key) => {
      const label = String(DIMENSION_LABELS[key] || key).toLowerCase();
      return label && line.includes(label);
    });
    if (!dim) continue;
    labeledOpen += 1;
    if (f4ViewClearsPoint(doc, dim)) return true;
  }
  if (labeledOpen) return false;
  return TECH_SHIFT_DIMENSIONS.some((key) => {
    const risk = normalizeRiskLevel(doc?.f4?.techShiftRisk?.dimensions?.[key]?.risk);
    if (risk !== "Medium" && risk !== "High") return false;
    return f4ViewClearsPoint(doc, key);
  });
}

/**
 * The score lock fingerprints f4MitigationResponses, not f4.userInputs.
 * Copy every typed view into mitigations so pasting the AI finding unlocks
 * the sealed score / path instead of leaving a stale WATCH on the page.
 */
export function syncF4ViewsForScore(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const f4 = doc.f4 && typeof doc.f4 === "object" ? doc.f4 : null;
  if (!f4) return doc;
  const prev =
    f4.f4MitigationResponses && typeof f4.f4MitigationResponses === "object" && !Array.isArray(f4.f4MitigationResponses)
      ? { ...f4.f4MitigationResponses }
      : {};
  let changed = false;
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const text = enteredF4Text(doc, key);
    if (!text) continue;
    if (norm(prev[key]) === norm(text)) continue;
    prev[key] = text;
    changed = true;
  }
  if (!changed) return doc;
  return { ...doc, f4: { ...f4, f4MitigationResponses: prev } };
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

function contentWords(value) {
  return norm(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

/** Same sentence, or the same content words as the web-check suggestion. */
export function meansSameAsSuggestion(userText, suggestion) {
  if (overlapsEntered(userText, suggestion)) return true;
  const suggested = contentWords(suggestion);
  if (!suggested.length) return false;
  const typed = new Set(contentWords(userText));
  let hits = 0;
  for (const word of suggested) if (typed.has(word)) hits += 1;
  return hits * 2 >= suggested.length;
}

/** The web-check finding shown beside this point (and used for Level 1 paste-to-pass). */
export function f4SuggestionText(doc, key) {
  const quote = f4WebQuote(doc, key);
  if (quote) return quote;
  return realClaim(doc?.f4?.techShiftRisk?.dimensions?.[key]?.reason);
}

/**
 * The typed view matches the finding when it is the same sentence (or means the same).
 * Paste of the AI/web text clears the point at every level.
 * Check every text the UI might have shown (quote, reason, stored finding).
 */
export function f4AnswerPasses(doc, key) {
  const text = enteredF4Text(doc, key);
  if (!text) return false;
  const raw = doc?.researchFindings?.f4?.assessments?.[key]?.raw;
  const candidates = [
    f4SuggestionText(doc, key),
    f4WebQuote(doc, key),
    realClaim(doc?.f4?.techShiftRisk?.dimensions?.[key]?.reason),
    realClaim(raw?.quote),
    realClaim(raw?.reason),
  ].filter(Boolean);
  const seen = new Set();
  for (const suggestion of candidates) {
    const id = norm(suggestion).toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === norm(text).toLowerCase()) return true;
    if (meansSameAsSuggestion(text, suggestion)) return true;
  }
  return false;
}

/** Level 1: a typed view that does not mean the same as the online finding. */
export function f4ContradictsSuggestion(doc, key) {
  const text = enteredF4Text(doc, key);
  const suggestion = f4SuggestionText(doc, key);
  if (!text || !suggestion) return false;
  return !f4AnswerPasses(doc, key);
}

/** Level 1 credits any real view; Level 2+ still need a matching finding to clear. */
export function f4ViewClearsPoint(doc, key) {
  const text = enteredF4Text(doc, key);
  if (!text) return false;
  if (difficultyFromDoc(doc || {}) < 2) return true;
  return f4AnswerPasses(doc, key);
}

export function f4ClearedItemText(doc, key) {
  const label = DIMENSION_LABELS[key] || key;
  if (difficultyFromDoc(doc || {}) < 2 && f4ContradictsSuggestion(doc, key)) {
    return `${label}: what you entered counts. It contradicts what was found online.`;
  }
  return `${label}: cleared.`;
}

export function f4Improvement(doc, key) {
  const text = enteredF4Text(doc, key);
  if (!text || f4AnswerPasses(doc, key)) return "";
  const difficulty = difficultyFromDoc(doc || {});
  // Level 1: no tip. Level 3: the finding stays hidden, so do not tip them to paste it.
  if (difficulty < 2 || difficulty >= 3) return "";
  const quote = f4SuggestionText(doc, key);
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
    if (!f4ViewClearsPoint(next, key)) continue;
    const text = enteredF4Text(next, key);
    const cell = { ...(dimensions[key] && typeof dimensions[key] === "object" ? dimensions[key] : {}) };
    // Internal AI risk only — the form no longer collects a person-entered Low/Medium/High.
    const rated = normalizeRiskLevel(cell.risk) || "Low";
    if (!text) continue;
    const contradicted = f4ContradictsSuggestion(next, key);
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
        contradicted,
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
  const next = {
    ...item,
    status: "done",
    text,
    level: "strong",
    credit: 1,
    reasons: ["SUPPORTED"],
  };
  // Drop open-check codes so the sealed output keeps this cleared sentence
  // instead of re-rendering "run Filter 4 research" from ITEM_COPY.
  delete next.code;
  delete next.itemCode;
  return next;
}

function analyticalDone(item) {
  if (!item || item.formAdmin) return false;
  return item.status === "done" || Number(item.credit) >= 1;
}

const DOWN_REASONS = new Set(["MARKED_DOWN", "BELOW_FLOOR", "BELOW_MINIMUM", "CONTRADICTED", "NOT_RELEVANT", "ROUTE_MISMATCH"]);

function cloneChecks(checks) {
  const source = checks && typeof checks === "object" ? checks : {};
  const next = { ...source };
  for (const key of ["f1", "f2", "f3", "f4"]) {
    if (!source[key] || typeof source[key] !== "object") continue;
    next[key] = {
      ...source[key],
      items: Array.isArray(source[key].items) ? source[key].items.map((it) => ({ ...it })) : source[key].items,
    };
  }
  return next;
}

function slotItem(items, slot) {
  return (Array.isArray(items) ? items : []).find((it) => String(it?.slot || "") === slot) || null;
}

const MISSING_FILE_CODES = new Set([
  "F1_EVIDENCE_MISSING",
  "F1_EVIDENCE_UNREADABLE",
  "F1_EVIDENCE_NOT_READ",
  "F1_ATTRIBUTES_NO_EVIDENCE",
  "F3_RESILIENCE_CANNOT_ASSESS",
]);

/** The check is open only because no evidence file or Evidence Source link was uploaded. */
function missingEvidenceUpload(item) {
  if (!item || item.formAdmin) return false;
  if (MISSING_FILE_CODES.has(String(item.code || ""))) return true;
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  if (reasons.some((reason) => reason === "NO_EVIDENCE" || String(reason).startsWith("NO_EVIDENCE"))) return true;
  const text = String(item.text || "");
  return /upload (a |the )?(study|retail audit|evidence file)|paste (a |an )?link in Evidence Source|Evidence Source (proof|link)|no verified volume evidence|evidence file instead/i.test(
    text
  );
}

function stillMarkedDown(items) {
  return (Array.isArray(items) ? items : []).some((it) => {
    if (!it || it.formAdmin || analyticalDone(it)) return false;
    const reasons = Array.isArray(it.reasons) ? it.reasons : [];
    return reasons.some((reason) => DOWN_REASONS.has(reason));
  });
}

function settleFilter(check, hardDown) {
  if (!check || typeof check !== "object") return;
  const items = Array.isArray(check.items) ? check.items : [];
  if (!items.length) return;
  if (hardDown || stillMarkedDown(items)) {
    check.checkLabel = "Marked down";
    check.markedDown = true;
    return;
  }
  const allDone = items.every((it) => it.formAdmin || analyticalDone(it));
  check.markedDown = false;
  check.capsGo = false;
  check.checkLabel = allDone ? "Cleared" : "Evidence missing";
}

/**
 * Apply the screening pass rules after the locked graders run.
 * Name, category and the idea description are not score slots.
 * A filled answer passes except where a rule below still marks it down.
 */
export function easeScreeningChecks(checks, doc) {
  const next = cloneChecks(checks);
  let creditRaised = false;
  const f1 = doc?.f1 || {};
  const f1Items = Array.isArray(next.f1?.items) ? next.f1.items : [];
  const difficulty = difficultyFromDoc(doc || {});
  const apprentice = difficulty >= 2;
  // Level 3 Professional: web check is pass/fail — no Rookie soft credit on attribute,
  // benchmark, claims, route, GST or Filter 4 mismatches.
  const professional = difficulty >= 3;

  const give = (item, text) => {
    if (!item) return;
    const before = Number(item.credit);
    // A sealed partial credit is rebuilt as "done". It still has to raise the score.
    if (!(item.status === "done" && Number.isFinite(before) && before >= 1)) creditRaised = true;
    Object.assign(item, passItem(item, text));
  };
  const holdOpen = (item, text, reasons = ["NOT_ENTERED"]) => {
    if (!item) return;
    if (analyticalDone(item)) creditRaised = true;
    item.status = "pending";
    item.credit = 0;
    item.level = "none";
    item.reasons = reasons;
    item.text = text;
  };

  if (!professional) {
    if (norm(f1.declaredAttribute)) give(slotItem(f1Items, "attributes"), "Declared attribute entered");
    if (norm(f1.benchmark)) give(slotItem(f1Items, "benchmark"), "Benchmark entered");
  }

  const gap = numberOrNull(f1.declaredGap);
  const gapItem = slotItem(f1Items, "gap");
  const newMarket = /^new[\s_-]*market$/i.test(norm(f1.growthRoute));
  // Level 2+: gap must clear the 2.0 floor. Gap 0 still passes only on New Market.
  const gapPasses = apprentice
    ? (gap != null && gap >= 2) || (gap === 0 && newMarket)
    : (gap != null && gap > 1) || (gap === 0 && newMarket);
  const gapMarkedDown =
    gapItem &&
    gap != null &&
    !gapPasses &&
    !(gap === 0 && newMarket);
  if (gapItem && gapMarkedDown) {
    gapItem.status = "pending";
    gapItem.credit = 0;
    gapItem.level = "none";
    gapItem.reasons = ["BELOW_FLOOR", "MARKED_DOWN"];
    gapItem.text =
      gap === 1
        ? "Declared gap 1 is marked down"
        : apprentice
          ? `Declared gap ${gap} is marked down — Level 2 needs at least 2.0`
          : `Declared gap ${gap} is marked down`;
  } else if (gapItem && gapPasses && gap != null && gap > 0) {
    // Gap floor is a local rule at every level (not a web soft-pass).
    give(gapItem, `Declared gap ${gap} passes`);
  } else if (gapItem && gap === 0 && newMarket) {
    give(gapItem, "Declared gap 0 passes because the growth route is New Market");
  }

  const derivation = claimTextForCredit(doc || {}, { key: "gapDerivation", path: "f1.gapDerivation" });
  const parity = claimTextForCredit(doc || {}, { key: "parityExceptions", path: "f1.parityExceptions" });
  const route = validRoute(f1.growthRoute);
  const argument = claimTextForCredit(doc || {}, { key: "growthArgument", path: "f1.growthArgument" });
  if (!professional) {
    if (derivation) give(slotItem(f1Items, "derivation"), "Gap derivation entered and supported");
    else holdOpen(slotItem(f1Items, "derivation"), "Gap derivation needs a full sentence. One-word answers such as no, none or yes do not count.");

    if (parity) give(slotItem(f1Items, "parity"), "Parity exceptions entered and supported");
    else holdOpen(slotItem(f1Items, "parity"), "Parity exceptions need a full sentence. One-word answers such as no, none or yes do not count.");

    if (route) give(slotItem(f1Items, "route"), `Growth route "${route}" is selected`);

    // Level 1: any non-blank argument passes. Level 2: "none" and other stubs do not.
    if (apprentice) {
      if (argument) give(slotItem(f1Items, "argument"), "Growth argument entered and supported");
      else {
        holdOpen(
          slotItem(f1Items, "argument"),
          "Growth argument needs a full sentence. One-word answers such as no, none or yes do not count."
        );
      }
    } else if (norm(f1.growthArgument)) {
      give(slotItem(f1Items, "argument"), "Growth argument entered");
    }
  } else {
    // Level 3: attribute / benchmark / claims / route wait for the web check (strip soft preview credit).
    for (const slot of ["attributes", "benchmark", "derivation", "parity", "route", "argument"]) {
      const item = slotItem(f1Items, slot);
      if (!item) continue;
      const emptyClaim =
        (slot === "derivation" && !derivation) ||
        (slot === "parity" && !parity) ||
        (slot === "argument" && !argument);
      if (emptyClaim) {
        holdOpen(
          item,
          slot === "derivation"
            ? "Gap derivation needs a full sentence. One-word answers such as no, none or yes do not count."
            : slot === "parity"
              ? "Parity exceptions need a full sentence. One-word answers such as no, none or yes do not count."
              : "Growth argument needs a full sentence. One-word answers such as no, none or yes do not count."
        );
        continue;
      }
      if (analyticalDone(item) || Number(item.credit) > 0) {
        holdOpen(item, "Waiting for the web check on this point.", ["AWAITING_WEB"]);
      }
    }
  }

  if (next.f1) settleFilter(next.f1, Boolean(gapMarkedDown));

  const margin = numberOrNull(doc?.f2?.netMarginAtScale);
  const floor = lockedFloorForProposition(doc || {});
  const marginBelow = margin != null && floor != null && margin < floor;
  const f2Items = Array.isArray(next.f2?.items) ? next.f2.items : [];
  let packOrGstDown = false;
  for (const item of f2Items) {
    const slot = String(item?.slot || "");
    if (slot === "finance" || /verified evidence/i.test(String(item.text || ""))) {
      item.text = "Finance confirmation is optional and does not change this score.";
      item.reasons = [];
      continue;
    }
    if (slot === "margin") {
      if (marginBelow) {
        item.status = "pending";
        item.credit = 0;
        item.level = "none";
        item.reasons = ["BELOW_MINIMUM", "MARKED_DOWN"];
        item.text = `Net margin ${margin}% is below the ${floor}% division minimum`;
      } else if (margin != null && floor != null && margin >= floor) {
        give(item, `Net margin ${margin}% clears the ${floor}% division minimum`);
      } else {
        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        item.reasons = reasons.filter((reason) => !DOWN_REASONS.has(reason));
      }
      continue;
    }
    if (slot === "packSize") {
      if (apprentice) {
        if (packSizeClearsLevel2(doc?.f2?.grammage)) {
          give(item, "Pack size entered with a number and a unit");
        } else {
          packOrGstDown = true;
          holdOpen(
            item,
            'Pack size needs a number and a unit — "100" alone does not count. Use e.g. 100 ml or 100 g.',
            ["MARKED_DOWN", "NEEDS_UNIT"]
          );
        }
      } else {
        give(item, "Pack size entered. Filter 2 does not mark this down.");
      }
      continue;
    }
    if (slot === "gst") {
      if (apprentice) {
        if (gstClearsLevel2(doc?.f2?.gstRatePct)) {
          if (professional) {
            // Level 3: on-list GST still waits for the web check.
            holdOpen(item, "Waiting for the web check on this point.", ["AWAITING_WEB"]);
          } else {
            give(item, `GST rate ${Number(doc.f2.gstRatePct)}% is on the standard list`);
          }
        } else {
          packOrGstDown = true;
          holdOpen(
            item,
            "GST must be one of 0, 3, 5, 12, 18, 28 or 40.",
            ["MARKED_DOWN", "NOT_STANDARD"]
          );
        }
      } else {
        give(item, "GST rate entered. Filter 2 does not mark this down.");
      }
    }
  }
  if (next.f2) settleFilter(next.f2, marginBelow || (apprentice && packOrGstDown));

  const note = norm(doc?.f3?.volumeLossJustification);
  const noteClears = apprentice ? volumeLossNoteClearsLevel2(note) : Boolean(note);
  if (note && noteClears) {
    if (!next.f3 || typeof next.f3 !== "object") {
      next.f3 = { checkLabel: "Cleared", markedDown: false, capsGo: false, items: [] };
    }
    const f3Items = Array.isArray(next.f3.items) ? next.f3.items : [];
    next.f3.items = f3Items;
    const resilience = slotItem(f3Items, "resilience") || f3Items[0] || null;
    if (resilience) give(resilience, "The volume-loss note is entered. It is not marked down.");
    else {
      f3Items.push(passItem({ slot: "resilience" }, "The volume-loss note is entered. It is not marked down."));
      creditRaised = true;
    }
    next.f3.checkLabel = "Cleared";
    next.f3.markedDown = false;
    next.f3.capsGo = false;
  } else if (apprentice && note && !noteClears) {
    if (!next.f3 || typeof next.f3 !== "object") {
      next.f3 = { checkLabel: "Marked down", markedDown: true, capsGo: true, items: [] };
    }
    const f3Items = Array.isArray(next.f3.items) ? next.f3.items : [];
    next.f3.items = f3Items;
    const resilience = slotItem(f3Items, "resilience") || f3Items[0] || null;
    const msg =
      "Level 2 needs a note on how the shelf price is held for five years and why volume loss stays inside 10%.";
    if (resilience) holdOpen(resilience, msg, ["MARKED_DOWN", "NOT_ENTERED"]);
    else {
      f3Items.push({
        slot: "resilience",
        status: "pending",
        credit: 0,
        level: "none",
        reasons: ["MARKED_DOWN", "NOT_ENTERED"],
        text: msg,
      });
    }
    settleFilter(next.f3, true);
  }

  if (!professional) {
    for (const key of ["f1", "f2", "f3", "f4"]) {
      const check = next[key];
      const items = Array.isArray(check?.items) ? check.items : [];
      let passedFile = false;
      for (const item of items) {
        if (!item || item.formAdmin || analyticalDone(item)) continue;
        if (!missingEvidenceUpload(item)) continue;
        // Do not erase a Level 2 (or other) mark-down that already closed this slot.
        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        if (reasons.some((reason) => DOWN_REASONS.has(reason))) continue;
        give(item, "An evidence file is not required. This is not marked down.");
        passedFile = true;
      }
      if (!passedFile || !check) continue;
      if (key === "f1") settleFilter(check, Boolean(gapMarkedDown));
      else if (key === "f2") settleFilter(check, marginBelow || (apprentice && packOrGstDown));
      else if (key === "f4") {
        if (items.every((it) => it.formAdmin || analyticalDone(it))) {
          check.checkLabel = "Cleared";
          check.markedDown = false;
          check.capsGo = false;
        }
      } else {
        settleFilter(check, false);
      }
    }
  }

  const f4Items = Array.isArray(next.f4?.items) ? next.f4.items : [];
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const label = DIMENSION_LABELS[key] || key;
    const text = enteredF4Text(doc || {}, key);
    const risk = normalizeRiskLevel(doc?.f4?.techShiftRisk?.dimensions?.[key]?.risk);
    for (const item of f4Items) {
      if (!String(item?.text || "").toLowerCase().includes(String(label).toLowerCase())) continue;
      // Medium/High need a view. Level 1: any real view clears (contradiction is noted, not marked down).
      // Level 2+: paste/match of the finding still clears; a mismatch stays open.
      if ((risk === "Medium" || risk === "High") && !text) {
        holdOpen(
          item,
          `${label}: add your view on this point (paste the finding beside it to clear).`,
          ["MARKED_DOWN", "NOT_ENTERED"]
        );
        continue;
      }
      if (!text) continue;
      if (f4ViewClearsPoint(doc || {}, key)) give(item, f4ClearedItemText(doc || {}, key));
      else {
        const suggestion = f4Improvement(doc || {}, key);
        if (suggestion) item.text = suggestion;
      }
    }
  }
  if (next.f4 && f4Items.length && f4Items.every((it) => it.formAdmin || analyticalDone(it))) {
    next.f4.checkLabel = "Cleared";
    next.f4.markedDown = false;
  } else if (next.f4 && f4Items.some((it) => !it?.formAdmin && !analyticalDone(it))) {
    settleFilter(next.f4, stillMarkedDown(f4Items));
  }

  // A partial relevance credit is not a mark-down. The path already hides it once
  // the seal rebuilds it as done, so the headline percent has to count the full point.
  const keepsZero = (item) => {
    if (!item || item.formAdmin) return true;
    const reasons = Array.isArray(item.reasons) ? item.reasons : [];
    if (reasons.some((reason) => DOWN_REASONS.has(reason) || reason === "ABOVE_CEILING" || reason === "NOT_ENTERED" || reason === "TOO_SHORT")) {
      return true;
    }
    return String(item.code || "") === "F3_RESILIENCE_FAIL";
  };
  for (const key of ["f1", "f2", "f3", "f4"]) {
    const check = next[key];
    const items = Array.isArray(check?.items) ? check.items : [];
    for (const item of items) {
      if (!item || keepsZero(item)) continue;
      const credit = Number(item.credit);
      if (!Number.isFinite(credit) || credit <= 0 || credit >= 1) continue;
      Object.assign(item, passItem(item, item.text || "This point is not marked down"));
      creditRaised = true;
    }
    if (!check || check.checkLabel === "Below floor") continue;
    if (!items.length || items.some((it) => !it?.formAdmin && !analyticalDone(it))) continue;
    if (stillMarkedDown(items)) continue;
    check.checkLabel = "Cleared";
    check.markedDown = false;
    check.capsGo = false;
    check.weakPass = false;
  }

  return { checks: next, creditRaised };
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
      if (f4ViewClearsPoint(doc || {}, key)) {
        if (!analyticalDone(item)) {
          Object.assign(item, passItem(item, f4ClearedItemText(doc || {}, key)));
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

  const eased = easeScreeningChecks(next, doc);
  return { checks: eased.checks, creditRaised: creditRaised || eased.creditRaised };
}
