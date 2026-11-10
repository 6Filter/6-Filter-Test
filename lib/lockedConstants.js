/**
 * LOCKED thresholds — the only file that may contain these numbers as literals.
 * Every comparison in lib/ and src/ must import from here.
 * Filter 6 stays validation-only: these floors are gates, never a score.
 */
export const IDEA_WEIGHT_BANDS = {
  TIER_10G_MAX: 1,
  TIER_100G_MAX: 12,
};

export const GONOGO_SCORE_BANDS = {
  NOGO_MAX: 60,
  WATCH_MAX: 80,
};

export const DECLARED_GAP_FLOOR = 2.0;
export const POINTS_BEAT_FLOOR = 2.0;
export const VOLUME_LOSS_CEILING_PCT = 10;

/**
 * Part 135 D33 — fixed Indian pack price points (cliffs, not slopes).
 * Owner may extend; a change bumps the scoring ruleset.
 */
export const FIXED_PRICE_POINTS = Object.freeze([1, 2, 5, 10, 20, 50, 100]);

/** Part 135 D32 — years over which inflation-covering rises are tested. */
export const F3_HORIZON_YEARS = 5;

/**
 * Part 135 D34 — volume loss at a crossing: median of verified events (default),
 * or `"worst"` for the largest loss. Both figures are shown in the UI.
 */
export const F3_LOSS_STATISTIC = "median";

export const F6_LAB_GAP_FLOOR = 2.0;
export const F6_PACK_STANDOUT_FLOOR = 2.0;
export const F6_CONSUMER_PANEL_MIN = 18;
export const F6_PANEL_TOTAL = 30;

export const LIST_PROPOSITIONS_CAP = 2000;

/**
 * Owner's locked division minimum net margins (exact names, em dash on Dairy Craft — Non-UHT).
 * International Business is null — use the product's respective division (see INTERNATIONAL_BUSINESS_MARGIN).
 */
export const DIVISION_MIN_NET_MARGIN_PCT = Object.freeze({
  "Professional Care": 60,
  "Personal Care": 50,
  Foods: 35,
  Snacks: 30,
  Bakery: 30,
  "Ambient Dairy": 25,
  Beverages: 25,
  "Dairy Craft — Non-UHT": 25,
  "Cold Chain Business": 12,
  "Dairy Craft — UHT Milk": 12,
  "International Business": null,
});

export const LOCKED_DIVISION_NAMES = Object.freeze(Object.keys(DIVISION_MIN_NET_MARGIN_PCT));

/** Decision A — locked minimum is a floor hint; AI may autofill ideal margin, user may override. */
export const NET_MARGIN_ASSIGNMENT = "proposer-input";

/** Decision B — International Business uses the product's respective division floor. */
export const INTERNATIONAL_BUSINESS_MARGIN = "respective-division";

/** Decision C — undetected division leaves Filter 2 unfinished (INCOMPLETE when mode is incomplete). */
export const UNMATCHED_DIVISION_F2 = "pending";

/**
 * Part 128 D1 — fixed check slots so unfinished filters cannot shrink the denominator.
 * `"as-built"` keeps the pre-v4.1 item-count behaviour (tests / rollback only).
 */
export const SCORE_DENOMINATOR_MODE = "fixed-slots";

/**
 * Canonical Filter 1–4 analytical slots (Finance sign-off is outside these).
 * Part 138: 18 checks — F1=7 (parity split from derivation), F2=3 (margin, pack size, GST), F3=1, F4=7.
 */
export const SCORE_CHECK_SLOTS = Object.freeze({ f1: 7, f2: 3, f3: 1, f4: 7 });

/** Part 128 D2 — rupee tolerance when Filter 2 MRP is checked against the F3 safe range. */
export const F3_MRP_RANGE_TOLERANCE_INR = 0.5;

