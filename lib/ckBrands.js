/**
 * CavinKare brand → category map used by the NPD AI layer.
 * A named house brand that does not carry the product line is a Filter 1 fail.
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRe(aliases) {
  const parts = aliases.map((a) => escapeRe(a).replace(/['’]/g, "['’]?"));
  return new RegExp(`\\b(?:${parts.join("|")})\\b`, "i");
}

export const CK_BRANDS = [
  {
    name: "Cavin's",
    group: "Dairy & Ice Cream",
    family: "Dairy & Ice Cream",
    house: "Dairy",
    aliases: ["cavin's", "cavins", "cavin’s"],
    lines: ["Milk", "Milkshakes", "Ghee", "Paneer", "Curd", "Ice Cream"],
    categoryKeys: ["milk", "milkshake", "ghee", "paneer", "curd", "ice_cream"],
    primaryDivision: "Ambient Dairy",
  },
  {
    name: "Chik",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Personal Care",
    aliases: ["chik"],
    lines: ["Shampoo"],
    categoryKeys: ["shampoo"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Meera",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Personal Care",
    aliases: ["meera"],
    lines: ["Shampoo", "Hairwash Powder"],
    categoryKeys: ["shampoo", "hairwash_powder"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Nyle",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Personal Care",
    aliases: ["nyle"],
    lines: ["Shampoo"],
    categoryKeys: ["shampoo"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Karthika",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Personal Care",
    aliases: ["karthika"],
    lines: ["Hairwash Powder"],
    categoryKeys: ["hairwash_powder"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Indica",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Personal Care",
    aliases: ["indica"],
    lines: ["Hair Colour"],
    categoryKeys: ["hair_colour"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Raaga Professional",
    group: "Personal Care (Hair & Skin)",
    family: "Hair Care",
    house: "Professional Care",
    aliases: ["raaga professional", "raaga"],
    lines: ["Hair Colour"],
    categoryKeys: ["hair_colour"],
    primaryDivision: "Professional Care",
  },
  {
    name: "Fairever",
    group: "Personal Care (Hair & Skin)",
    family: "Skin & Body Care",
    house: "Personal Care",
    aliases: ["fairever", "fair ever"],
    lines: ["Fairness Cream"],
    categoryKeys: ["fairness_cream"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Spinz",
    group: "Personal Care (Hair & Skin)",
    family: "Skin & Body Care",
    house: "Personal Care",
    aliases: ["spinz"],
    lines: ["Deodorant", "Talc"],
    categoryKeys: ["deodorant", "talc"],
    primaryDivision: "Personal Care",
  },
  {
    name: "Garden",
    group: "Foods, Snacks & Beverages",
    family: "Snacks & Namkeens",
    house: "Snacks",
    aliases: ["garden"],
    lines: ["Salted Snacks", "Namkeens"],
    categoryKeys: ["namkeen"],
    primaryDivision: "Snacks",
  },
  {
    name: "Ruchi",
    group: "Foods, Snacks & Beverages",
    family: "Pickles & Culinary Pastes",
    house: "Foods",
    aliases: ["ruchi"],
    lines: ["Pickles", "Culinary Pastes"],
    categoryKeys: ["pickle"],
    primaryDivision: "Foods",
  },
  {
    name: "Chinni's",
    group: "Foods, Snacks & Beverages",
    family: "Pickles & Culinary Pastes",
    house: "Foods",
    aliases: ["chinni's", "chinnis", "chinni’s"],
    lines: ["Pickles", "Vermicelli", "Chikki"],
    categoryKeys: ["pickle", "vermicelli", "chikki"],
    primaryDivision: "Foods",
  },
  {
    name: "Maa",
    group: "Foods, Snacks & Beverages",
    family: "Beverages",
    house: "Beverages",
    aliases: ["maa"],
    lines: ["Fruit Drinks"],
    categoryKeys: ["fruit_drink"],
    primaryDivision: "Beverages",
  },
  {
    name: "Friva",
    group: "Foods, Snacks & Beverages",
    family: "Beverages",
    house: "Beverages",
    aliases: ["friva"],
    lines: ["Beverages"],
    categoryKeys: ["beverage", "fruit_drink"],
    primaryDivision: "Beverages",
  },
];

/** First match wins — put specific SKUs before generic milk / beverage. */
export const CK_CATEGORIES = [
  {
    key: "ice_cream",
    label: "Ice Cream",
    division: "Cold Chain Business",
    brands: ["Cavin's"],
    patterns: [/\bice[\s-]*creams?\b/i, /\bgelato\b/i, /\bkulfi\b/i],
  },
  {
    key: "milkshake",
    label: "Milkshakes",
    division: "Ambient Dairy",
    brands: ["Cavin's"],
    patterns: [
      /\bmilk[\s-]*shakes?\b/i,
      /\bflavou?red\s+milks?\b/i,
      /\b(pista|badam|rose|elaichi|chocolate)\s+milks?\b/i,
    ],
  },
  {
    key: "paneer",
    label: "Paneer",
    division: "Cold Chain Business",
    brands: ["Cavin's"],
    patterns: [/\bpaneer\b/i],
  },
  {
    key: "curd",
    label: "Curd",
    division: "Cold Chain Business",
    brands: ["Cavin's"],
    patterns: [/\bcurds?\b/i, /\byoghur?ts?\b/i, /\bdahi\b/i],
  },
  {
    key: "ghee",
    label: "Ghee",
    division: "Dairy Craft — Non-UHT",
    brands: ["Cavin's"],
    patterns: [/\bghee\b/i],
  },
  {
    key: "hairwash_powder",
    label: "Hairwash Powder",
    division: "Personal Care",
    brands: ["Meera", "Karthika"],
    patterns: [/\bhair[\s-]*wash[\s-]*powders?\b/i, /\bherbal\s+hair\s+powders?\b/i],
  },
  {
    key: "hair_colour",
    label: "Hair Colour",
    division: "Personal Care",
    brands: ["Indica", "Raaga Professional"],
    patterns: [/\bhair[\s-]*colou?rs?\b/i, /\bhair[\s-]*dyes?\b/i, /\bhenna\b/i],
  },
  {
    key: "shampoo",
    label: "Shampoo",
    division: "Personal Care",
    brands: ["Chik", "Meera", "Nyle"],
    patterns: [/\bshampoos?\b/i],
  },
  {
    key: "fairness_cream",
    label: "Fairness Cream",
    division: "Personal Care",
    brands: ["Fairever"],
    patterns: [/\bfairness\b/i, /\bskin[\s-]*light/i, /\bfairness\s+creams?\b/i],
  },
  {
    key: "deodorant",
    label: "Deodorant",
    division: "Personal Care",
    brands: ["Spinz"],
    patterns: [/\bdeodorants?\b/i, /\bbody[\s-]*sprays?\b/i, /\bdeos?\b/i],
  },
  {
    key: "talc",
    label: "Talc",
    division: "Personal Care",
    brands: ["Spinz"],
    patterns: [/\btalc(?:um)?\b/i],
  },
  {
    key: "namkeen",
    label: "Salted Snacks / Namkeens",
    division: "Snacks",
    brands: ["Garden"],
    patterns: [/\bnamkeens?\b/i, /\bnamkins?\b/i, /\bsalted\s+snacks?\b/i, /\bbhujia\b/i, /\bsev\b/i],
  },
  {
    key: "pickle",
    label: "Pickles & Culinary Pastes",
    division: "Foods",
    brands: ["Ruchi", "Chinni's"],
    patterns: [/\bpickles?\b/i, /\bculinary\s+pastes?\b/i, /\bachaar\b/i],
  },
  {
    key: "vermicelli",
    label: "Vermicelli",
    division: "Foods",
    brands: ["Chinni's"],
    patterns: [/\bvermicelli\b/i, /\bseviyan\b/i, /\bsemiya\b/i],
  },
  {
    key: "chikki",
    label: "Chikki",
    division: "Foods",
    brands: ["Chinni's"],
    patterns: [/\bchikki\b/i],
  },
  {
    key: "fruit_drink",
    label: "Fruit Drinks",
    division: "Beverages",
    brands: ["Maa"],
    alsoAccept: ["Friva"],
    patterns: [/\bfruit\s+drinks?\b/i, /\bjuices?\b/i, /\bnectars?\b/i, /\bmango\s+drinks?\b/i],
  },
  {
    key: "beverage",
    label: "Beverages",
    division: "Beverages",
    brands: ["Friva"],
    alsoAccept: ["Maa"],
    patterns: [/\bbeverages?\b/i, /\bsoft\s+drinks?\b/i, /\brtd\b/i, /\benergy\s+drinks?\b/i],
  },
  {
    key: "milk",
    label: "Milk",
    division: "Dairy Craft — UHT Milk",
    brands: ["Cavin's"],
    patterns: [/\b(uht\s+)?(toned\s+|double[\s-]*toned\s+|standardised\s+|standardized\s+|full[\s-]*cream\s+)?milks?\b/i],
  },
];

