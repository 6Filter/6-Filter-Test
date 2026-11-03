/**
 * Owner division definitions for AI classification (Part 126).
 * One line per locked division: belongs / does-not-belong examples.
 * Replace with owner-supplied copy when available.
 */
import { LOCKED_DIVISION_NAMES } from "./lockedConstants.js";

export const DIVISION_DEFINITIONS = Object.freeze({
  "Professional Care": {
    belongs: "Salon / professional-channel treatments (keratin smoothing, colour, spa protocols sold B2B to salons).",
    doesNotBelong: "Mass retail personal care (shampoos, soaps, creams for grocery/MT).",
  },
  "Personal Care": {
    belongs: "Mass personal care for retail: hair oils, shampoo, skin cream, soap, deodorant.",
    doesNotBelong: "Salon-only professional kits; foods; dairy.",
  },
  Foods: {
    belongs: "Staple / culinary foods: pickles, spices, malt drinks, ready-to-cook gravies, health drink powders.",
    doesNotBelong: "Snacks/namkeen; dairy milk; beverages as soft drinks.",
  },
  Snacks: {
    belongs: "Savoury snacks: namkeen, chips, extruded snacks, popcorn for impulse retail.",
    doesNotBelong: "Staple foods; bakery cakes; dairy.",
  },
  Bakery: {
    belongs: "Bread, buns, cakes, cookies sold as bakery.",
    doesNotBelong: "Namkeen snacks; dairy desserts.",
  },
  "Ambient Dairy": {
    belongs: "Shelf-stable dairy alternatives that are not UHT milk tetra — e.g. ambient buttermilk, flavoured milk drinks in long-life packs when positioned as Ambient Dairy.",
    doesNotBelong: "Chilled cold-chain dairy; UHT toned milk tetra (Dairy Craft — UHT Milk).",
  },
  Beverages: {
    belongs: "Soft drinks, juices, energy drinks, powdered beverage mixes for refreshment.",
    doesNotBelong: "Dairy milk; malt health drinks better classed as Foods.",
  },
  "Dairy Craft — Non-UHT": {
    belongs: "Value-added non-UHT dairy craft: curd cups, paneer, ghee craft lines (non-UHT).",
    doesNotBelong: "UHT milk tetra; cold-chain ice cream.",
  },
  "Cold Chain Business": {
    belongs: "Products that require continuous cold chain: ice cream, frozen, chilled short-shelf dairy.",
    doesNotBelong: "Ambient long-life packs; UHT tetra that travels ambient.",
  },
  "Dairy Craft — UHT Milk": {
    belongs: "UHT / tetra-packed toned or standardized milk sold ambient.",
    doesNotBelong: "Spiced buttermilk / flavoured ambient dairy drinks when Ambient Dairy applies; chilled milk.",
  },
  "International Business": {
    belongs: "Explicitly export / overseas / GCC / international pack for another market.",
    doesNotBelong: "Domestic India SKUs with no export cue — pick the product's respective domestic division instead.",
  },
});

export function divisionDefinitionsPromptBlock() {
  const lines = [];
  for (const name of LOCKED_DIVISION_NAMES) {
    const d = DIVISION_DEFINITIONS[name] || { belongs: "", doesNotBelong: "" };
    lines.push(
      `- ${name}: BELONGS: ${d.belongs} DOES NOT BELONG: ${d.doesNotBelong}`
    );
  }
  return lines.join("\n");
}