/**
 * Part 129/133/134 — bump only with owner approval together with golden + fingerprint updates.
 * Stored snapshots without a version are stamped `"legacy"` on read (never rewritten).
 * v4.2: unfinished F1–F4 (no floor failure) → INCOMPLETE, not a NO-GO band.
 * v4.3: evidence file/link can count; D8/D9 stop false benchmark/size credits.
 * v4.4: input review blocks nonsense Submit; every path item is an instruction with a gain.
 * v5.0: Filter 1 six checks scored by relevance levels (shadow mode default).
 * v5.2: Filter 2 one scored check (net margin mark-down, not hard stop); 15 slots; overridable MRP.
 * v5.3: Filter 3 one scored check — 10% volume-loss cliff rule (mark-down, not hard stop).
 * v5.4: Output sealed only when every required AI step has finished (Part 136).
 * v5.5: Every entered value is assessed; failed AI answers are never verdicts (Part 137).
 * v5.6: Part 138 — 18 checks (F1=7, F2=3, F3=1, F4=7); F1 gap below floor is a mark-down (not a hard stop);
 *       parity split from derivation; new-market benchmark not applicable; attributes no longer need an evidence file;
 *       F2 adds pack size and GST slots.
 * v5.7: A blank division scores with the same keyword match Submit stores. An explicit division still wins.
 *       Slot weights are unchanged from v5.6.
 */
export const SCORING_RULESET_VERSION = "v5.7";

/**
 * Part 133 D17 — credit comes from relevance levels, never from a field being non-empty.
 * `"binary"` kept only for rollback / shadow comparison against the pre-relevance count.
 */
export const SCORING_MODEL = "relevance";

/**
 * Part 133 D18 — while true, store the relevance score but keep showing the legacy
 * binary (done/open) verdict until the owner flips the switch.
 */
export const RELEVANCE_SHADOW_MODE = true;

/** Equal weights by default (D19). Owner may change; comparison report shows the effect. */
export const CHECK_WEIGHTS = Object.freeze({
  f1: Object.freeze({
    benchmark: 1,
    gap: 1,
    attributes: 1,
    derivation: 1,
    parity: 1,
    route: 1,
    argument: 1,
  }),
  f2: Object.freeze({ margin: 1, packSize: 1, gst: 1 }),
  f3: Object.freeze({ resilience: 1 }),
  f4: Object.freeze({
    functionalCoreStability: 1,
    consumptionContextStability: 1,
    manufacturingDisruptionRisk: 1,
    userHabitShiftPotential: 1,
    adjacentSubstitutionThreat: 1,
    purchaseFrequencyShift: 1,
    regulatoryDisruptionRisk: 1,
  }),
});

/** @deprecated Removed — evidence credit is always from quote-verified facts (relevance). */
export const F1_EVIDENCE_CREDIT_MODE = "read-and-relevant";

/** Part 133 D21 — AI-written F1 text earns nothing until a person edits or confirms. */
export const AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION = true;

/** Part 133 — prompt/cache version for the Filter 1 / plan AI calls. */
export const F1_PROMPT_VERSION = "v3";

/** Part 132 D13 — invalid inputs stop Submit (422); drafts always save. */
export const INVALID_INPUTS_BLOCK_SUBMIT = true;

/** Part 132 D14 — one cheap advisory AI call per Submit when no input is invalid. */
export const AI_INPUT_REVIEW = true;

/**
 * Part 132 D15 — Finance-owned GST slabs (%). Outside 0–40 is invalid;
 * inside the range but not on this list is a warning.
 */
export const GST_STANDARD_RATES = Object.freeze([0, 3, 5, 12, 18, 28, 40]);

/** Part 132 — declared gap must sit on the 0–10 scale. */
export const DECLARED_GAP_MAX = 10;

/** Part 132 — idea description shorter than this is invalid. */
export const IDEA_DESCRIPTION_MIN_CHARS = 15;

/** Part 132 — typed MRP more than this fraction away from implied MRP is a warning. */
export const MRP_IMPLIED_WARNING_PCT = 15;

/** Part 132 — advisory AI review token budget (input). */
export const INPUT_REVIEW_AI_MAX_INPUT_TOKENS = 2_000;

