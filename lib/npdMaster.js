import { detectPersonalCare, matchInvestmentProfile } from "./investmentGrid.js";

export const DIVISION_NET_MARGIN = {
  "Professional Care": 60,
  "Personal Care": 50,
  Foods: 35,
  Snacks: 30,
  Bakery: 30,
  "Ambient Dairy": 25,
  Beverages: 25,
  "Dairy Craft — Non-UHT": 25, // Ghee, Condensed Milk, etc.
  "Cold Chain Business": 12,
  "Dairy Craft — UHT Milk": 12,
  "International Business": null, // per respective division — flag for manual review
};

export const DIVISION_OPTIONS = Object.keys(DIVISION_NET_MARGIN);

export const FIXED_PRICE_POINTS = [1, 2, 5, 10, 20, 50, 100];

export function round1(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

/** Empty / non-numeric → null. Distinguishes missing evidence from a declared 0. */
export function parseRequiredNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function nearestFixedPricePoint(pricePerUnit) {
  const price = Number(pricePerUnit);
  if (!Number.isFinite(price)) return null;
  return FIXED_PRICE_POINTS.reduce((best, point) =>
    Math.abs(point - price) < Math.abs(best - price) ? point : best
  );
}

function scoreKeywords(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    const k = String(kw).toLowerCase().trim();
    if (!k) continue;
    if (text.includes(k)) score += k.length > 10 ? 3 : k.length > 6 ? 2 : 1;
  }
  return score;
}

const DIVISION_KEYWORDS = {
  "Professional Care": [
    "professional care",
    "in-salon",
    "in salon",
    "salon",
    "spa treatment",
    "barber",
    "stylist",
    "professional use",
    "parlour",
    "parlor",
  ],
  "International Business": [
    "international",
    "export",
    "overseas",
    "gcc",
    "middle east",
    "africa market",
    "usa market",
    "global sku",
  ],
  Bakery: [
    "bakery",
    "bread",
    "bun",
    "rusk",
    "biscuit",
    "cookie",
    "cake",
    "pastry",
    "croissant",
    "khari",
  ],
  Snacks: [
    "snack",
    "namkeen",
    "chips",
    "puff",
    "extruded",
    "namkin",
    "mixture",
    "sev",
    "bhujia",
    "trail mix",
  ],
  "Dairy Craft — UHT Milk": ["uht milk", "uht white milk", "sterilized milk", "tetra milk"],
  "Dairy Craft — Non-UHT": [
    "ghee",
    "condensed milk",
    "mithai",
    "khoa",
    "khoya",
    "dairy craft",
  ],
  "Cold Chain Business": [
    "ice cream",
    "curd",
    "yogurt",
    "yoghurt",
    "paneer",
    "buttermilk",
    "chaas",
    "lassi",
    "frozen",
    "cold chain",
    "pouch milk",
    "fresh milk",
  ],
  Beverages: [
    "beverage",
    "juice",
    "rtd",
    "ready to drink",
    "coconut water",
    "energy drink",
    "flavored drink",
    "soft drink",
    "nectar",
  ],
  "Ambient Dairy": [
    "milk powder",
    "dairy whitener",
    "ambient dairy",
    "uht",
    "milkshake",
    "flavored milk",
    "plant-based milk",
    "oat milk",
    "almond milk",
  ],
  Foods: [
    "pickle",
    "chutney",
    "masala",
    "sauce",
    "gravy",
    "paste",
    "ready mix",
    "spice",
    "culinary",
    "condiment",
    "pet food",
    "kibble",
  ],
  "Personal Care": [
    "shampoo",
    "soap",
    "lotion",
    "serum",
    "skin",
    "hair",
    "face wash",
    "talc",
    "cream",
    "personal care",
    "toothpaste",
    "deodorant",
  ],
};

const PROFILE_CATEGORY_TO_DIVISION = {
  "Personal Care (PC)": "Personal Care",
  Snacks: "Snacks",
  "Food / Culinary": "Foods",
  "Pet Food": "Foods",
  "Cold Chain Dairy": "Cold Chain Business",
  "Beverage / Dairy": "Ambient Dairy",
};

/**
 * Map free-text idea → one of DIVISION_NET_MARGIN keys.
 * Keyword scoring first; investment-profile category as fallback.
 * Never a lock — UI must let the user override.
 */
export function detectDivision(ideaText) {
  const text = String(ideaText || "").toLowerCase();
  if (!text.trim()) return "Personal Care";

  if (/\b(export|overseas|international|gcc)\b/.test(text) && /\b(sku|market|launch|brand)\b/.test(text)) {
    return "International Business";
  }

  let best = { division: null, score: 0 };
  for (const [division, keywords] of Object.entries(DIVISION_KEYWORDS)) {
    const score = scoreKeywords(text, keywords);
    if (score > best.score) best = { division, score };
  }
  if (best.score >= 2 && best.division) return best.division;

  if (detectPersonalCare(text)) return "Personal Care";

  const profile = matchInvestmentProfile(ideaText);
  const mapped = PROFILE_CATEGORY_TO_DIVISION[profile.category];
  if (mapped) {
    if (mapped === "Ambient Dairy") {
      if (/\b(uht\s+milk|white milk)\b/.test(text)) return "Dairy Craft — UHT Milk";
      if (/\b(ghee|condensed)\b/.test(text)) return "Dairy Craft — Non-UHT";
      if (/\b(juice|beverage|drink|rtd|coconut water)\b/.test(text) && !/\b(milk|dairy|curd|ghee)\b/.test(text)) {
        return "Beverages";
      }
    }
    return mapped;
  }

  if (best.division) return best.division;
  return "Personal Care";
}
