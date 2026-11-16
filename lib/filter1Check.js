/**
 * Part 133 (relevance) / Part 138 — Filter 1 seven-check scoring
 * (benchmark, gap, attributes, derivation, parity, route, argument).
 * Credit comes only from assessed relevance levels (never from a non-empty field).
 * Each item: { status, text, slot, code, level, credit, reasons, gainPct }.
 * Browser-safe: no I/O, no LLM. Do not use the shared item() helper (it drops slot).
 */
import {
  DECLARED_GAP_FLOOR,
  AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION,
  SCORE_CHECK_SLOTS_TOTAL,
  RELEVANCE_SHADOW_MODE,
} from "./lockedConstants.js";
import { reviewInputs } from "./inputReview.js";
import {
  RELEVANCE_CREDIT,
  gradeAssessment,
  isTooShort,
  hasEnteredText,
} from "./relevanceGrade.js";

export const F1_SLOTS = Object.freeze([
  "benchmark",
  "gap",
  "attributes",
  "derivation",
  "parity",
  "route",
  "argument",
]);

export const F1_ITEM_CODES = Object.freeze({
  F1_BENCHMARK_STRONG: "F1_BENCHMARK_STRONG",
  F1_BENCHMARK_NOT_ENTERED: "F1_BENCHMARK_NOT_ENTERED",
  F1_BENCHMARK_TOO_SHORT: "F1_BENCHMARK_TOO_SHORT",
  F1_BENCHMARK_NOT_ASSESSED: "F1_BENCHMARK_NOT_ASSESSED",
  F1_BENCHMARK_NOT_CITED: "F1_BENCHMARK_NOT_CITED",
  F1_BENCHMARK_WEAK_MATCH: "F1_BENCHMARK_WEAK_MATCH",
  F1_BENCHMARK_ADEQUATE_MATCH: "F1_BENCHMARK_ADEQUATE_MATCH",
  F1_BENCHMARK_NOT_RELEVANT: "F1_BENCHMARK_NOT_RELEVANT",
  F1_BENCHMARK_COMPETITORS_FOUND: "F1_BENCHMARK_COMPETITORS_FOUND",
  F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED: "F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED",
  F1_GAP_BELOW_FLOOR: "F1_GAP_BELOW_FLOOR",
  F1_GAP_MISSING: "F1_GAP_MISSING",
  F1_GAP_STRONG: "F1_GAP_STRONG",
  F1_ATTRIBUTES_STRONG: "F1_ATTRIBUTES_STRONG",
  F1_ATTRIBUTES_NOT_ENTERED: "F1_ATTRIBUTES_NOT_ENTERED",
  F1_ATTRIBUTES_TOO_SHORT: "F1_ATTRIBUTES_TOO_SHORT",
  F1_ATTRIBUTES_NO_EVIDENCE: "F1_ATTRIBUTES_NO_EVIDENCE",
  F1_ATTRIBUTES_NOT_ASSESSED: "F1_ATTRIBUTES_NOT_ASSESSED",
  F1_ATTRIBUTES_NEEDS_CONFIRMATION: "F1_ATTRIBUTES_NEEDS_CONFIRMATION",
  F1_ATTRIBUTES_NOT_SPECIFIC: "F1_ATTRIBUTES_NOT_SPECIFIC",
  F1_DERIVATION_STRONG: "F1_DERIVATION_STRONG",
  F1_DERIVATION_NOT_ENTERED: "F1_DERIVATION_NOT_ENTERED",
  F1_DERIVATION_TOO_SHORT: "F1_DERIVATION_TOO_SHORT",
  F1_DERIVATION_NEEDS_CONFIRMATION: "F1_DERIVATION_NEEDS_CONFIRMATION",
  F1_DERIVATION_NOT_ASSESSED: "F1_DERIVATION_NOT_ASSESSED",
  F1_DERIVATION_CONTRADICTED: "F1_DERIVATION_CONTRADICTED",
  F1_DERIVATION_NOT_SPECIFIC: "F1_DERIVATION_NOT_SPECIFIC",
  F1_PARITY_STRONG: "F1_PARITY_STRONG",
  F1_PARITY_NOT_ENTERED: "F1_PARITY_NOT_ENTERED",
  F1_PARITY_TOO_SHORT: "F1_PARITY_TOO_SHORT",
  F1_PARITY_NEEDS_CONFIRMATION: "F1_PARITY_NEEDS_CONFIRMATION",
  F1_PARITY_NOT_ASSESSED: "F1_PARITY_NOT_ASSESSED",
  F1_PARITY_CONTRADICTED: "F1_PARITY_CONTRADICTED",
  F1_PARITY_NOT_SPECIFIC: "F1_PARITY_NOT_SPECIFIC",
  F1_ROUTE_STRONG: "F1_ROUTE_STRONG",
  F1_ROUTE_NOT_ENTERED: "F1_ROUTE_NOT_ENTERED",
  F1_ROUTE_NEEDS_CONFIRMATION: "F1_ROUTE_NEEDS_CONFIRMATION",
  F1_ROUTE_NOT_ASSESSED: "F1_ROUTE_NOT_ASSESSED",
  F1_ROUTE_MISMATCH: "F1_ROUTE_MISMATCH",
  F1_ROUTE_UNCLEAR: "F1_ROUTE_UNCLEAR",
  F1_ARGUMENT_STRONG: "F1_ARGUMENT_STRONG",
  F1_ARGUMENT_NOT_ENTERED: "F1_ARGUMENT_NOT_ENTERED",
  F1_ARGUMENT_TOO_SHORT: "F1_ARGUMENT_TOO_SHORT",
  F1_ARGUMENT_NEEDS_CONFIRMATION: "F1_ARGUMENT_NEEDS_CONFIRMATION",
  F1_ARGUMENT_NOT_ASSESSED: "F1_ARGUMENT_NOT_ASSESSED",
  F1_ARGUMENT_CONTRADICTED: "F1_ARGUMENT_CONTRADICTED",
  F1_BENCHMARK_INPUT_INVALID: "F1_BENCHMARK_INPUT_INVALID",
  F1_ATTRIBUTES_INPUT_INVALID: "F1_ATTRIBUTES_INPUT_INVALID",
  F1_DERIVATION_INPUT_INVALID: "F1_DERIVATION_INPUT_INVALID",
  F1_PARITY_INPUT_INVALID: "F1_PARITY_INPUT_INVALID",
  F1_ARGUMENT_INPUT_INVALID: "F1_ARGUMENT_INPUT_INVALID",
  F1_NOT_APPLICABLE: "F1_NOT_APPLICABLE",
  F1_RESEARCH_FAILED: "F1_RESEARCH_FAILED",
});