/**
 * Part 129 D5 — unfinished research is INCOMPLETE (not NO-GO).
 * `"as-built"` keeps the v4.1 band behaviour for incomplete ideas.
 */
export const INCOMPLETE_VERDICT_MODE = "incomplete";

/**
 * Part 129 D6 — when true, name/category/division typos would not flip scoreStatus.
 * Default false keeps today's fingerprint (name edits mark "edited since screening").
 */
export const SCORE_KEY_IGNORES_NAME_TYPOS = false;

/**
 * Part 131 D7 — team-provided evidence facts count only when quote-verified and
 * not contradicted by public research beyond EVIDENCE_CONFLICT_RATIO.
 * `"advisory"` shows facts but never counts them toward checks.
 */
export const EVIDENCE_TRUST_MODE = "count";

/** Part 131 D8 — stated benchmark alone never counts as verified. */
export const BENCHMARK_VERIFIED_NEEDS_EVIDENCE = true;

/** Part 131 D9 — category size of ₹0 / PASS-without-size never counts. */
export const CATEGORY_SIZE_NEEDS_SOURCED_FIGURE = true;

/** Part 131 D7 — public vs team figure conflict threshold (factor). */
export const EVIDENCE_CONFLICT_RATIO = 2;

/** Part 131 — evidence extract budget (characters kept across the whole document). */
export const EVIDENCE_EXTRACT_CHARS = 60_000;

/** Part 131 D11 — evidence AI step input budget. */
export const EVIDENCE_READ_MAX_INPUT_TOKENS = 20_000;

/** Part 131 — max evidence file size (bytes). */
export const EVIDENCE_FILE_MAX_BYTES = 8 * 1024 * 1024;

export const SCORE_CHECK_SLOTS_TOTAL = Object.freeze(
  Object.values(SCORE_CHECK_SLOTS).reduce((sum, n) => sum + Number(n || 0), 0)
);

export function minNetMarginForDivision(name) {
  const key = String(name || "").trim();
  if (!key || !Object.prototype.hasOwnProperty.call(DIVISION_MIN_NET_MARGIN_PCT, key)) return null;
  const v = DIVISION_MIN_NET_MARGIN_PCT[key];
  return v == null ? null : Number(v);
}

export function isLockedDivisionName(name) {
  return Object.prototype.hasOwnProperty.call(DIVISION_MIN_NET_MARGIN_PCT, String(name || "").trim());
}

export function formatIdeaWipeLabel(iso, { long = false } = {}) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function classifyIdeaWeightFromBands(revenueCrores) {
  const n = Number(revenueCrores);
  if (!Number.isFinite(n) || n <= IDEA_WEIGHT_BANDS.TIER_10G_MAX) return "10g";
  if (n <= IDEA_WEIGHT_BANDS.TIER_100G_MAX) return "100g";
  return "1000g";
}

export function classifyGoNoGoFromBands(pct) {
  const score = Number.isFinite(Number(pct)) ? Number(pct) : 0;
  if (score > GONOGO_SCORE_BANDS.WATCH_MAX) return "GO";
  if (score >= GONOGO_SCORE_BANDS.NOGO_MAX) return "WATCH";
  return "NO-GO";
}

export function ideaSizeTierFromBands(computedRevenueCr) {
  if (computedRevenueCr == null) return null;
  const n = Number(computedRevenueCr);
  if (!Number.isFinite(n)) return null;
  if (n <= IDEA_WEIGHT_BANDS.TIER_10G_MAX) return { tier: "10g", label: "up to ₹1 Cr" };
  if (n <= IDEA_WEIGHT_BANDS.TIER_100G_MAX) return { tier: "100g", label: "₹1–12 Cr" };
  return { tier: "1000g", label: "above ₹12 Cr" };
}

export function isGoScore(pct) {
  const score = Number.isFinite(Number(pct)) ? Number(pct) : 0;
  return score > GONOGO_SCORE_BANDS.WATCH_MAX;
}