const BRAND_MATCHERS = CK_BRANDS.map((brand) => ({
  brand,
  re: wordRe(brand.aliases),
}));

export function brandRosterForPrompt() {
  const groups = [
    "Dairy & Ice Cream",
    "Personal Care (Hair & Skin)",
    "Foods, Snacks & Beverages",
  ];
  const lines = groups.map((group, i) => {
    const inGroup = CK_BRANDS.filter((b) => b.group === group);
    const families = [];
    for (const brand of inGroup) {
      if (!families.includes(brand.family)) families.push(brand.family);
    }
    const body = families
      .map((family) => {
        const members = inGroup
          .filter((b) => b.family === family)
          .map((b) => `${b.name} (${b.lines.join(", ")})`)
          .join("; ");
        if (families.length === 1 && family === group) return `Brands: ${members}`;
        return `${family}: ${members}`;
      })
      .join("\n");
    return `Category ${i + 1}: ${group}\n${body}`;
  });
  return (
    lines.join("\n") +
    "\nPlace a SKU only on a brand that carries that exact line. " +
    "Nyle shampoo stays on Nyle (Hair Care) — never reassign it to Chik. " +
    "Chik, Meera, and Nyle all carry shampoo. " +
    "A milkshake belongs to Cavin's dairy, not Friva beverages."
  );
}

