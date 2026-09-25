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

/** Free database primus-ai-store expires 25 Oct 2026. Render deletes it 14 days later. */
export const IDEA_STORE_WIPE_AT = "2026-11-08T04:52:34.053Z";

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
