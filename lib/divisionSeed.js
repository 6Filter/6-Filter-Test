/** One-time seed for division_thresholds — margin floors mirror lockedConstants (ignored for scoring). */
import { DIVISION_MIN_NET_MARGIN_PCT } from "./lockedConstants.js";

function row(division_name, revenue_target_all_channels_cr, revenue_target_ecom_mt_cr, note) {
  return {
    division_name,
    min_net_margin_pct: DIVISION_MIN_NET_MARGIN_PCT[division_name] ?? null,
    revenue_target_all_channels_cr,
    revenue_target_ecom_mt_cr,
    note,
  };
}

export const DIVISION_THRESHOLD_SEED = [
  row("Professional Care", 25, null, "Salons + Ecommerce only"),
  row("Personal Care", 25, 12, ""),
  row("Foods", 12, null, ""),
  row("Snacks", 12, null, ""),
  row("Bakery", 12, null, ""),
  row("Ambient Dairy", 25, 12, ""),
  row("Beverages", 25, 12, ""),
  row("Dairy Craft — Non-UHT", 12, null, "₹12 Cr South / ₹25 Cr National — geography-based"),
  row("Cold Chain Business", 25, null, "All channels"),
  row("Dairy Craft — UHT Milk", 12, null, "₹12 Cr South / ₹25 Cr National — geography-based"),
  row("International Business", null, null, "Per respective division, INR at group level"),
];
