import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF3, checkF4 } from "../lib/filterChecks.js";
import { INVALID_MRP_RANGE_COPY, formatRupeeInr, hydrateMarginElasticityMrp } from "../lib/mrpFormula.js";
import { listTechShiftDimensions } from "../lib/techShiftRisk.js";
import { errorFallbackDetails } from "../src/errorFallback.js";

assert.equal(formatRupeeInr(null), "—");
assert.equal(formatRupeeInr(undefined), "—");
assert.equal(formatRupeeInr(""), "—");
assert.equal(formatRupeeInr(NaN), "—");
assert.equal(formatRupeeInr(167), "₹167");
assert.equal(formatRupeeInr(590.4, { digits: 2 }), "₹590.40");

const guarded = hydrateMarginElasticityMrp(
  {
    minMrpInr: 200,
    maxMrpInr: 167,
    recommendedMrpInr: 167,
    mrpAdjustmentNote: "move toward ₹167",
  },
  100
);
assert.equal(guarded.maxMrpInr, null);
assert.equal(formatRupeeInr(guarded.maxMrpInr), "—");
assert.equal(formatRupeeInr(guarded.minMrpInr), "₹200");

const f3NullMax = checkF3(
  { cogsAtScale: 100, netMarginAtScale: 80, mrpInr: 590 },
  {
    marginElasticity: {
      minMrpInr: 200,
      maxMrpInr: null,
      minMarginPct: 50,
      maxMarginPct: null,
      rangeError: INVALID_MRP_RANGE_COPY,
    },
  }
);
assert.equal(f3NullMax.checkLabel, "Evidence missing");
assert.doesNotMatch(JSON.stringify(f3NullMax), /toFixed/);

const f3Missing = checkF3({ cogsAtScale: 100, netMarginAtScale: 80 }, {});
assert.equal(f3Missing.checkLabel, "Cleared");

const f4Missing = checkF4({});
assert.equal(f4Missing.checkLabel, "Cleared");

const f4NullCells = checkF4({
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: null,
      consumptionContextStability: { risk: "Low", reason: "stable" },
    },
    overallRisk: "Low",
  },
});
assert.ok(Array.isArray(f4NullCells.items));
assert.ok(f4NullCells.items.length >= 1);
assert.ok(f4NullCells.items.every((it) => typeof it.text === "string"));

assert.deepEqual(listTechShiftDimensions(null), []);
assert.deepEqual(listTechShiftDimensions(undefined), []);
const listed = listTechShiftDimensions({ functionalCoreStability: null });
assert.equal(listed[0].risk, "unassessed");
assert.equal(listed[0].reason, "—");

const boom = new Error("deliberate test crash");
boom.stack = "Error: deliberate test crash\n    at test";
const details = errorFallbackDetails(boom);
assert.equal(details.message, "deliberate test crash");
assert.match(details.stack, /deliberate test crash/);
assert.equal(errorFallbackDetails(null).message, "Unknown error");
assert.equal(errorFallbackDetails("plain string").message, "plain string");

const boundarySrc = readFileSync(new URL("../src/ErrorBoundary.jsx", import.meta.url), "utf8");
assert.match(boundarySrc, /className="error-fallback"/);
assert.match(boundarySrc, /<details/);
assert.match(boundarySrc, /Technical details \(for reporting this\)/);
assert.match(boundarySrc, /errorFallbackDetails/);
assert.match(boundarySrc, /this\.state\.error/);
assert.match(boundarySrc, /window\.location\.reload/);
assert.match(boundarySrc, /debugError/);

const fallbackMarkup = `${details.message}\n${details.stack}`;
assert.match(fallbackMarkup, /deliberate test crash/);
assert.match(fallbackMarkup, /at test/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /formatRupeeInr\(range\?\.minMrpInr\)/);
assert.match(formSrc, /formatRupeeInr\(range\?\.maxMrpInr\)/);
assert.match(formSrc, /const risk = value && typeof value === "object" \? value : \{\}/);
assert.match(formSrc, /effectiveOverallRisk\(risk\)/);
assert.doesNotMatch(formSrc, /\.maxMrpInr\.toFixed/);
assert.doesNotMatch(formSrc, /\.minMrpInr\.toFixed/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /listTechShiftDimensions/);
assert.doesNotMatch(appSrc, /Object\.entries\(filter\.techShiftRisk/);

const mainSrc = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
assert.match(mainSrc, /from "\.\/ErrorBoundary\.jsx"/);

console.log("PASS Part 56 null-safe F3/F4 render; ErrorBoundary shows real error details");
