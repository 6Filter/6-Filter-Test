/**
 * Part 132 — locked catalogue: check item code → instruction + why.
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
    instruction: () => "Enter the purchase-driver attribute the category sells on across channels",
    why: "Filter 1 scores only a declared consumer purchase driver, not a blank attribute.",
  },
  F1_ATTRIBUTE_NOT_CORE: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          "Replace the attribute with a purchase driver research confirms across trade channels"
      ),
    why: "Attributes that are not category purchase drivers need primary research before they clear.",
  },
  F1_BENCHMARK_NOT_NAMED: {
    instruction: () => "Name a competitor benchmark brand that sells in India",
    why: "Filter 1 needs a real shelf competitor to judge differentiation against.",
  },
  F1_BENCHMARK_NOT_CHECKED: {
    instruction: (ctx) =>
      clip(`Run Filter 1 research to check that ${brand(ctx)} is a real product on sale in India.`),
    why: "A typed name is not enough — web research must verify the benchmark sells in India.",
  },
  F1_BENCHMARK_NOT_VERIFIED: {
    instruction: (ctx) =>
      clip(
        `Replace ${brand(ctx)} with a competitor that research can verify sells in India, or upload Evidence Source proof.`
      ),
    why: "Unverified benchmarks cannot clear the Filter 1 competitive check.",
  },
  F1_BENCHMARK_RESEARCH_FAILED: {
    instruction: () => "Submit again so Filter 1 web search can finish verifying the named benchmark",
    why: "Research failed before verification completed — retry without changing the idea.",
  },
  F1_GAP_MISSING: {
    instruction: () => `Enter a declared gap of ${DECLARED_GAP_FLOOR.toFixed(1)} or more, or clear a first-mover claim`,
    why: "The declared gap floor is a non-negotiable Filter 1 gate.",
  },
  F1_GAP_BELOW_FLOOR: {
    instruction: (ctx) =>
      clip(
        `Raise declared gap to ${DECLARED_GAP_FLOOR.toFixed(1)} or more (now ${ctx.value ?? "below floor"}), or prove a genuine first-mover`
      ),
    why: "Gaps below the locked floor force a NO-GO regardless of the percent.",
  },
  F1_GROWTH_ROUTE_MISSING: {
    instruction: () => "Select a growth route: penetration, frequency, or new market",
    why: "Filter 1 needs an explicit growth route before category size can back it.",
  },
  F1_GROWTH_ARGUMENT_MISSING: {
    instruction: () => "Write a growth argument with numbers traceable to a CMI source",
    why: "A route without a numbered argument cannot clear the growth slot.",
  },
  F1_CATEGORY_SIZE_UNSOURCED: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          "Submit so web research can substantiate category size for the growth route, or upload a study"
      ),
    why: "Growth clears only when researched category size (or team Evidence) backs the route.",
  },
  F1_CATEGORY_SIZE_RESEARCH_FAILED: {
    instruction: () => "Submit again so category-size web research can finish for the growth route",
    why: "Size research failed — retry Submit before treating growth as cleared.",
  },
  F2_MRP_MISSING: {
    instruction: () => "Enter MRP (₹) and pack grammage with a unit",
    why: "Filter 2 price evidence starts from a typed MRP and pack size.",
  },
  F2_MARGIN_MISSING: {
    instruction: () => "Enter net margin at scale (%)",
    why: "Net margin is checked against the locked division floor.",
  },
  F2_MARGIN_BELOW_FLOOR: {
    instruction: (ctx) =>
      clip(
        ctx.message ||
          `Raise net margin at scale above the locked division floor${ctx.floor != null ? ` (${ctx.floor}%)` : ""}`
      ),
    why: "A margin below the division floor is a non-negotiable NO-GO.",
  },
  F2_QCOM_MISSING: {
    instruction: () => "Record quick-commerce terms / take-rate assumption",
    why: "Q-com terms are a fixed Filter 2 analytical slot.",
  },
  F2_DIVISION_PENDING: {
    instruction: () => "Ask ADMIN to assign a locked division so Filter 2 can apply the margin floor",
    why: "Without a division, the net-margin floor cannot be screened.",
  },
  F3_NOT_RUN: {
    instruction: () => "Compute Filter 3 safe MRP range (Submit so elasticity research can run)",
    why: "Filter 3 checks Filter 2 MRP against the researched safe ₹ band.",
  },
  F3_MRP_OUTSIDE_RANGE: {
    instruction: (ctx) =>
      clip(ctx.message || "Move Filter 2 MRP inside the safe ₹ range (± ₹0.5)"),
    why: "MRP outside the safe band is a Filter 3 floor failure.",
  },
  F3_MRP_MISSING: {
    instruction: () => "Enter Filter 2 MRP so it can be checked against the safe range",
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
    why: "Unrun filters keep the idea INCOMPLETE under the fixed 15-slot table.",
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
