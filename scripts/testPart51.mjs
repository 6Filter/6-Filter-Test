import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrateMarginElasticityMrp, marginPctFromMrp, withoutPercentSign } from "../lib/mrpFormula.js";
import { mergeProposition, SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { checkF3 } from "../lib/filterChecks.js";

const f3 = SIX_FILTERS_FORM.find((f) => f.key === "f3");
assert.equal(f3.fields.length, 1);
assert.equal(f3.fields[0].key, "plannedAnnualIncreasePct");
assert.equal(f3.fields[0].type, "price-resilience");
assert.match(f3.subtitle, /10% volume-loss/i);
assert.ok(!f3.fields.some((f) => f.key === "marginElasticity" || f.key === "f3RangeOverride"));

const onlyPct = hydrateMarginElasticityMrp({ minMarginPct: 20, maxMarginPct: 40 }, 50);
assert.equal(onlyPct.minMrpInr, 62.5);
assert.ok(Math.abs(onlyPct.maxMrpInr - 83.333333) < 0.01);

const keepCeiling = hydrateMarginElasticityMrp(
  { minMarginPct: 20, maxMarginPct: 40, minMrpInr: 62.5, maxMrpInr: 105 },
  50
);
assert.equal(keepCeiling.maxMrpInr, 105, "must keep the raw ₹ ceiling, not re-derive max from %");

const merged = mergeProposition({
  f2: { cogsAtScale: 50, netMarginAtScale: 30, gstRatePct: 18 },
  f3: { marginElasticity: { minMarginPct: 20, maxMarginPct: 40 } },
});
assert.equal(merged.f3.marginElasticity.minMrpInr, 62.5);
assert.ok(merged.f3.marginElasticity.maxMrpInr > 80);

const check = checkF3(
  { cogsAtScale: 50, netMarginAtScale: 30, gstRatePct: 18 },
  { marginElasticity: merged.f3.marginElasticity },
  { priceEvents: { annualIncreasePct: 0, events: [] } }
);
assert.equal(check.checkLabel, "Cleared");
assert.match(check.items[0].text, /volume|inflation|resilien/i);

assert.equal(withoutPercentSign("capped at 10% volume loss after 5.5% inflation"), "capped at 10 percent volume loss after 5.5 percent inflation");
assert.equal(marginPctFromMrp(50, 62.5), 20);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /price-resilience|data-f3-resilience/);
assert.match(formSrc, /plannedAnnualIncreasePct|10% volume-loss/);
assert.match(formSrc, /spec\.key === "f3"/);

console.log("PASS Part 51 F3 cliff note on form; legacy ₹ helpers still hydrate old ideas");
