/**
 * Starter category → family map for scoping Nielsen/Kantar and web search.
 * Same caveat as the category-autocomplete list: CMI's real taxonomy should
 * replace this before it is treated as exhaustive.
 */

export const CATEGORY_FAMILY_LIST_NOTE =
  "Starter category-family map — CMI's real taxonomy is needed before this is exhaustive.";

export const CATEGORY_FAMILIES = Object.freeze(["Personal Care", "Foods", "Beverages", "Home Care"]);

/** Exact labels as they appear on the form, plus common aliases from the 6 Filter prompt. */
export const CATEGORY_FAMILY_MAP = {
  "Hair Oils": "Personal Care",
  "Hair oils": "Personal Care",
  "Hair Care": "Personal Care",
  "Hair care": "Personal Care",
  Shampoo: "Personal Care",
  "Hair colour": "Personal Care",
  "Hair serum": "Personal Care",
  Conditioner: "Personal Care",
  "Skin Care": "Personal Care",
  "Skin cream": "Personal Care",
  "Face wash": "Personal Care",
  "Body lotion": "Personal Care",
  "Talcum powder": "Personal Care",
  Deodorants: "Personal Care",
  Deodorant: "Personal Care",
  Soaps: "Personal Care",
  Soap: "Personal Care",
  "Hand wash": "Personal Care",
  "Fairness cream": "Personal Care",
  Moisturiser: "Personal Care",
  Sunscreen: "Personal Care",
  Toothpaste: "Personal Care",
  Toothbrush: "Personal Care",
  Mouthwash: "Personal Care",
  "Baby care": "Personal Care",
  Diapers: "Personal Care",
  "Sanitary napkins": "Personal Care",
  Snacks: "Foods",
  Namkeen: "Foods",
  Chips: "Foods",
  "Spices & Masalas": "Foods",
  Spices: "Foods",
  "Ready-to-cook": "Foods",
  "Ready-to-eat": "Foods",
  Dairy: "Foods",
  "Cooking oil": "Foods",
  Ghee: "Foods",
  Atta: "Foods",
  Rice: "Foods",
  Pulses: "Foods",
  Pickles: "Foods",
  Sauces: "Foods",
  Biscuits: "Foods",
  Cookies: "Foods",
  Noodles: "Foods",
  Pasta: "Foods",
  "Breakfast cereal": "Foods",
  Chocolate: "Foods",
  Confectionery: "Foods",
  Honey: "Foods",
  Jam: "Foods",
  Spreads: "Foods",
  Milk: "Foods",
  Curd: "Foods",
  Butter: "Foods",
  Cheese: "Foods",
  "Ice cream": "Foods",
  Beverages: "Beverages",
  "Health drink": "Beverages",
  Juice: "Beverages",
  "Carbonated drinks": "Beverages",
  "Energy drink": "Beverages",
  "Bottled water": "Beverages",
  Tea: "Beverages",
  Coffee: "Beverages",
  "Instant coffee": "Beverages",
  Detergents: "Home Care",
  Detergent: "Home Care",
  Dishwash: "Home Care",
  "Floor cleaner": "Home Care",
  "Air freshener": "Home Care",
  Insecticide: "Home Care",
};

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FAMILY_BY_NORM = new Map();
for (const [label, family] of Object.entries(CATEGORY_FAMILY_MAP)) {
  FAMILY_BY_NORM.set(norm(label), family);
}
for (const family of CATEGORY_FAMILIES) {
  FAMILY_BY_NORM.set(norm(family), family);
}

export function normalizeCategoryKey(category) {
  return norm(category);
}

export function resolveCategoryFamily(category) {
  const key = norm(category);
  if (!key) return null;
  return FAMILY_BY_NORM.get(key) || null;
}
