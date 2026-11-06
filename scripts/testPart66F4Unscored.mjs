import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF4 } from "../lib/filterChecks.js";
import { supportedF4Findings } from "./f4TestHelpers.mjs";
import { previewAdvisoryChecks } from "../lib/goNoGo.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /import \{ runFilter4 \} from "\.\/filters\/filter4TechShift\.js"/);

assert.match(formSrc, /data-f4-state=\{rated\.length === TECH_SHIFT_DIMENSIONS\.length \? "scored" : "editable"\}/);
assert.match(formSrc, /className="f4-dimension-editor"/);
assert.match(formSrc, /Select risk/);
assert.match(
  formSrc,
  /Rate all seven points \(Low \/ Medium \/ High\)\. Optional: use Re-run this estimate for an AI draft/
);
assert.match(formSrc, /level === "Medium" \|\| level === "High"/);
assert.match(formSrc, /className="dimension-response"/);

const empty = checkF4({});
assert.equal(empty.checkLabel, "Not yet run");
assert.notEqual(empty.checkLabel, "Cleared");
assert.deepEqual(empty.items, []);

const emptyDims = checkF4({ techShiftRisk: { dimensions: {} } });
assert.equal(emptyDims.checkLabel, "Not yet run");

const allLow = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((key) => [key, { risk: "Low", reason: `${key} stable` }])
);
const scoredLow = checkF4({ techShiftRisk: { dimensions: allLow, overallRisk: "Low" } }, supportedF4Findings(allLow));
assert.equal(scoredLow.checkLabel, "Cleared");

const oneHigh = {
  ...allLow,
  functionalCoreStability: { risk: "High", reason: "format declining vs aerosol substitutes" },
};
const scoredHigh = checkF4({ techShiftRisk: { dimensions: oneHigh, overallRisk: "Medium" } });
assert.equal(scoredHigh.checkLabel, "Evidence missing");

const preview = previewAdvisoryChecks({ f4: {} });
assert.equal(preview.f4.checkLabel, "Not yet run");
assert.notEqual(preview.f4.checkLabel, "Cleared");

console.log("PASS Part 66 F4 unscored state is distinct and never Cleared before dimensions exist");