function trim(v) {
  return String(v ?? "").trim();
}

function gainPct(credit) {
  const c = Number(credit);
  const remaining = Number.isFinite(c) ? Math.max(0, 1 - c) : 1;
  return Math.round((remaining * 100) / SCORE_CHECK_SLOTS_TOTAL);
}

function row({ status, text, slot, code, level, credit, reasons, finding }) {
  const out = {
    status,
    text,
    slot,
    code,
    level: level || "none",
    credit: Number.isFinite(Number(credit)) ? Number(credit) : 0,
    reasons: Array.isArray(reasons) ? reasons : [],
    gainPct: gainPct(credit),
  };
  // Part 141 — optional finding: why, where, and what was quoted.
  if (finding && typeof finding === "object") {
    const reason = trim(finding.reason);
    const sourceUrl = trim(finding.source_url);
    const quote = trim(finding.quote);
    const guard = trim(finding.guard);
    if (reason) out.reason = reason;
    if (sourceUrl) {
      out.source_url = sourceUrl;
      out.sources = [sourceUrl];
    }
    if (quote) out.quote = quote;
    if (guard) out.guard = guard;
  }
  return out;
}

/** Part 141 — pull reason / source_url / quote from an assessment raw (any may be absent). */
function findingFromRaw(raw, extra = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    reason: r.reason,
    source_url: r.source_url || r.sourceUrl,
    quote: r.quote,
    ...extra,
  };
}

function strongRow(text, slot, code = `F1_${slot.toUpperCase()}_STRONG`) {
  return row({
    status: "done",
    text,
    slot,
    code,
    level: "strong",
    credit: RELEVANCE_CREDIT.strong,
    reasons: [],
  });
}

