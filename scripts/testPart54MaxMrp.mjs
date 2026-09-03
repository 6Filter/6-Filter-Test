import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGrammageToNumber } from "../lib/filters/runCostEstimate.js";
import {
  assembleMarginElasticity,
  normalizeCategoryAvgPrice,
  solveForVolumeLossCeiling,
} from "../lib/filters/runMarginElasticityResearch.js";
import { checkF3 } from "../lib/filterChecks.js";
import {
  hydrateMarginElasticityMrp,
  INVALID_MRP_RANGE_COPY,
  isMarginElasticityUnfilled,
  PACK_SIZE_UNCONFIRMED_COPY,
} from "../lib/mrpFormula.js";

assert.equal(parseGrammageToNumber("100ml"), 100);
assert.equal(parseGrammageToNumber("10 ml sachet"), 10);
assert.equal(parseGrammageToNumber("1L bottle"), 1000);
assert.equal(parseGrammageToNumber(""), null);

const sachet100 = normalizeCategoryAvgPrice({
  avgPriceInr: 81.675,
  packSizeFound: "10ml sachet",
  grammage: "100ml",
});
assert.equal(sachet100.normalized, true);
assert.ok(Math.abs(sachet100.pricePerUnitWeight - 8.1675) < 1e-9);
assert.ok(Math.abs(sachet100.normalizedAvgPriceInr - 816.75) < 1e-9);

const sachet50 = normalizeCategoryAvgPrice({
  avgPriceInr: 81.675,
  packSizeFound: "10ml sachet",
  grammage: "50ml",
});
assert.ok(Math.abs(sachet50.normalizedAvgPriceInr - 408.375) < 1e-9);
assert.ok(
  Math.abs(sachet100.normalizedAvgPriceInr / sachet50.normalizedAvgPriceInr - 2) < 1e-9,
  "50ml ceiling basis must be half of the 100ml basis"
);

const noPack = normalizeCategoryAvgPrice({
  avgPriceInr: 81.675,
  packSizeFound: "",
  grammage: "100ml",
});
assert.equal(noPack.normalized, false);
assert.equal(noPack.normalizedAvgPriceInr, null);
assert.equal(noPack.warning, PACK_SIZE_UNCONFIRMED_COPY);

const inflation = { ratePct: 18.5, volumeLossPct: 18.5, source: "CPI personal-care sub-group" };

const screenshot = assembleMarginElasticity({
  cogsAtScale: 100,
  netMarginAtScale: 80,
  division: "Personal Care",
  minMarginPct: 50,
  categoryAvgPrice: { ...sachet100, sourceTier: 2, sources: [] },
  inflation,
  grammage: "100ml",
});
assert.equal(screenshot.minMrpInr, 200);
assert.ok(screenshot.maxMrpInr > screenshot.minMrpInr, `max ${screenshot.maxMrpInr} must exceed min 200`);
assert.ok(screenshot.maxMrpInr > 800, `normalized 10ml@₹81.675 should lift 100ml well above ₹200, got ${screenshot.maxMrpInr}`);
assert.equal(screenshot.rangeError, undefined);

const halfPack = assembleMarginElasticity({
  cogsAtScale: 50,
  netMarginAtScale: 80,
  division: "Personal Care",
  minMarginPct: 50,
  categoryAvgPrice: { ...sachet50, sourceTier: 2, sources: [] },
  inflation,
  grammage: "50ml",
});
assert.equal(halfPack.minMrpInr, 100);
assert.ok(Math.abs(halfPack.maxMrpInr * 2 - screenshot.maxMrpInr) < 0.02, "50ml ceiling must scale with pack size");

const caution = assembleMarginElasticity({
  cogsAtScale: 100,
  minMarginPct: 50,
  categoryAvgPrice: { ...noPack, sources: [] },
  inflation,
  grammage: "100ml",
});
assert.equal(caution.maxMrpInr, null);
assert.equal(caution.packSizeWarning, PACK_SIZE_UNCONFIRMED_COPY);
assert.equal(caution.minMrpInr, 200);

const samePackCheap = normalizeCategoryAvgPrice({
  avgPriceInr: 81.675,
  packSizeFound: "100ml",
  grammage: "100ml",
});
const inverted = assembleMarginElasticity({
  cogsAtScale: 100,
  minMarginPct: 50,
  categoryAvgPrice: { ...samePackCheap, sourceTier: 2, sources: [] },
  inflation,
  grammage: "100ml",
});
assert.equal(inverted.maxMrpInr, null);
assert.equal(inverted.rangeError, INVALID_MRP_RANGE_COPY);
assert.equal(inverted.minMrpInr, 200);

const ceiling = solveForVolumeLossCeiling({
  categoryAvgPrice: sachet100.normalizedAvgPriceInr,
  inflationRatePct: 18.5,
  volumeLossAtInflationPct: 18.5,
});
assert.ok(Math.abs(ceiling.priceCeiling - screenshot.maxMrpInr) < 0.02);

const hydrated = hydrateMarginElasticityMrp({ minMrpInr: 200, maxMrpInr: 81.675 }, 100);
assert.equal(hydrated.maxMrpInr, null);
assert.equal(hydrated.rangeError, INVALID_MRP_RANGE_COPY);
assert.equal(isMarginElasticityUnfilled({ minMrpInr: 200, maxMrpInr: 81.675 }), true);

const checked = checkF3({ netMarginAtScale: 80 }, { marginElasticity: inverted });
assert.match(checked.items[0].text, /invalid result/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /range\?\.rangeError/);
assert.match(formSrc, /derived-note error/);

console.log("PASS Part 54 max MRP never displays below min; pack price is normalized to grammage");
console.log(
  `100ml: min=₹${screenshot.minMrpInr} max=₹${screenshot.maxMrpInr.toFixed(2)} from raw ₹81.675 / 10ml`
);
console.log(
  `50ml:  min=₹${halfPack.minMrpInr} max=₹${halfPack.maxMrpInr.toFixed(2)}`
);
