/**
 * CavinKare brand roster. Category-matching and brand-mismatch judgment
 * (CK_CATEGORIES / resolveBrandFit) were retired — typing a Category on the
 * proposition is human input, not something this file analyses.
 * CK_BRANDS and brandRosterForPrompt stay as dormant brand data.
 */

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