function fromGrade(slot, text, grade, codeOverride, finding) {
  const level = grade.level || "none";
  const credit = grade.credit ?? RELEVANCE_CREDIT[level] ?? 0;
  const first = (grade.reasons && grade.reasons[0]) || "NOT_ASSESSED";
  const code =
    codeOverride ||
    (level === "strong" ? `F1_${slot.toUpperCase()}_STRONG` : `F1_${slot.toUpperCase()}_${first}`);
  return row({
    status: level === "strong" ? "done" : "pending",
    text,
    slot,
    code: F1_ITEM_CODES[code] || code,
    level,
    credit,
    reasons: grade.reasons || [],
    finding,
  });
}

/**
 * Part 141 D73 — an input the review marks invalid never earns AI credit.
 * Returns a zero-credit item (reason INPUT_INVALID, guard "input-invalid"), or null when the field is fine.
 */
function invalidGuardItem(slot, label, issue) {
  if (!issue) return null;
  const message = trim(issue.message) || `${label} does not read as a real entry — replace it with a clear value`;
  return fromGrade(
    slot,
    `Fix this input before it can score: ${message}`,
    { level: "none", credit: 0, reasons: ["INPUT_INVALID"] },
    F1_ITEM_CODES[`F1_${slot.toUpperCase()}_INPUT_INVALID`] || `F1_${slot.toUpperCase()}_INPUT_INVALID`,
    { reason: message, guard: "input-invalid" }
  );
}

function namedCompetitors(check) {
  return (Array.isArray(check?.majorCompetitorsFound) ? check.majorCompetitorsFound : [])
    .map((name) => trim(name))
    .filter(Boolean);
}

/** Explicit gap of 0 with empty benchmark — a first-mover claim (blank gap is not a claim). */
export function isExplicitFirstMoverClaim(f1 = {}) {
  const gapRaw = f1.declaredGap;
  if (gapRaw == null || gapRaw === "") return false;
  const gapNum = Number(gapRaw);
  if (!(Number.isFinite(gapNum) && gapNum === 0)) return false;
  return !trim(f1.benchmark);
}

export function hasEvidenceSource(f1 = {}) {
  const link = trim(f1.evidenceSourceDate || f1.evidenceSourceLink || f1.evidenceSourceUrl);
  const file = f1.evidenceSourceFile;
  const hasFile =
    file &&
    typeof file === "object" &&
    (trim(file.name) || trim(file.data) || trim(file.sha256) || Number(file.size) > 0);
  return Boolean(link || hasFile);
}

export function textConfirmedByPerson(path, currentValue, autofillStatus = {}) {
  if (!AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION) return true;
  const entry = autofillStatus?.[path];
  if (!entry || typeof entry !== "object") return true;
  if (entry.confirmed === true) return true;
  const suggested = entry.aiSuggested;
  if (suggested == null || suggested === "") return true;
  const cur = typeof currentValue === "string" ? currentValue.trim() : currentValue;
  const sug =
    typeof suggested === "string"
      ? suggested.trim()
      : suggested != null
        ? String(suggested).trim()
        : "";
  if (cur !== sug) return true;
  return false;
}

function assessmentsOf(findings) {
  return findings?.assessments && typeof findings.assessments === "object" ? findings.assessments : {};
}

/** Map legacy binary benchmarkCheck into a relevance raw when assessments are missing. */
function legacyBenchmarkRaw(findings) {
  const bc = findings?.benchmarkCheck;
  if (!bc) return null;
  const status = String(bc.status || "").toLowerCase();
  if (status === "relevant") return { relevance: "strong", source_url: bc.source_url, reason: bc.reason };
  if (status === "not-relevant") return { relevance: "weak", source_url: bc.source_url, reason: bc.reason };
  return { relevance: "none", source_url: bc.source_url, reason: bc.reason };
}

function legacyRouteRaw(findings, selected) {
  const rc = findings?.routeCheck;
  if (!rc) return null;
  // New plan-check shape
  if (rc.matches) return rc;
  const expected = trim(rc.expected || rc.expectedRoute);
  const confidence = String(rc.confidence || "").toLowerCase();
  if (!expected) return { matches: "unclear", confidence: confidence || "low", reason: rc.reason };
  if (expected.toLowerCase() === String(selected || "").toLowerCase()) {
    return { matches: "yes", confidence: confidence || "medium", expected, reason: rc.reason };
  }
  return { matches: "no", confidence: confidence || "low", expected, reason: rc.reason };
}

