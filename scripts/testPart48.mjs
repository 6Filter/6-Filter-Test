import assert from "node:assert/strict";
import {
  classifyProductGstKind,
  composeProductIdeaText,
  resolveGstRate,
  snapGstSlab,
} from "../lib/gstRate.js";

const snack = {
  name: "Masala millet namkeen",
  category: "Packaged snacks",
  ideaDescription: "Ready-to-eat extruded millet chips for quick-commerce.",
};
assert.equal(classifyProductGstKind(snack), "packaged-snack");
assert.equal(resolveGstRate({ ...snack, aiRate: 12 }).gstRatePct, 18, "snacks must be 18% even if AI still quotes the old 12% slab");
assert.match(resolveGstRate(snack).gstBasis, /packaged snack/i);

const staple = {
  name: "Fortified atta",
  category: "Staples",
  ideaDescription: "Whole-wheat atta for South India modern trade.",
};
assert.equal(classifyProductGstKind(staple), "staple-food");
assert.equal(resolveGstRate(staple).gstRatePct, 5);
assert.equal(resolveGstRate({ ...staple, aiRate: 12 }).gstRatePct, 5);

const otherFood = {
  name: "Mango pickle",
  category: "Foods",
  ideaDescription: "Regional pickle in glass jar.",
};
assert.equal(classifyProductGstKind(otherFood), "food");
assert.equal(resolveGstRate({ ...otherFood, aiRate: 5 }).gstRatePct, 5);
assert.equal(resolveGstRate({ ...otherFood, aiRate: 18 }).gstRatePct, 18);
assert.equal(resolveGstRate({ ...otherFood, aiRate: 12 }).gstRatePct, 18, "food that is not 5 or 18 snaps to 18");

const hairOil = {
  name: "Cooling herbal hair oil",
  category: "Hair oils",
  ideaDescription: "100ml ayurvedic herbal hair oil vs Parachute Advansed.",
};
assert.equal(classifyProductGstKind(hairOil), "other");
assert.equal(resolveGstRate(hairOil).gstRatePct, 18);
assert.equal(resolveGstRate({ ...hairOil, aiRate: 18 }).gstRatePct, 18);

assert.equal(snapGstSlab(17.6), 18);
assert.equal(snapGstSlab(5.2), 5);

const composed = composeProductIdeaText(snack);
assert.match(composed, /Masala millet namkeen/);
assert.match(composed, /Packaged snacks/);
assert.match(composed, /extruded millet chips/);

console.log("PASS GST food 5/18 and packaged-snack 18 from top-of-page product");
