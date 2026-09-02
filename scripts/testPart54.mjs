import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyProductGstKind, gstRateUnfilled, resolveGstRate } from "../lib/gstRate.js";
import { isMarginElasticityUnfilled } from "../lib/mrpFormula.js";

const hairOil = resolveGstRate({
  name: "Cooling herbal hair oil",
  category: "Hair care",
  ideaDescription: "A cooling herbal hair oil for daily use",
});
assert.equal(hairOil.gstRatePct, 18, "hair oil GST should be 18%");
assert.match(hairOil.gstBasis, /Analysed by AI/);
assert.equal(classifyProductGstKind({ name: "Cooling herbal hair oil" }), "other");

const chips = resolveGstRate({
  name: "Masala potato chips",
  category: "Snacks",
  ideaDescription: "Packaged namkeen chips",
});
assert.equal(chips.gstRatePct, 18, "packaged snacks GST should be 18%");
assert.equal(classifyProductGstKind({ name: "Masala potato chips", ideaDescription: "namkeen chips" }), "packaged-snack");

const atta = resolveGstRate({
  name: "Fortified atta",
  category: "Staples",
  ideaDescription: "Wheat flour atta for rotis",
});
assert.equal(atta.gstRatePct, 5, "atta GST should be 5%");
assert.equal(classifyProductGstKind({ ideaDescription: "wheat flour atta" }), "staple-food");

assert.equal(gstRateUnfilled(null), true);
assert.equal(gstRateUnfilled(""), true);
assert.equal(gstRateUnfilled(18), false);
assert.equal(gstRateUnfilled("5"), false);

assert.equal(
  isMarginElasticityUnfilled({ minMarginPct: 5, maxMarginPct: 10, minMrpInr: 5, maxMrpInr: 10 }),
  true
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /resolveGstRate/);
assert.match(formSrc, /gstTouchedByHuman/);
assert.match(formSrc, /\/auto-fill/);
assert.match(formSrc, /f3AutoFillRequested/);
assert.match(formSrc, /Number\.isFinite\(minR\) && minR > 0/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /handlePropositionAutoFill/);
assert.match(apiSrc, /fillGstIfNeeded/);
assert.match(apiSrc, /applyDerivedAutoFill/);
assert.match(apiSrc, /payloadForOwnershipCheck/);

const routerSrc = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
assert.match(routerSrc, /auto-fill/);

console.log("PASS Part 54 GST from product idea + F3 auto-fill wiring");
