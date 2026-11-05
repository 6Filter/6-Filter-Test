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
assert.match(formSrc, /priceResilienceNote|10% volume-loss/);
assert.match(formSrc, /assessed when you Submit/);
assert.match(formSrc, /disabled=\{saving \|\| readingGoNoGo \|\| !canSubmit \|\| marginElasticityLoading\}/);

console.log("PASS Part 62 F3 cliff loading — no band Clear without research");
