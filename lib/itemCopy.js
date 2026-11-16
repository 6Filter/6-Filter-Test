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
    instruction: () => "Evaluate to assess this",
    why: "An unassessed benchmark earns nothing until research stores a graded result.",
  },
  F1_BENCHMARK_ASSESSMENT_FAILED: {
    instruction: (ctx) =>
      `This check did not complete: ${ctx?.reason || "The AI did not answer"}. Evaluate to try again`,
    why: "A failed assessment is never a relevance verdict — Evaluate asks again.",
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
    instruction: () => "Evaluate to assess this",
    why: "First-mover gap of 0 waits for the no-competitor web check before it can clear.",
  },
  F1_BENCHMARK_NOT_VERIFIED: {
    instruction: (ctx) =>
      clip(`Replace ${brand(ctx)} with a competitor research can verify sells in India, or upload Evidence Source proof.`),
    why: "Unverified benchmarks cannot clear the Filter 1 competitive check.",
  },
  F1_BENCHMARK_RESEARCH_FAILED: {
    instruction: (ctx) =>
      `This check did not complete: ${ctx?.reason || "Research failed"}. Evaluate to try again`,
    why: "Research failed before verification completed — retry without changing the idea.",
  },
  F1_RESEARCH_FAILED: {
    instruction: (ctx) =>
      `This check did not complete: ${ctx?.reason || "Research failed"}. Evaluate to try again`,
    why: "Failed Filter 1 research leaves open checks under the fixed slot table.",
  },
  F1_GAP_MISSING: {
    instruction: () => `Enter a declared gap of ${DECLARED_GAP_FLOOR.toFixed(1)} or more, or claim first-mover with gap 0 and no benchmark`,
    why: "A blank gap is a missing input — not a first-mover claim.",
  },
  F1_GAP_BELOW_FLOOR: {
    instruction: (ctx) =>
      clip(
        `Raise declared gap to ${DECLARED_GAP_FLOOR.toFixed(1)} or more (now ${ctx.value ?? "below floor"}) to clear the mark-down; gap is measured on the 10-point scale`
      ),
    why: "A gap below the locked floor is marked down (this check earns nothing and GO is capped at WATCH) — it is not a hard stop.",
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
    instruction: () => "Evaluate to assess this",
    why: "An unassessed attribute earns nothing until the plan check stores a grade.",
  },
  F1_ATTRIBUTES_NEEDS_CONFIRMATION: {
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
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
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_DERIVATION_NOT_ASSESSED: {
    instruction: () => "Evaluate to assess this",
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
  F1_PARITY_STRONG: {
    instruction: () => "Keep the parity exceptions — they scored strong on the claim check",
    why: "Specific, supported, uncontradicted parity exceptions earn full credit.",
  },
  F1_PARITY_NOT_ENTERED: {
    instruction: () => 'Enter parity exceptions — attributes you may lose on — or type "none"',
    why: "Parity is its own Filter 1 check and needs its own entered text.",
  },
  F1_PARITY_TOO_SHORT: {
    instruction: () => "Describe this properly: one word or letter cannot be assessed",
    why: "Entries under three characters earn no relevance credit.",
  },
  F1_PARITY_NEEDS_CONFIRMATION: {
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_PARITY_NOT_ASSESSED: {
    instruction: () => "Evaluate to assess this",
    why: "An unassessed parity entry earns nothing until the claim check stores a grade.",
  },
  F1_PARITY_CONTRADICTED: {
    instruction: (ctx) =>
      clip(ctx.message || "Revise the contradicted parity claim, or dispute it by attaching Evidence Source proof"),
    why: "A parity claim is marked down only when contradicted by a returned source with a quote.",
  },
  F1_PARITY_NOT_SPECIFIC: {
    instruction: () => "Replace the general claim with a number, a named ingredient or a named competitor",
    why: "Generic parity text is capped at weak relevance credit.",
  },
  F1_NEEDS_CONFIRMATION: {
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_CLAIM_NOT_CHECKED: {
    instruction: () => "Evaluate to assess this",
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
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_ROUTE_NOT_ASSESSED: {
    instruction: () => "Evaluate to assess this",
    why: "An unassessed route earns nothing until the plan check stores a match grade.",
  },
  F1_ROUTE_UNCLEAR: {
    instruction: () => "Clarify who this is for in Target consumer so the route check can be decisive",
    why: "An unclear route match earns only adequate credit.",
  },
  F1_ROUTE_NOT_CHECKED: {
    instruction: () => "Evaluate to assess this",
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
    instruction: () => "Confirm or edit the text the AI wrote so it can be assessed",
    why: "AI suggestions earn nothing until a person edits or confirms them.",
  },
  F1_ARGUMENT_NOT_ASSESSED: {
    instruction: () => "Evaluate to assess this",
    why: "An unassessed argument earns nothing until the claim check stores a grade.",
  },
  F1_ARGUMENT_NOT_CHECKED: {
    instruction: () => "Evaluate to assess this",
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
    why: "A margin at or above the minimum earns full credit on the margin check (one of the 18 fixed checks).",
  },
  F2_MARGIN_BELOW_MINIMUM: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Raise the net margin to at least ${ctx.floor != null ? `${ctx.floor}%` : "the division minimum"}${
            ctx.divisionLabel ? ` for ${ctx.divisionLabel}` : ""
          }, or lower COGS`
      ),
    why: "A margin below the division minimum is a mark-down (the check earns nothing; GO capped at WATCH), never NO-GO.",
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
  F2_PACK_SIZE_CLEARS: {
    instruction: () => "Keep the pack size with its unit — it is entered correctly",
    why: "A grammage with a number and a unit earns full credit on the pack-size check.",
  },
  F2_PACK_SIZE_MISSING: {
    instruction: () => "Enter the pack size with a unit, e.g. 100 g or 100 ml",
    why: "Pack size is a Filter 2 check; blank means it is not yet entered.",
  },
  F2_PACK_SIZE_NEEDS_UNIT: {
    instruction: () => "Add a unit (g, kg, ml or L) to the pack size, e.g. 100 g",
    why: "A bare number cannot tell grams from millilitres, so the pack size is marked down.",
  },
  F2_GST_CLEARS: {
    instruction: () => "Keep the GST rate — it is entered and not contradicted",
    why: "An entered numeric GST rate that the web check does not contradict earns full credit.",
  },
  F2_GST_MISSING: {
    instruction: () => "Enter the GST rate (%) so the MRP can be priced",
    why: "Without a GST rate the MRP cannot be priced, so this check stays open.",
  },
  F2_GST_CONTRADICTED: {
    instruction: (ctx) =>
      clip(ctx.message || "Correct the GST rate to the slab that applies to this category, or attach proof"),
    why: "A GST rate contradicted by the web check is marked down and caps GO at WATCH.",
  },
  F2_QCOM_MISSING: {
    instruction: () => "Optional: record quick-commerce notes — they are not scored in Filter 2",
    why: "Quick-commerce text is kept as notes until the owner gives it a criterion.",
  },
  F3_NOT_RUN: {
    instruction: () => "Enter Filter 2 COGS, margin and GST so there is an MRP to test, then Submit",
    why: "Filter 3 screens the Filter 2 MRP against fixed price-point cliffs.",
  },
  F3_MRP_OUTSIDE_RANGE: {
    instruction: (ctx) => clip(ctx.message || "Stay under the next fixed price point, or strengthen the pack so volume loss stays at or under 10%"),
    why: "Legacy band code — Part 135 uses the cliff rule instead.",
  },
  F3_MRP_MISSING: {
    instruction: () => "Enter COGS, net margin and GST so Filter 2 MRP can be derived for the cliff test",
    why: "Filter 3 cannot clear without a live MRP to test.",
  },
  F3_RESILIENCE_PASS: {
    instruction: () => "Keep the Filter 2 MRP — no fixed price point is crossed, or verified loss stays at or under 10%",
    why: "Strong evidence clears the only Filter 3 check (one of the 18 fixed checks).",
  },
  F3_RESILIENCE_PASS_ADEQUATE: {
    instruction: () => "Add more comparable price events to strengthen this",
    why: "Two same-point events (or three+ analogous) earn adequate credit — enough to clear without capping GO.",
  },
  F3_RESILIENCE_PASS_WEAK: {
    instruction: () => "Add more comparable price events to strengthen this",
    why: "One verified event earns only weak credit and caps GO at WATCH.",
  },
  F3_RESILIENCE_FAIL: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Stay under ₹${ctx.point != null ? ctx.point : "the next fixed point"} for longer: lower the cost, or change the pack size so the price does not cross it`
      ),
    why: "Verified volume loss above 10% at a crossed fixed price point is a mark-down (the check earns nothing), never NO-GO.",
  },
  F3_RESILIENCE_CANNOT_ASSESS: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          "Add evidence of what happened when comparable packs crossed the next fixed price point: upload a retail audit or paste a link in Evidence Source"
      ),
    why: "A crossing with no verified volume evidence earns nothing and caps GO at WATCH.",
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
  F4_NOT_VERIFIED: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Run the web check on this Filter 4 rating${ctx.dimension ? ` ("${ctx.dimension}")` : ""} — a rating nobody web-checked earns nothing`
      ),
    why: "A Filter 4 dimension earns its point only when a stored web check supports the rating that is on the form now.",
  },
  F4_CONTRADICTED: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Revise the Filter 4 rating${ctx.dimension ? ` for "${ctx.dimension}"` : ""} to match the web evidence, or add a specific mitigation`
      ),
    why: "A Filter 4 rating contradicted by the web check is marked down: the dimension earns nothing and GO is capped at WATCH.",
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
  // Part 141 D73 — invalid free text never earns AI credit; the review message is the instruction.
  ...Object.fromEntries(
    ["BENCHMARK", "ATTRIBUTES", "DERIVATION", "PARITY", "ARGUMENT"].map((slot) => [
      `F1_${slot}_INPUT_INVALID`,
      {
        instruction: (ctx) =>
          clip(
            ctx?.reason
              ? `Fix this input before it can score: ${ctx.reason}`
              : "Replace this with a real, specific entry before it can score"
          ),
        why: "Gibberish, placeholder or digit-only text is never sent to the AI and earns no credit.",
      },
    ])
  ),
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