function legacyClaimRaw(findings, key) {
  const block = findings?.claimChecks?.[key];
  if (!block) return null;
  // New shape already has relevance
  if (block.relevance) return block;
  const verdict = String(block.verdict || "").toLowerCase();
  const claims = Array.isArray(block.claims) ? block.claims : [];
  const hit = claims.find((c) => c?.verdict === "contradicted") || claims.find((c) => c?.verdict === "supported");
  if (verdict === "contradicted" || hit?.verdict === "contradicted") {
    return {
      relevance: "none",
      specific: true,
      supported: false,
      contradicted: true,
      source_url: hit?.source_url,
      quote: hit?.quote,
    };
  }
  if (verdict === "supported" || hit?.verdict === "supported") {
    return {
      relevance: "strong",
      specific: true,
      supported: true,
      source_url: hit?.source_url,
      quote: hit?.quote,
    };
  }
  // Unverified / empty — treated as assessed adequate if we ran the call
  return { relevance: "adequate", specific: true, supported: false };
}

/** Part 138 D48 — growth route "new market" has no incumbent benchmark to name. */
export function isNewMarketRoute(f1 = {}) {
  return /^new[\s_-]*market$/i.test(trim(f1.growthRoute));
}

/**
 * Part 138 D51 — one claim item (derivation or parity), each with its own entered text.
 */
function claimItem({
  slot,
  label,
  value,
  path,
  stored,
  legacy,
  legacySources,
  autofillStatus,
  notEnteredText,
  codes,
  invalidIssue,
}) {
  const text = trim(value);
  if (!text) {
    return fromGrade(slot, notEnteredText, { level: "none", credit: 0, reasons: ["NOT_ENTERED"] }, codes.notEntered);
  }
  if (isTooShort(text)) {
    return fromGrade(
      slot,
      "Describe this properly: one word or letter cannot be assessed",
      { level: "none", credit: 0, reasons: ["TOO_SHORT"] },
      codes.tooShort
    );
  }
  const invalidItem = invalidGuardItem(slot, label, invalidIssue);
  if (invalidItem) return invalidItem;
  if (!textConfirmedByPerson(path, value, autofillStatus)) {
    return fromGrade(
      slot,
      `Written by AI: edit or confirm ${label} before it can score`,
      { level: "none", credit: 0, reasons: ["NEEDS_CONFIRMATION"] },
      codes.needsConfirmation,
      { guard: "needs-confirmation" }
    );
  }
  if (stored?.status === "failed") {
    return fromGrade(
      slot,
      `This check did not complete: ${stored.error || "The AI did not answer"}. Evaluate to try again`,
      { level: "none", credit: 0, reasons: ["RESEARCH_FAILED"] },
      F1_ITEM_CODES.F1_RESEARCH_FAILED
    );
  }
  const raw = stored?.raw || legacy || null;
  const returnedSources = stored?.returnedSources || legacySources || [];
  const grade = gradeAssessment("claims", raw, {
    entered: true,
    humanWritten: true,
    returnedSources,
    notAssessed: !raw,
  });
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  const textOut =
    grade.level === "strong"
      ? `${cap} entered and supported`
      : grade.reasons.includes("CONTRADICTED")
        ? `A claim in ${label} was contradicted${raw?.source_url ? ` — Source: ${raw.source_url}` : ""}${
            raw?.quote ? ` · Quote: "${raw.quote}"` : ""
          }`
        : grade.reasons.includes("NOT_ASSESSED")
          ? `${cap} awaiting fact-check — Evaluate to assess this`
          : `${cap} ${grade.level}`;
  return fromGrade(slot, textOut, grade, undefined, findingFromRaw(raw));
}

/**
 * @param {object} f1
 * @param {object} findings — researchFindings.f1
 * @param {{ autofillStatus?: object }} ctx
 */
