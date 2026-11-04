/**
 * Part 133 — Filter 1 six-check scoring (browser-safe: no I/O, no LLM).
 * Each item is { status, text, slot, code }. Do not use the shared item() helper
 * (it drops slot).
 */
import {
  DECLARED_GAP_FLOOR,
  F1_EVIDENCE_CREDIT_MODE,
  AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION,
} from "./lockedConstants.js";

export const F1_SLOTS = Object.freeze([
  "benchmark",
  "gap",
  "attributes",
  "derivation",
  "route",
  "argument",
]);

export const F1_ITEM_CODES = Object.freeze({
  F1_BENCHMARK_RELEVANT: "F1_BENCHMARK_RELEVANT",
  F1_BENCHMARK_NOT_NAMED: "F1_BENCHMARK_NOT_NAMED",
  F1_BENCHMARK_NOT_CHECKED: "F1_BENCHMARK_NOT_CHECKED",
  F1_BENCHMARK_NOT_FOUND: "F1_BENCHMARK_NOT_FOUND",
  F1_BENCHMARK_NOT_RELEVANT: "F1_BENCHMARK_NOT_RELEVANT",
  F1_BENCHMARK_COMPETITORS_FOUND: "F1_BENCHMARK_COMPETITORS_FOUND",
  F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED: "F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED",
  F1_RESEARCH_FAILED: "F1_RESEARCH_FAILED",
  F1_GAP_BELOW_FLOOR: "F1_GAP_BELOW_FLOOR",
  F1_GAP_MISSING: "F1_GAP_MISSING",
  F1_GAP_OK: "F1_GAP_OK",
  F1_ATTRIBUTE_MISSING: "F1_ATTRIBUTE_MISSING",
  F1_EVIDENCE_MISSING: "F1_EVIDENCE_MISSING",
  F1_EVIDENCE_OK: "F1_EVIDENCE_OK",
  F1_EVIDENCE_UNREADABLE: "F1_EVIDENCE_UNREADABLE",
  F1_EVIDENCE_NOT_RELEVANT: "F1_EVIDENCE_NOT_RELEVANT",
  F1_EVIDENCE_NOT_READ: "F1_EVIDENCE_NOT_READ",
  F1_DERIVATION_MISSING: "F1_DERIVATION_MISSING",
  F1_PARITY_MISSING: "F1_PARITY_MISSING",
  F1_NEEDS_CONFIRMATION: "F1_NEEDS_CONFIRMATION",
  F1_CLAIM_NOT_CHECKED: "F1_CLAIM_NOT_CHECKED",
  F1_CLAIM_CONTRADICTED: "F1_CLAIM_CONTRADICTED",
  F1_DERIVATION_OK: "F1_DERIVATION_OK",
  F1_ROUTE_MISSING: "F1_ROUTE_MISSING",
  F1_ROUTE_NOT_CHECKED: "F1_ROUTE_NOT_CHECKED",
  F1_ROUTE_MISMATCH: "F1_ROUTE_MISMATCH",
  F1_ROUTE_OK: "F1_ROUTE_OK",
  F1_ARGUMENT_MISSING: "F1_ARGUMENT_MISSING",
  F1_ARGUMENT_NOT_CHECKED: "F1_ARGUMENT_NOT_CHECKED",
  F1_ARGUMENT_CONTRADICTED: "F1_ARGUMENT_CONTRADICTED",
  F1_ARGUMENT_OK: "F1_ARGUMENT_OK",
  F1_NOT_APPLICABLE: "F1_NOT_APPLICABLE",
});

function row(status, text, slot, code) {
  return { status, text, slot, code };
}

function trim(v) {
  return String(v ?? "").trim();
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

/**
 * AI-written suggestion earns nothing until a person confirms or edits away from aiSuggested.
 */
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
  if (cur !== sug) return true; // edited away from AI text
  return false;
}

function claimVerdictForText(claimChecks, key) {
  const block = claimChecks?.[key];
  if (!block || typeof block !== "object") return null;
  if (block.verdict) return String(block.verdict);
  const claims = Array.isArray(block.claims) ? block.claims : [];
  if (!claims.length) return block.status || "unverified";
  if (claims.some((c) => c?.verdict === "contradicted")) return "contradicted";
  if (claims.some((c) => c?.verdict === "supported")) return "supported";
  return "unverified";
}

function contradictionNote(claimChecks, key) {
  const block = claimChecks?.[key];
  const claims = Array.isArray(block?.claims) ? block.claims : [];
  const hit = claims.find((c) => c?.verdict === "contradicted");
  if (!hit) return "";
  const url = trim(hit.source_url || hit.sourceUrl);
  const quote = trim(hit.quote);
  const bits = [url ? `Source: ${url}` : "", quote ? `Quote: "${quote}"` : ""].filter(Boolean);
  return bits.length ? ` — ${bits.join(" · ")}` : "";
}

