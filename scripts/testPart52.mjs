import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hydrateMarginElasticityMrp,
  isMarginElasticityUnfilled,
  looksLikePercentCopiedAsMrp,
  seedMarginElasticityFromAi,
} from "../lib/mrpFormula.js";
import { f3HasEnough } from "../lib/filterUnlock.js";

const leftover = { minMarginPct: 5, maxMarginPct: 10, minMrpInr: 5, maxMrpInr: 10 };
assert.equal(looksLikePercentCopiedAsMrp(leftover), true);
assert.equal(isMarginElasticityUnfilled(leftover), true);
assert.equal(
  f3HasEnough({ marginElasticity: leftover }),
  true,
  "Part 135 treats any stored min/max ₹ pair as legacy unlock even when values look like old % copies"
);
assert.equal(
  f3HasEnough({}, { cogsAtScale: 80, netMarginAtScale: 40, gstRatePct: 18 }),
  true,
  "resolvable Filter 2 MRP unlocks F3-enough"
);

const hydratedLeftover = hydrateMarginElasticityMrp(leftover, 80);
assert.equal(hydratedLeftover.minMrpInr, null, "must not display leftover 5 as ₹5");
assert.equal(hydratedLeftover.maxMrpInr, null, "must not display leftover 10 as ₹10");

const aiRange = {
  minMarginPct: 20,
  maxMarginPct: 38,
  minMrpInr: 100,
  maxMrpInr: 161,
  aiSourced: true,
};
assert.equal(isMarginElasticityUnfilled(aiRange), false);

const seeded = seedMarginElasticityFromAi(leftover, aiRange, 80);
assert.equal(seeded.minMrpInr, 100, "Min MRP auto-fills from AI");
assert.equal(seeded.maxMrpInr, 161, "Max MRP auto-fills from AI");

const keepHuman = seedMarginElasticityFromAi(
  { minMarginPct: 20, maxMarginPct: 40, minMrpInr: 90, maxMrpInr: 140 },
  aiRange,
  80
);
assert.equal(keepHuman.minMrpInr, 90, "must not overwrite a human rupee band");
assert.equal(keepHuman.maxMrpInr, 140);

const percentsOnly = seedMarginElasticityFromAi(
  { minMarginPct: 20, maxMarginPct: 40 },
  null,
  80
);
assert.equal(percentsOnly.minMrpInr, 100);
assert.ok(Math.abs(percentsOnly.maxMrpInr - 133.333) < 0.01);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /seedMarginElasticityFromAi/);
assert.match(formSrc, /isMarginElasticityUnfilled/);
assert.match(formSrc, /priceResilienceNote|10% volume-loss/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /fillF3MrpIfNeeded/);
assert.match(apiSrc, /cachedSuggestionsFor/);

console.log("PASS Part 52 legacy margin helpers; F3 unlock from F2 MRP or stored ₹ band");
