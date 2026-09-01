// Genuinely safe for the browser: picklist labels only, no thresholds, no rules.
export const DIVISION_OPTIONS = [
  "Professional Care",
  "Personal Care",
  "Foods",
  "Snacks",
  "Bakery",
  "Ambient Dairy",
  "Beverages",
  "Dairy Craft — Non-UHT",
  "Cold Chain Business",
  "Dairy Craft — UHT Milk",
  "International Business",
]; // names only — keep this list in sync with DIVISION_NET_MARGIN's keys server-side,
// but this file itself carries no margin/revenue numbers.

export const FIXED_PRICE_POINT_OPTIONS = [1, 2, 5, 10, 20, 50, 100];
