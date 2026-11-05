/**
 * Part 132/133 — locked catalogue: check item code → instruction + why.
 * Instructions start with a verb, 15–220 chars, never restate a typed input as the defect.
 */
import { DECLARED_GAP_FLOOR } from "./lockedConstants.js";

function clip(s, max = 220) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function brand(ctx = {}) {
  const n = String(ctx.benchmark || ctx.value || "").trim();
  return n ? `"${n}"` : "the named benchmark";
}

/** @type {Readonly<Record<string, { instruction: (ctx?: object) => string, why: string }>>} */
export const ITEM_COPY = Object.freeze({
  F1_ATTRIBUTE_MISSING: {
    instruction: () => "Enter the purchase-driver attribute you intend to beat the benchmark on",
    why: "Attributes mean the parameters where the idea claims to beat the named competitor.",
  },
  F1_ATTRIBUTE_NOT_CORE: {
    instruction: (ctx) =>
      clip(ctx.message || "Replace the attribute with a purchase driver research confirms across trade channels"),
    why: "Attributes that are not category purchase drivers need primary research before they clear.",
  },
  F1_EVIDENCE_MISSING: {
    instruction: () => "Upload a study or paste an Evidence Source link that backs the attribute claim",
    why: "Attribute credit needs team evidence that was read and found relevant.",
  },
  F1_EVIDENCE_OK: {
    instruction: () => "Keep the Evidence Source on file — attribute credit is already earned",
    why: "Quote-verified relevant evidence clears the attribute check.",
  },
  F1_EVIDENCE_UNREADABLE: {
    instruction: () => "Upload the evidence file instead of an external SharePoint link that cannot be read",
    why: "Unreadable sources earn no attribute credit under read-and-relevant mode.",
  },
  F1_EVIDENCE_NOT_RELEVANT: {
    instruction: () => "Replace the Evidence Source with a study that discusses this category, benchmark or attributes",
    why: "Evidence must be relevant to the idea — not an unrelated document.",
  },
  F1_EVIDENCE_NOT_READ: {
    instruction: () => "Submit so the Evidence Source can be read and checked for relevance",
    why: "Attribute credit waits until the evidence reader finishes.",
  },
  F1_BENCHMARK_RELEVANT: {
    instruction: () => "Keep the named benchmark — web search found it relevant in India",
    why: "A relevant India shelf competitor clears the benchmark check.",
  },
  F1_BENCHMARK_STRONG: {
    instruction: () => "Keep the named benchmark — it scored strong on relevance",
    why: "A leading India-shelf competitor in the same category and segment earns full credit.",
  },
  F1_BENCHMARK_NOT_ENTERED: {
    instruction: () => "Name a competitor benchmark brand that sells in India",
    why: "Filter 1 needs a real shelf competitor to judge differentiation against.",
  },
  F1_BENCHMARK_TOO_SHORT: {
    instruction: () => "Describe this properly: one word or letter cannot be assessed",
    why: "Entries under three characters earn no relevance credit.",
  },
  F1_BENCHMARK_NOT_ASSESSED: {
    instruction: () => "Submit so web search can assess whether the benchmark is relevant in India",
    why: "An unassessed benchmark earns nothing until research stores a graded result.",
  },
  F1_BENCHMARK_NOT_CITED: {
    instruction: () => "Name a competitor that shows up in a web search",
    why: "Benchmark relevance counts only when the AI cites a source the search actually returned.",
  },
  F1_BENCHMARK_WEAK_MATCH: {
    instruction: (ctx) =>
      clip(`Replace ${brand(ctx)} with a closer competitor in the same category — this one is only adjacent`),
    why: "A real product in an adjacent category earns only weak credit.",
  },
  F1_BENCHMARK_ADEQUATE_MATCH: {
    instruction: (ctx) =>
      clip(`Prefer a leading competitor in the same segment as ${brand(ctx)} to raise this check to strong`),
    why: "A real category product that is not among the leaders earns adequate credit.",
  },
  F1_BENCHMARK_NOT_NAMED: {
    instruction: () => "Name a competitor benchmark brand that sells in India",
    why: "Filter 1 needs a real shelf competitor to judge differentiation against.",
  },
  F1_BENCHMARK_NOT_CHECKED: {
    instruction: (ctx) =>
      clip(`Run Filter 1 research to check that ${brand(ctx)} is a real, relevant product on sale in India.`),
    why: "A typed name is not enough — web research must verify relevance in India.",
  },
  F1_BENCHMARK_NOT_FOUND: {
    instruction: (ctx) =>
      clip(`Replace ${brand(ctx)} with a competitor that web search can find on sale in India now`),
    why: "Benchmarks that cannot be found on the Indian shelf stay open.",
  },
  F1_BENCHMARK_NOT_RELEVANT: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Replace ${brand(ctx)} with a closer competitor in the same category and segment as this idea`
      ),
    why: "A product in the wrong category or segment does not clear the benchmark check.",
  },
  F1_BENCHMARK_COMPETITORS_FOUND: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Name one of the competitors found${ctx.value ? ` (for example ${ctx.value})` : ""} instead of claiming first-mover`
      ),
    why: "A disproved first-mover claim requires a real named benchmark.",
  },
  F1_BENCHMARK_FIRST_MOVER_NOT_CHECKED: {
    instruction: () => "Submit so web search can check whether fewer than two established competitors exist",
    why: "First-mover gap of 0 waits for the no-competitor web check before it can clear.",
  },
  F1_BENCHMARK_NOT_VERIFIED: {
    instruction: (ctx) =>
      clip(`Replace ${brand(ctx)} with a competitor research can verify sells in India, or upload Evidence Source proof.`),
    why: "Unverified benchmarks cannot clear the Filter 1 competitive check.",
  },
  F1_BENCHMARK_RESEARCH_FAILED: {
    instruction: () => "Submit again so Filter 1 web search can finish checking the named benchmark",
    why: "Research failed before verification completed — retry without changing the idea.",
  },
  F1_RESEARCH_FAILED: {
    instruction: () => "Submit again so Filter 1 research can finish",
    why: "Failed Filter 1 research leaves open checks under the fixed slot table.",
  },
  F1_GAP_MISSING: {
    instruction: () => `Enter a declared gap of ${DECLARED_GAP_FLOOR.toFixed(1)} or more, or claim first-mover with gap 0 and no benchmark`,
    why: "A blank gap is a missing input — not a first-mover claim.",
  },
  F1_GAP_BELOW_FLOOR: {
    instruction: (ctx) =>
      clip(
        `Raise declared gap to ${DECLARED_GAP_FLOOR.toFixed(1)} or more (now ${ctx.value ?? "below floor"}); gap is measured on the 10-point scale`
      ),
    why: "Gaps below the locked floor force a NO-GO regardless of the percent.",
  },
  F1_GAP_STRONG: {
    instruction: () => "Keep the declared gap at or above the floor",
    why: "Gaps at or above 2.0 earn strong numeric credit.",
  },
  F1_GAP_OK: {
    instruction: () => "Keep the declared gap at or above the floor",
    why: "Gaps at or above 2.0 clear without mark-down.",
  },
  F1_ATTRIBUTES_STRONG: {
    instruction: () => "Keep the attribute claim — it scored strong with verified evidence",
    why: "A specific differentiating claim backed by quote-verified evidence earns full credit.",
  },
  F1_ATTRIBUTES_NOT_ENTERED: {
    instruction: () => "Enter the purchase-driver attribute you intend to beat the benchmark on",
    why: "Attributes mean the parameters where the idea claims to beat the named competitor.",
  },
  F1_ATTRIBUTES_TOO_SHORT: {
    instruction: () => "Describe this properly: one word or letter cannot be assessed",
    why: "Entries under three characters earn no relevance credit.",
  },
  F1_ATTRIBUTES_NO_EVIDENCE: {
    instruction: () => "Upload a study or paste a link in Evidence Source",
    why: "Attribute credit is the lower of the claim grade and verified evidence — no evidence means none.",
  },
  F1_ATTRIBUTES_NOT_ASSESSED: {
    instruction: () => "Submit so the attribute claim can be assessed for specificity",
    why: "An unassessed attribute earns nothing until the plan check stores a grade.",
  },
  F1_ATTRIBUTES_NEEDS_CONFIRMATION: {
    instruction: () => "This was written by the AI: edit or confirm it",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_ATTRIBUTES_NOT_SPECIFIC: {
    instruction: () => "Replace the general claim with a number, a named ingredient or a named competitor",
    why: "Generic attribute text is capped at weak relevance credit.",
  },
  F1_DERIVATION_MISSING: {
    instruction: () => "Write gap derivation — what the idea intends to beat the benchmark on",
    why: "Gap derivation is fact-checked and scored as its own Filter 1 check.",
  },
  F1_DERIVATION_STRONG: {
    instruction: () => "Keep gap derivation and parity — they scored strong on the claim check",
    why: "Specific, supported, uncontradicted derivation and parity earn full credit.",
  },
  F1_DERIVATION_NOT_ENTERED: {
    instruction: () => "Write gap derivation — what the idea intends to beat the benchmark on",
    why: "Gap derivation is fact-checked and scored as its own Filter 1 check.",
  },
  F1_DERIVATION_TOO_SHORT: {
    instruction: () => "Describe this properly: one word or letter cannot be assessed",
    why: "Entries under three characters earn no relevance credit.",
  },
  F1_DERIVATION_NEEDS_CONFIRMATION: {
    instruction: () => "This was written by the AI: edit or confirm it",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_DERIVATION_NOT_ASSESSED: {
    instruction: () => "Submit so web search can fact-check gap derivation and parity",
    why: "An unassessed derivation earns nothing until the claim check stores a grade.",
  },
  F1_DERIVATION_CONTRADICTED: {
    instruction: (ctx) =>
      clip(ctx.message || "Revise the contradicted claim, or dispute it by attaching Evidence Source proof"),
    why: "A claim is marked down only when contradicted by a returned source with a quote.",
  },
  F1_DERIVATION_NOT_SPECIFIC: {
    instruction: () => "Replace the general claim with a number, a named ingredient or a named competitor",
    why: "Generic derivation text is capped at weak relevance credit.",
  },
  F1_PARITY_MISSING: {
    instruction: () => 'Enter parity exceptions — attributes you may lose on — or type "none"',
    why: "Parity must be stated so research can check whether the claim is accurate.",
  },
  F1_NEEDS_CONFIRMATION: {
    instruction: () => "Edit or confirm the AI-written text before it can earn a Filter 1 mark",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_CLAIM_NOT_CHECKED: {
    instruction: () => "Submit so web search can fact-check gap derivation, parity and the growth argument",
    why: "Claim checks run after a person confirms the text.",
  },
  F1_CLAIM_CONTRADICTED: {
    instruction: (ctx) =>
      clip(ctx.message || "Revise the contradicted claim, or dispute it by attaching Evidence Source proof"),
    why: "A claim is marked down only when contradicted by a returned source with a quote.",
  },
  F1_DERIVATION_OK: {
    instruction: () => "Keep gap derivation and parity as confirmed — they cleared fact-check",
    why: "Confirmed, uncontradicted derivation and parity clear this check.",
  },
  F1_ROUTE_MISSING: {
    instruction: () => "Select a growth route: penetration, frequency, or new market",
    why: "Filter 1 needs an explicit growth route the AI can check against the audience.",
  },
  F1_ROUTE_STRONG: {
    instruction: () => "Keep the selected growth route — it matches who this is for",
    why: "A route that matches the owner's definitions for the target consumer earns full credit.",
  },
  F1_ROUTE_NOT_ENTERED: {
    instruction: () => "Select a growth route: penetration, frequency, or new market",
    why: "Filter 1 needs an explicit growth route the AI can check against the audience.",
  },
  F1_ROUTE_NEEDS_CONFIRMATION: {
    instruction: () => "This was written by the AI: edit or confirm it",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_ROUTE_NOT_ASSESSED: {
    instruction: () => "Submit so the growth route can be checked against who the idea is for",
    why: "An unassessed route earns nothing until the plan check stores a match grade.",
  },
  F1_ROUTE_UNCLEAR: {
    instruction: () => "Clarify who this is for in Target consumer so the route check can be decisive",
    why: "An unclear route match earns only adequate credit.",
  },
  F1_ROUTE_NOT_CHECKED: {
    instruction: () => "Submit so the growth route can be checked against who the idea is for",
    why: "Route mismatch mark-downs need the AI route check at high confidence.",
  },
  F1_ROUTE_MISMATCH: {
    instruction: (ctx) =>
      clip(
        ctx.expected
          ? `Change the growth route to "${ctx.expected}" — that matches who this is for`
          : "Change the growth route to the one the AI expects for this audience"
      ),
    why: "A high-confidence route mismatch marks the route check down.",
  },
  F1_ROUTE_OK: {
    instruction: () => "Keep the selected growth route — it matches the audience intent",
    why: "Confirmed routes that are not high-confidence mismatches clear.",
  },
  F1_ARGUMENT_MISSING: {
    instruction: () => "Write a growth argument with facts and data that can be checked",
    why: "The growth argument is fact-checked as its own Filter 1 check.",
  },
  F1_ARGUMENT_STRONG: {
    instruction: () => "Keep the growth argument — it scored strong on the claim check",
    why: "Specific, supported, uncontradicted growth arguments earn full credit.",
  },
  F1_ARGUMENT_NOT_ENTERED: {
    instruction: () => "Write a growth argument with facts and data that can be checked",
    why: "The growth argument is fact-checked as its own Filter 1 check.",
  },
  F1_ARGUMENT_TOO_SHORT: {
    instruction: () => "Describe this properly: one word or letter cannot be assessed",
    why: "Entries under three characters earn no relevance credit.",
  },
  F1_ARGUMENT_NEEDS_CONFIRMATION: {
    instruction: () => "This was written by the AI: edit or confirm it",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_ARGUMENT_NOT_ASSESSED: {
    instruction: () => "Submit so web search can fact-check the growth argument",
    why: "An unassessed argument earns nothing until the claim check stores a grade.",
  },
  F1_ARGUMENT_NOT_CHECKED: {
    instruction: () => "Submit so web search can fact-check the growth argument",
    why: "Unverified arguments wait for the claim-check step.",
  },
  F1_ARGUMENT_CONTRADICTED: {
    instruction: (ctx) =>
      clip(ctx.message || "Correct the contradicted data in the growth argument, or attach Evidence Source proof"),
    why: "Incorrect public data in the argument marks this check down.",
  },
  F1_ARGUMENT_OK: {
    instruction: () => "Keep the growth argument — no contradicted public facts were found",
    why: "Confirmed arguments without contradicted claims clear.",
  },
  F1_ARGUMENT_NOT_SPECIFIC: {
    instruction: () => "Replace the general claim with a number, a named ingredient or a named competitor",
    why: "Generic growth-argument text is capped at weak relevance credit.",
  },
  F1_NOT_APPLICABLE: {
    instruction: () => "No action — this check does not apply to a verified first-mover or pure commodity",
    why: "Verified first-movers and pure commodities clear some Filter 1 slots as not applicable.",
  },
  F1_GROWTH_ROUTE_MISSING: {
    instruction: () => "Select a growth route: penetration, frequency, or new market",
    why: "Filter 1 needs an explicit growth route.",
  },
  F1_GROWTH_ARGUMENT_MISSING: {
    instruction: () => "Write a growth argument with numbers that can be fact-checked",
    why: "A route without an argument cannot clear the argument slot.",
  },
  F1_CATEGORY_SIZE_UNSOURCED: {
    instruction: () => "Category size no longer scores Filter 1 — focus on route and argument checks",
    why: "Part 133 retired category-size credit from Filter 1 growth.",
  },
  F1_CATEGORY_SIZE_RESEARCH_FAILED: {
    instruction: () => "Category size no longer scores Filter 1 — retry only if Filter 5 needs size context",
    why: "Part 133 retired category-size credit from Filter 1 growth.",
  },
  F2_MRP_MISSING: {
    instruction: () => "Enter MRP (₹) and pack grammage with a unit",
    why: "Filter 2 price evidence starts from a typed MRP and pack size.",
  },
  F2_MARGIN_MISSING: {
    instruction: () => "Enter the net margin at scale (%) so Filter 2 can check the division minimum",
    why: "Blank margin is a missing input — Evidence missing, not Marked down.",
  },
  F2_MARGIN_CLEARS: {
    instruction: () => "Keep the net margin at or above the locked division minimum",
    why: "A margin at or above the minimum earns the only Filter 2 check (one of 15 ≈ 6.7 points).",
  },
  F2_MARGIN_BELOW_MINIMUM: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Raise the net margin to at least ${ctx.floor != null ? `${ctx.floor}%` : "the division minimum"}${
            ctx.divisionLabel ? ` for ${ctx.divisionLabel}` : ""
          }, or lower COGS`
      ),
    why: "A margin below the division minimum is a mark-down (6.7 points; GO capped at WATCH), never NO-GO.",
  },
  F2_MARGIN_BELOW_FLOOR: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Raise the net margin to at least ${ctx.floor != null ? `${ctx.floor}%` : "the division minimum"}${
            ctx.divisionLabel ? ` for ${ctx.divisionLabel}` : ""
          }, or lower COGS`
      ),
    why: "Legacy code alias — same as F2_MARGIN_BELOW_MINIMUM.",
  },
  F2_MARGIN_DIVISION_PENDING: {
    instruction: () => "Ask ADMIN to assign a locked division so Filter 2 can apply the margin minimum",
    why: "Without a division, the net-margin minimum cannot be screened.",
  },
  F2_DIVISION_PENDING: {
    instruction: () => "Ask ADMIN to assign a locked division so Filter 2 can apply the margin minimum",
    why: "Without a division, the net-margin minimum cannot be screened.",
  },
  F2_QCOM_MISSING: {
    instruction: () => "Optional: record quick-commerce notes — they are not scored in Filter 2",
    why: "Quick-commerce text is kept as notes until the owner gives it a criterion.",
  },
  F3_NOT_RUN: {
    instruction: () => "Compute Filter 3 safe MRP range (Submit so elasticity research can run)",
    why: "Filter 3 checks Filter 2 MRP against the researched safe ₹ band.",
  },
  F3_MRP_OUTSIDE_RANGE: {
    instruction: (ctx) => clip(ctx.message || "Move Filter 2 MRP inside the safe ₹ range (± ₹0.5)"),
    why: "MRP outside the safe band is a Filter 3 floor failure.",
  },
  F3_MRP_MISSING: {
    instruction: () => "Enter COGS, net margin and GST so Filter 2 MRP can be derived for the safe-range check",
    why: "Filter 3 cannot clear without a live MRP to test.",
  },
  F4_NOT_RUN: {
    instruction: () => "Run Filter 4 research (all 7 tech-shift dimensions)",
    why: "Unrun Filter 4 keeps the idea INCOMPLETE and blocks GO.",
  },
  F4_DIMENSION_RISK: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Clear the open Filter 4 dimension${ctx.dimension ? ` "${ctx.dimension}"` : ""} with a mitigation response`
      ),
    why: "Each tech/habit-shift dimension is one of the seven Filter 4 slots.",
  },
  F4_RESEARCH_FAILED: {
    instruction: () => "Submit again so Filter 4 structural-obsolescence research can finish",
    why: "Failed Filter 4 research leaves seven slots open.",
  },
  RESEARCH_FAILED: {
    instruction: () => "Submit again so research can finish — no score seals on a failed run",
    why: "Failed research keeps Filter 1–4 unfinished (INCOMPLETE).",
  },
  FILTER_NOT_RUN: {
    instruction: (ctx) =>
      clip(`Complete ${ctx.filterLabel || "this filter"} inputs and Submit so research can score it`),
    why: "Unrun filters keep the idea INCOMPLETE under the fixed slot table.",
  },
  INPUT_INVALID: {
    instruction: (ctx) =>
      clip(ctx.message || `Replace "${ctx.value || "this input"}" with a real value before Submit`),
    why: "Invalid inputs block Submit so nonsense never spends research or seals a verdict.",
  },
});

export function instructionForCode(code, ctx = {}) {
  const entry = ITEM_COPY[code];
  if (!entry) return "";
  const text = entry.instruction(ctx || {});
  return clip(text, 220);
}

export function whyForCode(code) {
  return String(ITEM_COPY[code]?.why || "").trim();
}

export function assertItemCopyComplete(codes = []) {
  const missing = [];
  const bad = [];
  for (const code of codes) {
    const entry = ITEM_COPY[code];
    if (!entry) {
      missing.push(code);
      continue;
    }
    const text = entry.instruction({});
    if (!/^[A-Z]/.test(text) && !/^[A-Za-z]/.test(text)) bad.push(`${code}: must start with a verb/letter`);
    if (text.length < 15 || text.length > 220) bad.push(`${code}: length ${text.length}`);
    if (!entry.why || entry.why.length < 10) bad.push(`${code}: why too short`);
  }
  return { missing, bad };
}
