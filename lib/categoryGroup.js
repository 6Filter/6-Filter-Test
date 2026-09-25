/**
 * Map the form Category field to a Log filter group.
 * Hair oils → Hair care, moisturiser → Skincare. Typed aliases still resolve.
 */

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const CATEGORY_GROUPS = Object.freeze([
  "Hair care",
  "Skincare",
  "Oral care",
  "Personal wash",
  "Home care",
  "Foods",
  "Beverages",
  "Baby & hygiene",
  "Other",
]);

const EXACT = new Map(
  [
    ["hair oils", "Hair care"],
    ["hair oil", "Hair care"],
    ["hair care", "Hair care"],
    ["shampoo", "Hair care"],
    ["hair colour", "Hair care"],
    ["hair color", "Hair care"],
    ["hair serum", "Hair care"],
    ["conditioner", "Hair care"],
    ["skin cream", "Skincare"],
    ["skin care", "Skincare"],
    ["skincare", "Skincare"],
    ["face wash", "Skincare"],
    ["body lotion", "Skincare"],
    ["moisturiser", "Skincare"],
    ["moisturizer", "Skincare"],
    ["sunscreen", "Skincare"],
    ["fairness cream", "Skincare"],
    ["talcum powder", "Skincare"],
    ["toothpaste", "Oral care"],
    ["toothbrush", "Oral care"],
    ["mouthwash", "Oral care"],
    ["oral care", "Oral care"],
    ["deodorant", "Personal wash"],
    ["deodorants", "Personal wash"],
    ["soap", "Personal wash"],
    ["soaps", "Personal wash"],
    ["hand wash", "Personal wash"],
    ["detergent", "Home care"],
    ["detergents", "Home care"],
    ["dishwash", "Home care"],
    ["floor cleaner", "Home care"],
    ["air freshener", "Home care"],
    ["insecticide", "Home care"],
    ["home care", "Home care"],
    ["baby care", "Baby & hygiene"],
    ["diapers", "Baby & hygiene"],
    ["sanitary napkins", "Baby & hygiene"],
  ].concat(
    [
      "snacks",
      "namkeen",
      "chips",
      "spices",
      "spices and masalas",
      "ready to cook",
      "ready to eat",
      "dairy",
      "cooking oil",
      "ghee",
      "atta",
      "rice",
      "pulses",
      "pickles",
      "sauces",
      "biscuits",
      "cookies",
      "noodles",
      "pasta",
      "breakfast cereal",
      "chocolate",
      "confectionery",
      "honey",
      "jam",
      "spreads",
      "milk",
      "curd",
      "butter",
      "cheese",
      "ice cream",
      "foods",
    ].map((k) => [k, "Foods"]),
    [
      "beverages",
      "health drink",
      "juice",
      "carbonated drinks",
      "energy drink",
      "bottled water",
      "tea",
      "coffee",
      "instant coffee",
    ].map((k) => [k, "Beverages"])
  )
);

export function resolveCategoryGroup(category) {
  const key = norm(category);
  if (!key) return "";
  if (EXACT.has(key)) return EXACT.get(key);
  if (/\bhair\b/.test(key) || key.includes("shampoo") || key.includes("conditioner")) return "Hair care";
  if (
    /\b(moistur|skincare|sunscreen|fairness|lotion)\b/.test(key) ||
    key.includes("face wash") ||
    key.includes("skin cream") ||
    (/\bskin\b/.test(key) && !/\bhair\b/.test(key))
  ) {
    return "Skincare";
  }
  if (/\b(tooth|mouth|oral)\b/.test(key)) return "Oral care";
  if (/\b(soap|deodorant|hand wash)\b/.test(key)) return "Personal wash";
  if (/\b(detergent|dishwash|cleaner|freshener|insecticide)\b/.test(key)) return "Home care";
  if (/\b(baby|diaper|sanitary)\b/.test(key)) return "Baby & hygiene";
  if (/\b(tea|coffee|juice|drink|beverage)\b/.test(key)) return "Beverages";
  if (
    /\b(snack|spice|pickle|biscuit|noodle|atta|rice|ghee|oil|milk|curd|chocolate|food)\b/.test(key)
  ) {
    return "Foods";
  }
  return "Other";
}

export function rowCategoryGroup(doc = {}) {
  return resolveCategoryGroup(doc.category);
}