function findMentionedBrands(text) {
  const hits = [];
  const seen = new Set();
  for (const { brand, re } of BRAND_MATCHERS) {
    if (brand.exclude && brand.exclude.some((ex) => ex.test(text))) continue;
    if (!re.test(text)) continue;
    if (seen.has(brand.name)) continue;
    seen.add(brand.name);
    hits.push(brand);
  }
  return hits;
}

function findCategory(text) {
  for (const cat of CK_CATEGORIES) {
    if (cat.patterns.some((re) => re.test(text))) return cat;
  }
  return null;
}

function allowedBrandNames(category) {
  return new Set([...(category.brands || []), ...(category.alsoAccept || [])]);
}

function lineBrandsLabel(category) {
  return (category.brands || []).join(", ");
}

function mismatchReason(brands, category) {
  const named = brands.map((b) => b.name).join(" / ");
  const lines = brands
    .map((b) => `${b.name} carries ${b.lines.join(", ")}`)
    .join(". ");
  const home = lineBrandsLabel(category);
  return (
    `${named} does not carry ${category.label}. ${lines}. ` +
    `${category.label} is carried by ${home}.`
  );
}

function pickSuggestedBrand(mentioned, category) {
  const allowed = category ? allowedBrandNames(category) : new Set();
  const namedFit = mentioned.find((b) => allowed.has(b.name));
  if (namedFit) return namedFit.name;
  if (mentioned[0] && (!category || allowed.has(mentioned[0].name))) return mentioned[0].name;
  return category?.brands?.[0] || mentioned[0]?.name || null;
}

/**
 * @returns {{
 *   mentionedBrands: string[],
 *   categoryKey: string|null,
 *   categoryLabel: string|null,
 *   suggestedBrand: string|null,
 *   suggestedDivision: string|null,
 *   mismatch: boolean,
 *   reason: string,
 * }}
 */
export function resolveBrandFit(ideaText) {
  const text = String(ideaText || "").replace(/[’]/g, "'");
  const mentioned = findMentionedBrands(text);
  const category = findCategory(text);

  const suggestedBrand = pickSuggestedBrand(mentioned, category);
  const suggestedDivision = category?.division || mentioned[0]?.primaryDivision || null;
  const lineBrands = category?.brands || [];

  const empty = {
    mentionedBrands: mentioned.map((b) => b.name),
    categoryKey: category?.key || null,
    categoryLabel: category?.label || null,
    suggestedBrand,
    suggestedDivision,
    lineBrands,
    mismatch: false,
    reason: "",
  };

  if (!mentioned.length || !category) {
    if (category && lineBrands.length) {
      empty.reason = `${category.label} is carried by ${lineBrands.join(", ")}.`;
    } else if (mentioned.length) {
      empty.reason = `${mentioned[0].name} (${mentioned[0].family}) carries ${mentioned[0].lines.join(", ")}.`;
    }
    return empty;
  }

  const allowed = allowedBrandNames(category);
  const offenders = mentioned.filter((b) => !allowed.has(b.name));
  if (!offenders.length) {
    empty.reason = `${mentioned.map((b) => b.name).join(" / ")} can carry ${category.label}. Line brands: ${lineBrands.join(", ")}.`;
    return empty;
  }

  return {
    ...empty,
    mismatch: true,
    reason: mismatchReason(offenders, category),
  };
}

export function applyBrandFitToFilter(filter, brandFit) {
  const next = filter && typeof filter === "object" ? { ...filter } : {};
  next.brandFit = brandFit || null;
  if (!brandFit?.mismatch) return next;
  next.verdict = "FAIL";
  next.verdictReason = brandFit.reason;
  return next;
}
