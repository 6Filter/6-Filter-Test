import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF3 } from "../lib/filterChecks.js";
import { filterCheckScore } from "../lib/goNoGo.js";

const empty = checkF3({}, {});
assert.equal(empty.checkLabel, "Not yet run");
assert.deepEqual(empty.items, []);
assert.equal(filterCheckScore(empty).total, 0, "empty F3 still must not score as a gap");

const noResearch = checkF3(
  { cogsAtScale: 50, netMarginAtScale: 40, gstRatePct: 18 },
  {}
);
assert.equal(noResearch.checkLabel, "Marked down", "price without priceEvents is mark-down");
assert.notEqual(noResearch.checkLabel, "Below floor");

assert.equal(
  checkF3(
    { cogsAtScale: 50, netMarginAtScale: 40, gstRatePct: 18 },
    {},
    { priceEvents: { annualIncreasePct: 0, events: [] } }
  ).checkLabel,
  "Cleared"
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /marginElasticityLoading/);
assert.match(formSrc, /price-resilience|data-f3-resilience|10% volume-loss/);
assert.match(formSrc, /researches a cited inflation-cover|assessed when you Submit/);
assert.match(formSrc, /disabled=\{saving \|\| readingGoNoGo \|\| marginElasticityLoading\}/);
assert.match(formSrc, /Enter required values before Submit|Enter this required value before Submit/);

console.log("PASS Part 62 F3 cliff loading — no band Clear without research");
