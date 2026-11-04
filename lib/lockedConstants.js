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

/** Decision C — undetected division leaves Filter 2 unfinished (WATCH cap). */
export const UNMATCHED_DIVISION_F2 = "pending";

/**
 * Part 128 D1 — fixed check slots so unfinished filters cannot shrink the denominator.
 * `"as-built"` keeps the pre-v4.1 item-count behaviour (tests / rollback only).
 */
export const SCORE_DENOMINATOR_MODE = "fixed-slots";

/** Canonical Filter 1–4 analytical slots (Finance sign-off is outside these). */
export const SCORE_CHECK_SLOTS = Object.freeze({ f1: 4, f2: 3, f3: 1, f4: 7 });

/** Part 128 D2 — rupee tolerance when Filter 2 MRP is checked against the F3 safe range. */
export const F3_MRP_RANGE_TOLERANCE_INR = 0.5;

/**
 * Part 128 — bump only with owner approval together with golden + fingerprint updates.
 * Stored snapshots without a version are stamped `"legacy"` on read (never rewritten).
 */
export const SCORING_RULESET_VERSION = "v4.1";

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
