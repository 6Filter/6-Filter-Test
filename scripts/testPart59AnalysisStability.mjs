import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gateInputKey, shouldReuseAnalysis } from "../lib/analysisStability.js";
import { ideaScaleFromDoc } from "../lib/ideaScale.js";

const hairOil = {
  name: "Oil with the herbal stick inside the pack",
  category: "Hair Oils",
  ideaDescription: "herbal stick",
  division: "Personal Care",
  f1: { declaredAttribute: "cooling" },
  f2: { mrpInr: 121, netMarginAtScale: 22 },
  f3: {},
  f4: {},
  f5: {},
};

const key1 = gateInputKey(hairOil);
const key2 = gateInputKey({ ...hairOil, f2: { ...hairOil.f2 } });
assert.equal(key1, key2, "key order must not change the fingerprint");

assert.notEqual(
  gateInputKey(hairOil),
  gateInputKey({ ...hairOil, f2: { ...hairOil.f2, mrpInr: 199 } }),
  "Filter 2 edits must re-open the gate"
);

const existing = { classification: "WATCH", score: { pct: 67 }, ideaScale: "10g" };
assert.equal(
  shouldReuseAnalysis({
    existingGoNoGo: existing,
    previousGateKey: key1,
    nextGateKey: key1,
  }),
  true
);
assert.equal(
  shouldReuseAnalysis({
    existingGoNoGo: existing,
    researchAlreadyRan: true,
    previousGateKey: key1,
    nextGateKey: gateInputKey({ ...hairOil, f2: { ...hairOil.f2, mrpInr: 199 } }),
  }),
  false
);
assert.equal(
  shouldReuseAnalysis({
    existingGoNoGo: existing,
    forceResearch: true,
    researchAlreadyRan: true,
    previousGateKey: key1,
    nextGateKey: key1,
  }),
  false
);
assert.equal(
  shouldReuseAnalysis({
    existingGoNoGo: existing,
    ideaChanged: true,
    researchAlreadyRan: true,
    previousGateKey: key1,
    nextGateKey: key1,
  }),
  false
);
assert.equal(
  shouldReuseAnalysis({
    existingGoNoGo: existing,
    researchAlreadyRan: true,
    previousGateKey: "",
    nextGateKey: key1,
  }),
  false
);

assert.equal(
  ideaScaleFromDoc({
    f5: {},
    researchFindings: { f1: { categoryTamCr: 14000 } },
  }),
  "10g"
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /shouldReuseAnalysis/);
assert.match(formSrc, /result\.researchRan/);
assert.match(formSrc, /!initial\?\.researchRunAt/);
assert.match(formSrc, /if \(!goNoGo\?\.classification\) \{\s*const preview = applyLocalGate/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /skipDerivedAutoFill/);
assert.match(apiSrc, /researchRan: Boolean\(shouldRunResearch\)/);

const gateSrc = readFileSync(new URL("../lib/propositionGateApi.js", import.meta.url), "utf8");
assert.match(gateSrc, /shouldReuseAnalysis/);

console.log("PASS Part 59 same idea keeps score and grammage on Submit");