function evidenceRelevant(evidenceRead) {
  if (!evidenceRead || typeof evidenceRead !== "object") return false;
  if (evidenceRead.relevant === true) return true;
  const facts = Array.isArray(evidenceRead.facts) ? evidenceRead.facts : [];
  return facts.some(
    (f) =>
      f?.verified === true &&
      String(f?.topic || "").toLowerCase() !== "other" &&
      ["category", "benchmark", "attribute", "attributes", "declaredAttribute"].some((t) =>
        String(f?.topic || "")
          .toLowerCase()
          .includes(t)
      )
  );
}

/**
 * @param {object} f1
 * @param {object} findings — researchFindings.f1 (or flat findings with nested checks)
 * @param {{ evidenceRead?: object, autofillStatus?: object }} ctx
 */
export function computeF1(f1 = {}, findings = {}, ctx = {}) {
  const evidenceRead = ctx.evidenceRead || findings.evidenceRead || null;
  const autofillStatus = ctx.autofillStatus || findings.autofillStatus || {};

  if (f1.pureCommodity) {
    return {
      checkLabel: "Exempt",
      items: F1_SLOTS.map((slot) =>
        row("done", "Pure commodity — differentiation floor does not apply", slot, F1_ITEM_CODES.F1_NOT_APPLICABLE)
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
    benchmarkItem = row(
      "done",
      "First-mover verified — benchmark check not applicable",
      "benchmark",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (firstMoverDisproved) {
    const named = competitors[0] || "a listed competitor";
    benchmarkItem = row(
      "pending",
      `First-mover claim is false — name a real competitor such as "${named}"`,
      "benchmark",
      F1_ITEM_CODES.F1_BENCHMARK_COMPETITORS_FOUND
    );
  } else if (firstMoverPending) {
    benchmarkItem = row(
      "pending",
      "First-mover claim awaiting web check for established competitors",
      "benchmark",
      F1_ITEM_CODES.F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED
    );
  } else if (!trim(f1.benchmark)) {
    benchmarkItem = row(
      "pending",
      "Benchmark not named — enter a competitor brand · variant · pack",
      "benchmark",
      F1_ITEM_CODES.F1_BENCHMARK_NOT_NAMED
    );
  } else if (findings.researchFailed && !findings.benchmarkCheck) {
    benchmarkItem = row(
      "pending",
      "Research failed — retry Submit so the benchmark can be checked",
      "benchmark",
      F1_ITEM_CODES.F1_RESEARCH_FAILED
    );
  } else {
    const bc = findings.benchmarkCheck;
    const status = String(bc?.status || "").toLowerCase();
    if (!bc) {
      benchmarkItem = row(
        "pending",
        "Named benchmark awaiting web check for relevance in India",
        "benchmark",
        F1_ITEM_CODES.F1_BENCHMARK_NOT_CHECKED
      );
    } else if (status === "relevant") {
      benchmarkItem = row(
        "done",
        `Benchmark relevant: ${trim(f1.benchmark)}${bc.reason ? ` — ${trim(bc.reason)}` : ""}`,
        "benchmark",
        F1_ITEM_CODES.F1_BENCHMARK_RELEVANT
      );
    } else if (status === "not-found") {
      benchmarkItem = row(
        "pending",
        `Benchmark not found on sale in India — ${trim(bc.reason) || "replace with a real shelf product"}`,
        "benchmark",
        F1_ITEM_CODES.F1_BENCHMARK_NOT_FOUND
      );
    } else if (status === "not-relevant") {
      benchmarkItem = row(
        "pending",
        `Benchmark is not relevant to this idea/category — ${trim(bc.reason) || "name a closer competitor"}`,
        "benchmark",
        F1_ITEM_CODES.F1_BENCHMARK_NOT_RELEVANT
      );
    } else {
      benchmarkItem = row(
        "pending",
        "Named benchmark awaiting web check for relevance in India",
        "benchmark",
        F1_ITEM_CODES.F1_BENCHMARK_NOT_CHECKED
      );
    }
  }

  // —— 2. gap ——
  let gapItem;
  const gapRaw = f1.declaredGap;
  const gapNum = Number(gapRaw);
  const hasGap = gapRaw != null && gapRaw !== "" && Number.isFinite(gapNum);

  if (firstMoverVerified) {
    gapItem = row(
      "done",
      "Declared gap of 0 accepted as a verified first-mover claim",
      "gap",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (firstMoverDisproved) {
    gapItem = row(
      "pending",
      `Declared gap of 0 is below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor — competitors were found: ${competitors.join(", ")}`,
      "gap",
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  } else if (firstMoverPending) {
    gapItem = row(
      "pending",
      "First-mover gap of 0 awaiting competitor web check (not a hard stop yet)",
      "gap",
      F1_ITEM_CODES.F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED
    );
  } else if (!hasGap) {
    gapItem = row(
      "pending",
      "Declared gap missing — enter points on the 10-pt scale",
      "gap",
      F1_ITEM_CODES.F1_GAP_MISSING
    );
  } else if (gapNum >= DECLARED_GAP_FLOOR) {
    gapItem = row(
      "done",
      `Declared gap ${gapNum} clears the ${DECLARED_GAP_FLOOR.toFixed(1)} floor`,
      "gap",
      F1_ITEM_CODES.F1_GAP_OK
    );
  } else if (gapNum === 0 && trim(f1.benchmark)) {
    gapItem = row(
      "pending",
      `Declared gap 0 with a named benchmark is below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor`,
      "gap",
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  } else {
    gapItem = row(
      "pending",
      `Declared gap ${gapNum} is below the ${DECLARED_GAP_FLOOR.toFixed(1)} floor`,
      "gap",
      F1_ITEM_CODES.F1_GAP_BELOW_FLOOR
    );
  }

  // —— 3. attributes ——
  let attrItem;
  const attr1 = trim(f1.declaredAttribute);
  if (firstMoverVerified) {
    attrItem = row(
      "done",
      "First-mover verified — attribute evidence not required",
      "attributes",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (!attr1) {
    attrItem = row(
      "pending",
      "Attribute 1 not declared — enter the purchase-driver benefit",
      "attributes",
      F1_ITEM_CODES.F1_ATTRIBUTE_MISSING
    );
  } else if (!hasEvidenceSource(f1)) {
    attrItem = row(
      "pending",
      "Upload a study or paste an Evidence Source link to back the attribute claim",
      "attributes",
      F1_ITEM_CODES.F1_EVIDENCE_MISSING
    );
  } else if (F1_EVIDENCE_CREDIT_MODE === "presence") {
    attrItem = row(
      "done",
      "Evidence Source present — attribute claim credited",
      "attributes",
      F1_ITEM_CODES.F1_EVIDENCE_OK
    );
  } else {
    const status = String(evidenceRead?.status || "").toLowerCase();
    if (!evidenceRead || status === "none" || status === "pending") {
      attrItem = row(
        "pending",
        "Evidence Source attached — Submit so it can be read for relevance",
        "attributes",
        F1_ITEM_CODES.F1_EVIDENCE_NOT_READ
      );
    } else if (status === "unreadable" || status === "blocked") {
      attrItem = row(
        "pending",
        trim(evidenceRead.advice) ||
          "Evidence Source could not be read — upload the file instead of an external SharePoint link",
        "attributes",
        F1_ITEM_CODES.F1_EVIDENCE_UNREADABLE
      );
    } else if (evidenceRelevant(evidenceRead)) {
      attrItem = row(
        "done",
        "Evidence Source read and relevant to this idea's attributes/category",
        "attributes",
        F1_ITEM_CODES.F1_EVIDENCE_OK
      );
    } else {
      attrItem = row(
        "pending",
        "Evidence Source was read but is not relevant to this idea's category, benchmark or attributes",
        "attributes",
        F1_ITEM_CODES.F1_EVIDENCE_NOT_RELEVANT
      );
    }
  }

  // —— 4. derivation (gap derivation + parity) ——
  let derivationItem;
  const derivation = trim(f1.gapDerivation);
  const parity = trim(f1.parityExceptions);
  const parityOk = parity.length > 0; // "none" is valid
  if (firstMoverVerified) {
    derivationItem = row(
      "done",
      "First-mover verified — gap derivation / parity not applicable",
      "derivation",
      F1_ITEM_CODES.F1_NOT_APPLICABLE
    );
  } else if (!derivation) {
    derivationItem = row(
      "pending",
      "Enter gap derivation — what we intend to beat on",
      "derivation",
      F1_ITEM_CODES.F1_DERIVATION_MISSING
    );
  } else if (!parityOk) {
    derivationItem = row(
      "pending",
      'Enter parity exceptions — or type "none"',
      "derivation",
      F1_ITEM_CODES.F1_PARITY_MISSING
    );
  } else if (
    !textConfirmedByPerson("f1.gapDerivation", f1.gapDerivation, autofillStatus) ||
    !textConfirmedByPerson("f1.parityExceptions", f1.parityExceptions, autofillStatus)
  ) {
    derivationItem = row(
      "pending",
      "Written by AI: edit or confirm gap derivation and parity before they can score",
      "derivation",
      F1_ITEM_CODES.F1_NEEDS_CONFIRMATION
    );
  } else {
    const claimChecks = findings.claimChecks || {};
    const dVerdict = claimVerdictForText(claimChecks, "gapDerivation");
    const pVerdict = claimVerdictForText(claimChecks, "parityExceptions");
    if (!dVerdict && !pVerdict && !findings.claimChecks) {
      derivationItem = row(
        "pending",
        "Gap derivation and parity awaiting fact-check on Submit",
        "derivation",
        F1_ITEM_CODES.F1_CLAIM_NOT_CHECKED
      );
    } else if (dVerdict === "contradicted" || pVerdict === "contradicted") {
      const note =
        contradictionNote(claimChecks, dVerdict === "contradicted" ? "gapDerivation" : "parityExceptions") ||
        contradictionNote(claimChecks, "parityExceptions");
      derivationItem = row(
        "pending",
        `A claim in gap derivation or parity was contradicted${note}`,
        "derivation",
        F1_ITEM_CODES.F1_CLAIM_CONTRADICTED
      );
    } else {
      derivationItem = row(
        "done",
        "Gap derivation and parity entered and not contradicted",
        "derivation",
        F1_ITEM_CODES.F1_DERIVATION_OK
      );
    }
  }

  // —— 5. route ——
  let routeItem;
  const route = trim(f1.growthRoute);
  if (!route) {
    routeItem = row(
      "pending",
      "Select a growth route: penetration, frequency, or new market",
      "route",
      F1_ITEM_CODES.F1_ROUTE_MISSING
    );
  } else if (!textConfirmedByPerson("f1.growthRoute", f1.growthRoute, autofillStatus)) {
    routeItem = row(
      "pending",
      "Written by AI: edit or confirm the growth route before it can score",
      "route",
      F1_ITEM_CODES.F1_NEEDS_CONFIRMATION
    );
  } else {
    const rc = findings.routeCheck;
    if (!rc) {
      routeItem = row(
        "pending",
        "Growth route awaiting AI check on Submit",
        "route",
        F1_ITEM_CODES.F1_ROUTE_NOT_CHECKED
      );
    } else {
      const expected = trim(rc.expected || rc.expectedRoute);
      const confidence = String(rc.confidence || "").toLowerCase();
      const mismatch =
        expected &&
        expected.toLowerCase() !== route.toLowerCase() &&
        confidence === "high";
      if (mismatch) {
        routeItem = row(
          "pending",
          `Growth route mismatch — AI expects "${expected}" (${trim(rc.reason) || "high confidence"})`,
          "route",
          F1_ITEM_CODES.F1_ROUTE_MISMATCH
        );
      } else {
        routeItem = row(
          "done",
          `Growth route "${route}" selected${expected && expected !== route ? ` (AI noted "${expected}" at ${confidence || "lower"} confidence)` : ""}`,
          "route",
          F1_ITEM_CODES.F1_ROUTE_OK
        );
      }
    }
  }

  // —— 6. argument ——
  let argumentItem;
  const argument = trim(f1.growthArgument);
  if (!argument) {
    argumentItem = row(
      "pending",
      "Write a growth argument with facts and data that can be checked",
      "argument",
      F1_ITEM_CODES.F1_ARGUMENT_MISSING
    );
  } else if (!textConfirmedByPerson("f1.growthArgument", f1.growthArgument, autofillStatus)) {
    argumentItem = row(
      "pending",
      "Written by AI: edit or confirm the growth argument before it can score",
      "argument",
      F1_ITEM_CODES.F1_NEEDS_CONFIRMATION
    );
  } else {
    const claimChecks = findings.claimChecks || {};
    const aVerdict = claimVerdictForText(claimChecks, "growthArgument");
    if (!aVerdict && !findings.claimChecks) {
      argumentItem = row(
        "pending",
        "Growth argument awaiting fact-check on Submit",
        "argument",
        F1_ITEM_CODES.F1_ARGUMENT_NOT_CHECKED
      );
    } else if (aVerdict === "contradicted") {
      const note = contradictionNote(claimChecks, "growthArgument");
      argumentItem = row(
        "pending",
        `Growth argument data was contradicted${note}`,
        "argument",
        F1_ITEM_CODES.F1_ARGUMENT_CONTRADICTED
      );
    } else {
      argumentItem = row(
        "done",
        "Growth argument entered and not contradicted",
        "argument",
        F1_ITEM_CODES.F1_ARGUMENT_OK
      );
    }
  }

  const items = [benchmarkItem, gapItem, attrItem, derivationItem, routeItem, argumentItem];

  // Hard stop: gap below floor — except pending first-mover check
  const belowFloor =
    gapItem.code === F1_ITEM_CODES.F1_GAP_BELOW_FLOOR &&
    !firstMoverPending &&
    gapItem.status === "pending";

  let checkLabel = "Cleared";
  if (belowFloor) checkLabel = "Below floor";
  else if (items.every((i) => i.status === "done")) checkLabel = "Cleared";
  else checkLabel = "Evidence missing";

  return { checkLabel, items };
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
