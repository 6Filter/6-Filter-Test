import assert from "node:assert/strict";
import { resolveCategoryGroup, rowCategoryGroup } from "../lib/categoryGroup.js";
import { applyScopedFilters } from "../lib/logStatus.js";

assert.equal(resolveCategoryGroup("Hair oils"), "Hair care");
assert.equal(resolveCategoryGroup("hair oil"), "Hair care");
assert.equal(resolveCategoryGroup("Ayurvedic hair oil"), "Hair care");
assert.equal(resolveCategoryGroup("Shampoo"), "Hair care");
assert.equal(resolveCategoryGroup("Moisturiser"), "Skincare");
assert.equal(resolveCategoryGroup("moisturizer"), "Skincare");
assert.equal(resolveCategoryGroup("Face wash"), "Skincare");
assert.equal(resolveCategoryGroup("Sunscreen"), "Skincare");
assert.equal(resolveCategoryGroup("Toothpaste"), "Oral care");
assert.equal(resolveCategoryGroup("Detergent"), "Home care");
assert.equal(resolveCategoryGroup("Namkeen"), "Foods");
assert.equal(resolveCategoryGroup("Tea"), "Beverages");
assert.equal(resolveCategoryGroup(""), "");

const rows = [
  { id: "1", name: "Cooling oil", category: "Hair oils", submitterName: "A" },
  { id: "2", name: "Day cream", category: "Moisturiser", submitterName: "B" },
  { id: "3", name: "Crunch", category: "Namkeen", submitterName: "C" },
];
assert.equal(rowCategoryGroup(rows[0]), "Hair care");
assert.equal(rowCategoryGroup(rows[1]), "Skincare");
assert.deepEqual(
  applyScopedFilters(rows, { categoryGroupFilter: "Hair care" }).map((r) => r.id),
  ["1"]
);
assert.deepEqual(
  applyScopedFilters(rows, { categoryGroupFilter: "Skincare" }).map((r) => r.id),
  ["2"]
);
assert.equal(applyScopedFilters(rows, { categoryGroupFilter: "Oral care" }).length, 0);

console.log("PASS category group maps form values and filters the Log");