export function computeF1(f1 = {}, findings = {}, ctx = {}) {
  const autofillStatus = ctx.autofillStatus || findings.autofillStatus || {};
  const assessments = assessmentsOf(findings);

  // Part 141 D73 — invalid free text never earns AI credit, whatever the AI said.
  const review =
    ctx.inputReview ||
    reviewInputs({
      f1,
      name: ctx.doc?.name,
      category: ctx.doc?.category,
      ideaDescription: ctx.doc?.ideaDescription,
      f2: ctx.doc?.f2,
    });
  const invalidByField = {};
  for (const issue of Array.isArray(review?.fields) ? review.fields : []) {
    if (issue.status === "invalid" && !invalidByField[issue.field]) invalidByField[issue.field] = issue;
  }
  const invalidFor = {
    benchmark: invalidByField.benchmark,
    attributes: invalidByField.declaredAttribute,
    derivation: invalidByField.gapDerivation,
    parity: invalidByField.parityExceptions,
    argument: invalidByField.growthArgument,
  };

  if (f1.pureCommodity) {
    return {
      checkLabel: "Exempt",
      items: F1_SLOTS.map((slot) =>
        strongRow("Pure commodity — differentiation floor does not apply", slot, F1_ITEM_CODES.F1_NOT_APPLICABLE)
      ),
    };
  }

  const firstMover = isExplicitFirstMoverClaim(f1);
  const noComp = findings.noCompetitorCheck;
  const competitors = namedCompetitors(noComp);
  const firstMoverChecked = firstMover && noComp && typeof noComp === "object";
  const firstMoverVerified = firstMoverChecked && competitors.length < 2;
  const firstMoverDisproved = firstMoverChecked && competitors.length >= 2;
  const firstMoverPending = firstMover && !noComp;

  // —— 1. benchmark ——
  let benchmarkItem;
  if (firstMoverVerified) {
    benchmarkItem = strongRow(
      "First-mover verified — benchmark check not applicable",
      "benchmark",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (firstMoverDisproved) {
    const named = competitors[0] || "a listed competitor";
    benchmarkItem = fromGrade(
      "benchmark",
      `First-mover claim is false — name a real competitor such as "${named}"`,
      { level: "none", credit: 0, reasons: ["COMPETITORS_FOUND"] },
      F1_ITEM_CODES.F1_BENCHMARK_COMPETITORS_FOUND
    );
  } else if (firstMoverPending) {
    benchmarkItem = fromGrade(
      "benchmark",
      "First-mover claim awaiting web check for established competitors",
      { level: "none", credit: 0, reasons: ["FIRST_MOVER_NOT_CHECKED"] },
      F1_ITEM_CODES.F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED
    );
  } else if (!hasEnteredText(f1.benchmark) && isNewMarketRoute(f1)) {
    // Part 138 D48 — a new market has no incumbent to benchmark against.
    benchmarkItem = strongRow(
      "Benchmark not applicable for a new market",
      "benchmark",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (!hasEnteredText(f1.benchmark)) {
    benchmarkItem = fromGrade(
      "benchmark",
      "Benchmark not named — enter a competitor brand · variant · pack",
      { level: "none", credit: 0, reasons: ["NOT_ENTERED"] },
      F1_ITEM_CODES.F1_BENCHMARK_NOT_ENTERED
    );
  } else if (isTooShort(f1.benchmark)) {
    benchmarkItem = fromGrade(
      "benchmark",
      "Describe the benchmark properly: one word or letter cannot be assessed",
      { level: "none", credit: 0, reasons: ["TOO_SHORT"] },
      F1_ITEM_CODES.F1_BENCHMARK_TOO_SHORT
    );
  } else if (invalidFor.benchmark) {
    benchmarkItem = invalidGuardItem("benchmark", "Benchmark", invalidFor.benchmark);
  } else if (
    assessments.benchmark?.status === "failed" ||
    (findings.researchFailed && !assessments.benchmark && !findings.benchmarkCheck)
  ) {
    const failReason = assessments.benchmark?.error || findings.error || "Research failed";
    benchmarkItem = fromGrade(
      "benchmark",
      `This check did not complete: ${failReason}. Evaluate to try again`,
      { level: "none", credit: 0, reasons: ["RESEARCH_FAILED"] },
      F1_ITEM_CODES.F1_RESEARCH_FAILED
    );
  } else {
    const stored = assessments.benchmark;
    const raw = stored?.status === "failed" ? null : stored?.raw || legacyBenchmarkRaw(findings);
    const bc = findings.benchmarkCheck;
    const returnedSources =
      stored?.returnedSources ||
      bc?.sources ||
      (bc?.source_url ? [bc.source_url] : []);
    const grade = gradeAssessment("benchmark", raw, {
      entered: true,
      tooShort: false,
      humanWritten: true,
      returnedSources,
      notAssessed: !raw || stored?.status === "failed",
    });
    const note = raw?.reason ? ` — ${trim(raw.reason)}` : "";
    const text =
      grade.level === "strong"
        ? `Benchmark relevant: ${trim(f1.benchmark)}${note}`
        : grade.reasons.includes("NOT_ASSESSED")
          ? "Named benchmark awaiting web check — Evaluate to assess this"
          : grade.reasons.includes("NOT_CITED")
            ? `Benchmark assessment lacked a returned source — name a competitor that shows up in a web search`
            : grade.level === "none"
              ? `Benchmark not found or not relevant: ${trim(f1.benchmark)}${note}`
              : `Benchmark ${grade.level}: ${trim(f1.benchmark)}${note}`;
    benchmarkItem = fromGrade("benchmark", text, grade, undefined, findingFromRaw(raw));
  }

  // —— 2. gap (numeric) ——
  let gapItem;
  const gapRaw = f1.declaredGap;
  const gapNum = Number(gapRaw);
  const hasGap = gapRaw != null && gapRaw !== "" && Number.isFinite(gapNum);

  if (firstMoverVerified) {
    gapItem = strongRow(
      "Declared gap of 0 accepted as a verified first-mover claim",
      "gap",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (firstMoverDisproved) {
    gapItem = fromGrade(
      "gap",
      `Declared gap of 0 is marked down (below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor) — competitors were found: ${competitors.join(", ")}`,
      { level: "none", credit: 0, reasons: ["BELOW_FLOOR", "MARKED_DOWN"] },
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  } else if (firstMoverPending) {
    gapItem = fromGrade(
      "gap",
      "First-mover gap of 0 awaiting competitor web check (not a hard stop yet)",
      { level: "none", credit: 0, reasons: ["FIRST_MOVER_NOT_CHECKED"] },
      F1_ITEM_CODES.F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED
    );
  } else if (!hasGap) {
    gapItem = fromGrade(
      "gap",
      "Declared gap missing — enter points on the 10-pt scale",
      { level: "none", credit: 0, reasons: ["NOT_ENTERED"] },
      F1_ITEM_CODES.F1_GAP_MISSING
    );
  } else if (gapNum >= DECLARED_GAP_FLOOR) {
    gapItem = strongRow(
      `Declared gap ${gapNum} clears the ${DECLARED_GAP_FLOOR.toFixed(1)} floor`,
      "gap",
      F1_ITEM_CODES.F1_GAP_STRONG
    );
  } else if (gapNum === 0 && trim(f1.benchmark)) {
    gapItem = fromGrade(
      "gap",
      `Declared gap 0 with a named benchmark is marked down (below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor)`,
      { level: "none", credit: 0, reasons: ["BELOW_FLOOR", "MARKED_DOWN"] },
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  } else {
    gapItem = fromGrade(
      "gap",
      `Declared gap ${gapNum} is marked down (below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor)`,
      { level: "none", credit: 0, reasons: ["BELOW_FLOOR", "MARKED_DOWN"] },
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  }

  // —— 3. attributes (Part 138 D50: credit from the entered text + web plan check, no evidence file) ——
  let attrItem;
  const attr1 = trim(f1.declaredAttribute);
  if (firstMoverVerified) {
    attrItem = strongRow(
      "First-mover verified — attribute check not required",
      "attributes",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (!attr1) {
    attrItem = fromGrade(
      "attributes",
      "Attribute 1 not declared — enter the purchase-driver benefit",
      { level: "none", credit: 0, reasons: ["NOT_ENTERED"] },
      F1_ITEM_CODES.F1_ATTRIBUTES_NOT_ENTERED
    );
  } else if (isTooShort(attr1)) {
    attrItem = fromGrade(
      "attributes",
      "Describe this properly: one word or letter cannot be assessed",
      { level: "none", credit: 0, reasons: ["TOO_SHORT"] },
      F1_ITEM_CODES.F1_ATTRIBUTES_TOO_SHORT
    );
  } else if (invalidFor.attributes) {
    attrItem = invalidGuardItem("attributes", "Attribute", invalidFor.attributes);
  } else {
    const human = textConfirmedByPerson("f1.declaredAttribute", f1.declaredAttribute, autofillStatus);
    const planStored = assessments.attributes;
    const planRaw = planStored?.status === "failed" ? null : planStored?.raw || null;
    const planGrade = gradeAssessment("plan", planRaw, {
      entered: true,
      humanWritten: human,
      notAssessed: !planRaw,
    });
    const text =
      planGrade.level === "strong"
        ? "Attribute claim read as strong on the web check"
        : planGrade.reasons.includes("NEEDS_CONFIRMATION")
          ? "Written by AI: edit or confirm the attribute before it can score"
          : planGrade.reasons.includes("NOT_ASSESSED")
            ? "Evaluate to assess this"
            : `Attribute ${planGrade.level}`;
    attrItem = fromGrade(
      "attributes",
      text,
      planGrade,
      undefined,
      findingFromRaw(planRaw, human ? {} : { guard: "needs-confirmation" })
    );
  }

  // —— 4. derivation (own entered text) ——
  const derivationItem = firstMoverVerified
    ? strongRow(
        "First-mover verified — gap derivation not applicable",
        "derivation",
        F1_ITEM_CODES.F1_NOT_APPLICABLE
      )
    : claimItem({
        slot: "derivation",
        label: "gap derivation",
        value: f1.gapDerivation,
        path: "f1.gapDerivation",
        stored: assessments.derivation,
        legacy: legacyClaimRaw(findings, "gapDerivation"),
        legacySources: findings.claimChecks?.gapDerivation?.sources,
        autofillStatus,
        notEnteredText: "Enter gap derivation — what we intend to beat on",
        codes: {
          notEntered: F1_ITEM_CODES.F1_DERIVATION_NOT_ENTERED,
          tooShort: F1_ITEM_CODES.F1_DERIVATION_TOO_SHORT,
          needsConfirmation: F1_ITEM_CODES.F1_DERIVATION_NEEDS_CONFIRMATION,
        },
        invalidIssue: invalidFor.derivation,
      });

  // —— 4b. parity (Part 138 D51: separate item, own entered text) ——
  const parityItem = firstMoverVerified
    ? strongRow(
        "First-mover verified — parity not applicable",
        "parity",
        F1_ITEM_CODES.F1_NOT_APPLICABLE
      )
    : claimItem({
        slot: "parity",
        label: "parity exceptions",
        value: f1.parityExceptions,
        path: "f1.parityExceptions",
        stored: assessments.parity,
        legacy: legacyClaimRaw(findings, "parityExceptions"),
        legacySources: findings.claimChecks?.parityExceptions?.sources,
        autofillStatus,
        notEnteredText: 'Enter parity exceptions — or type "none"',
        codes: {
          notEntered: F1_ITEM_CODES.F1_PARITY_NOT_ENTERED,
          tooShort: F1_ITEM_CODES.F1_PARITY_TOO_SHORT,
          needsConfirmation: F1_ITEM_CODES.F1_PARITY_NEEDS_CONFIRMATION,
        },
        invalidIssue: invalidFor.parity,
      });

  // —— 5. route ——
  let routeItem;
  const route = trim(f1.growthRoute);
  if (!route) {
    routeItem = fromGrade(
      "route",
      "Select a growth route: penetration, frequency, or new market",
      { level: "none", credit: 0, reasons: ["NOT_ENTERED"] },
      F1_ITEM_CODES.F1_ROUTE_NOT_ENTERED
    );
  } else if (!textConfirmedByPerson("f1.growthRoute", f1.growthRoute, autofillStatus)) {
    routeItem = fromGrade(
      "route",
      "Written by AI: edit or confirm the growth route before it can score",
      { level: "none", credit: 0, reasons: ["NEEDS_CONFIRMATION"] },
      F1_ITEM_CODES.F1_ROUTE_NEEDS_CONFIRMATION
    );
  } else if (assessments.route?.status === "failed") {
    routeItem = fromGrade(
      "route",
      `This check did not complete: ${assessments.route.error || "The AI did not answer"}. Evaluate to try again`,
      { level: "none", credit: 0, reasons: ["RESEARCH_FAILED"] },
      F1_ITEM_CODES.F1_RESEARCH_FAILED
    );
  } else {
    const stored = assessments.route;
    const raw = stored?.status === "failed" ? null : stored?.raw || legacyRouteRaw(findings, route);
    const grade = gradeAssessment("route", raw, {
      entered: true,
      humanWritten: true,
      notAssessed: !raw || stored?.status === "failed",
    });
    const expected = trim(raw?.expected);
    const text =
      grade.level === "strong"
        ? `Growth route "${route}" matches the target consumer`
        : grade.reasons.includes("ROUTE_MISMATCH")
          ? `Growth route mismatch — AI expects "${expected || "a different route"}"${
              raw?.reason ? ` (${trim(raw.reason)})` : ""
            }`
          : grade.reasons.includes("NOT_ASSESSED")
            ? "Growth route awaiting AI check — Evaluate to assess this"
            : `Growth route "${route}" — ${grade.level}`;
    routeItem = fromGrade("route", text, grade, undefined, findingFromRaw(raw));
  }

  // —— 6. argument ——
  let argumentItem;
  const argument = trim(f1.growthArgument);
  if (!argument) {
    argumentItem = fromGrade(
      "argument",
      "Write a growth argument with facts and data that can be checked",
      { level: "none", credit: 0, reasons: ["NOT_ENTERED"] },
      F1_ITEM_CODES.F1_ARGUMENT_NOT_ENTERED
    );
  } else if (isTooShort(argument)) {
    argumentItem = fromGrade(
      "argument",
      "Describe this properly: one word or letter cannot be assessed",
      { level: "none", credit: 0, reasons: ["TOO_SHORT"] },
      F1_ITEM_CODES.F1_ARGUMENT_TOO_SHORT
    );
  } else if (invalidFor.argument) {
    argumentItem = invalidGuardItem("argument", "Growth argument", invalidFor.argument);
  } else if (!textConfirmedByPerson("f1.growthArgument", f1.growthArgument, autofillStatus)) {
    argumentItem = fromGrade(
      "argument",
      "Written by AI: edit or confirm the growth argument before it can score",
      { level: "none", credit: 0, reasons: ["NEEDS_CONFIRMATION"] },
      F1_ITEM_CODES.F1_ARGUMENT_NEEDS_CONFIRMATION,
      { guard: "needs-confirmation" }
    );
  } else if (assessments.argument?.status === "failed") {
    argumentItem = fromGrade(
      "argument",
      `This check did not complete: ${assessments.argument.error || "The AI did not answer"}. Evaluate to try again`,
      { level: "none", credit: 0, reasons: ["RESEARCH_FAILED"] },
      F1_ITEM_CODES.F1_RESEARCH_FAILED
    );
  } else {
    const stored = assessments.argument;
    const raw = stored?.status === "failed" ? null : stored?.raw || legacyClaimRaw(findings, "growthArgument");
    const returnedSources = stored?.returnedSources || findings.claimChecks?.growthArgument?.sources || [];
    const grade = gradeAssessment("claims", raw, {
      entered: true,
      humanWritten: true,
      returnedSources,
      notAssessed: !raw || stored?.status === "failed",
    });
    const text =
      grade.level === "strong"
        ? "Growth argument entered and supported"
        : grade.reasons.includes("CONTRADICTED")
          ? `Growth argument data was contradicted${
              raw?.source_url ? ` — Source: ${raw.source_url}` : ""
            }${raw?.quote ? ` · Quote: "${raw.quote}"` : ""}`
          : grade.reasons.includes("NOT_ASSESSED")
            ? "Growth argument awaiting fact-check — Evaluate to assess this"
            : `Growth argument ${grade.level}`;
    argumentItem = fromGrade("argument", text, grade, undefined, findingFromRaw(raw));
  }

  const items = [benchmarkItem, gapItem, attrItem, derivationItem, parityItem, routeItem, argumentItem];

  // Part 138 D49 — a gap below the floor (incl. gap 0 beside a named benchmark) is a mark-down, never a hard stop.
  const gapMarkedDown =
    gapItem.status === "pending" &&
    Array.isArray(gapItem.reasons) &&
    gapItem.reasons.includes("MARKED_DOWN");

  let checkLabel;
  if (gapMarkedDown) checkLabel = "Marked down";
  else if (items.every((i) => i.status === "done" || i.level === "strong")) checkLabel = "Cleared";
  else checkLabel = "Evidence missing";

  return {
    checkLabel,
    markedDown: gapMarkedDown,
    items,
    // Shadow helpers: relevance points already on items via credit
    scoringModel: "relevance",
    shadowMode: RELEVANCE_SHADOW_MODE,
  };
}

export function checkF1(f1 = {}, findings = {}, ctx = {}) {
  const hasInput = Object.entries(f1 || {}).some(([k, v]) => {
    if (["forumVerdict", "verdictNote"].includes(k)) return false;
    if (v == null || v === "") return false;
    if (typeof v === "boolean") return v === true;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "object") return Object.keys(v).length > 0;
    return String(v).trim() !== "";
  });
  if (!hasInput) return { checkLabel: "Not yet run", items: [] };
  return computeF1(f1, findings, ctx);
}
