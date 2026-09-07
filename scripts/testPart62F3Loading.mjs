import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF3 } from "../lib/filterChecks.js";
import { filterCheckScore } from "../lib/goNoGo.js";
import { isMarginElasticityUnfilled } from "../lib/mrpFormula.js";

const empty = checkF3({ netMarginAtScale: 40 }, {});
assert.equal(empty.checkLabel, "Not yet run");
assert.deepEqual(empty.items, []);
assert.equal(filterCheckScore(empty).total, 0, "empty F3 still must not score as a gap");

const pctOnly = checkF3(
  { cogsAtScale: 50, netMarginAtScale: 40 },
  { marginElasticity: { minMarginPct: 18, maxMarginPct: 55 } }
);
assert.equal(
  pctOnly.checkLabel,
  "Evidence missing",
  "Check: Cleared with empty Min/Max MRP was a real sequencing bug — % fallback must not pass"
);
assert.equal(isMarginElasticityUnfilled({ minMarginPct: 18, maxMarginPct: 55 }), true);

const rupeeRange = {
  minMarginPct: 18,
  maxMarginPct: 55,
  minMrpInr: 61,
  maxMrpInr: 111,
};
assert.equal(
  checkF3({ netMarginAtScale: 40, mrpInr: 80 }, { marginElasticity: rupeeRange }).checkLabel,
  "Cleared"
);
assert.equal(
  checkF3({ netMarginAtScale: 80, mrpInr: 200 }, { marginElasticity: rupeeRange }).checkLabel,
  "Below floor"
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /marginElasticityLoading/);
assert.match(formSrc, /Calculating safe MRP range/);
assert.match(formSrc, /No range calculated yet — Submit to run the AI first pass/);
assert.match(formSrc, /className="me-loading"/);
assert.match(formSrc, /disabled=\{saving \|\| readingGoNoGo \|\| !canSubmit \|\| marginElasticityLoading\}/);
assert.match(formSrc, /if \(saving \|\| f3Filling \|\| f4Reassessing\) return/);
assert.match(formSrc, /f3CheckPending \? "Calculating…" : check\.checkLabel/);

console.log("PASS Part 62 F3 loading state and empty-range must not Clear");
