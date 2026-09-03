import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF4 } from "../lib/filterChecks.js";
import { f4HasEnough, isFilterUnlocked } from "../lib/filterUnlock.js";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { buildSuggestions } from "../lib/propositionAiFirstPass.js";
import { resolveFilter4, formatObsolescenceVerdict } from "../lib/filters/filter4TechShift.js";
import {
  aggregateTechShiftRisk,
  effectiveOverallRisk,
  normalizeTechShiftRisk,
  TECH_SHIFT_DIMENSIONS,
} from "../lib/techShiftRisk.js";
import { fingerprintResearchInput } from "../lib/researchCache.js";

function dim(risk, reason = `${risk} reason`) {
  return { risk, reason };
}

function dims(levels) {
  const out = {};
  TECH_SHIFT_DIMENSIONS.forEach((key, i) => {
    out[key] = dim(levels[i] || "Low", `${key} ${levels[i] || "Low"}`);
  });
  return out;
}

const allLow = dims(["Low", "Low", "Low", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(allLow), "Low");

const oneHigh = dims(["High", "Low", "Low", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(oneHigh), "Medium");

const twoHigh = dims(["High", "High", "Low", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(twoHigh), "High");

const threeMedium = dims(["Medium", "Medium", "Medium", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(threeMedium), "Medium");

const twoMedium = dims(["Medium", "Medium", "Low", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(twoMedium), "Low");

const normalized = normalizeTechShiftRisk({
  dimensions: oneHigh,
  overallRisk: "High",
  sources: [{ title: "Example", url: "https://example.com" }],
});
assert.equal(normalized.overallRisk, "Medium", "must ignore the model's own overallRisk");
assert.equal(normalized.dimensions.functionalCoreStability.risk, "High");

const again = normalizeTechShiftRisk({ dimensions: oneHigh, overallRisk: "Low" });
assert.equal(again.overallRisk, normalized.overallRisk, "same dimensions → same overall");
assert.deepEqual(again.dimensions, normalized.dimensions);

const missing = checkF4({});
assert.equal(missing.checkLabel, "Cleared");
assert.match(missing.items[0].text, /not yet assessed/);
assert.equal(missing.items[0].formAdmin, true);
assert.equal(f4HasEnough({}), false);

const highCheck = checkF4({ techShiftRisk: { dimensions: twoHigh, overallRisk: "High" } });
assert.equal(highCheck.checkLabel, "Below floor");
assert.equal(highCheck.items.length, 7);
assert.ok(highCheck.items.every((it) => it.text.includes("risk — ")));

const mediumCheck = checkF4({ techShiftRisk: { dimensions: oneHigh, overallRisk: "Medium" } });
assert.equal(mediumCheck.checkLabel, "Evidence missing");

const lowCheck = checkF4({ techShiftRisk: { dimensions: allLow, overallRisk: "Low" } });
assert.equal(lowCheck.checkLabel, "Cleared");
assert.ok(lowCheck.items.every((it) => it.status === "done"));

const ignoredOverride = checkF4({
  techShiftRisk: {
    dimensions: twoHigh,
    overallRisk: "High",
    overallRiskOverride: "Low",
  },
});
assert.equal(ignoredOverride.checkLabel, "Below floor", "AI aggregate wins — leftover override is ignored");
assert.equal(ignoredOverride.items.length, 7, "dimensions stay visible");
assert.ok(ignoredOverride.items.some((it) => /High risk/.test(it.text)));

const unlocked = f4HasEnough({ techShiftRisk: { dimensions: allLow } });
assert.equal(unlocked, true);
assert.equal(
  isFilterUnlocked("proof-gate", {
    f1: {
      declaredAttribute: "softness",
      benchmark: "Parachute Advansed 200ml",
      declaredGap: 2.2,
      growthRoute: "penetration",
      growthArgument: "category growing",
    },
    f2: { cogsAtScale: 40, netMarginAtScale: 22 },
    f3: { marginElasticity: { maxMarginPct: 35 } },
    f4: { techShiftRisk: { dimensions: allLow } },
  }),
  true
);

const f4Spec = SIX_FILTERS_FORM.find((s) => s.key === "f4");
assert.equal(f4Spec.fields.length, 1);
assert.equal(f4Spec.fields[0].key, "techShiftRisk");
assert.equal(f4Spec.fields[0].type, "computed-risk");
for (const banned of ["formatTrajectory", "threatRegister", "threatsAnswered", "channelShiftExposure"]) {
  assert.equal(f4Spec.fields.some((f) => f.key === banned), false, `${banned} must leave the schema`);
}

const checksSrc = readFileSync(new URL("../lib/filterChecks.js", import.meta.url), "utf8");
const unlockSrc = readFileSync(new URL("../lib/filterUnlock.js", import.meta.url), "utf8");
for (const banned of ["formatTrajectory", "threatRegister", "threatsAnswered", "channelShiftExposure"]) {
  assert.equal(checksSrc.includes(banned), false, `checkF4 must not mention ${banned}`);
  assert.equal(unlockSrc.includes(banned), false, `unlock must not mention ${banned}`);
}

const resolved = resolveFilter4({
  dimensions: twoHigh,
  overallRisk: "Low",
  sources: [{ title: "Patent filing", url: "https://example.com/patent" }],
});
assert.equal(resolved.overallRisk, "High");
assert.equal(resolved.techShiftRisk.overallRisk, "High");
assert.equal(resolved.verdict, "FAIL");
assert.match(resolved.obsolescenceVerdict, /structurally exposed on multiple fronts/i);

assert.match(formatObsolescenceVerdict({ overallRisk: "High", dimensions: twoHigh }), /structurally exposed on multiple fronts/i);
assert.match(formatObsolescenceVerdict({ overallRisk: "Medium", dimensions: oneHigh }), /one real vulnerability/i);
assert.match(formatObsolescenceVerdict({ overallRisk: "Low", dimensions: allLow }), /no material structural exposure/i);
assert.equal(formatObsolescenceVerdict({ overallRisk: "" }), null);

const suggestions = buildSuggestions(
  { generalCategory: "Hair oil" },
  { dimensions: oneHigh, sources: [{ title: "News", url: "https://example.com" }] }
);
assert.ok(suggestions.f4.techShiftRisk?.dimensions);
assert.equal(suggestions.f4.techShiftRisk.overallRisk, "Medium");
assert.equal(suggestions.f4.formatTrajectory, undefined);
assert.equal(suggestions.f4.threatRegister, undefined);

const overrideRisk = normalizeTechShiftRisk({
  dimensions: twoHigh,
  overallRiskOverride: "Low",
});
assert.equal(overrideRisk.overallRisk, "High", "computed overall stays deterministic");
assert.equal(effectiveOverallRisk(overrideRisk), "High", "leftover override must not change the AI overall");
assert.equal(overrideRisk.overallRiskOverride, undefined);
assert.equal(overrideRisk.dimensions.functionalCoreStability.risk, "High");

const hashA = fingerprintResearchInput({
  name: "Cooling oil",
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
});
const hashB = fingerprintResearchInput({
  name: "Cooling oil",
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
});
assert.equal(hashA, hashB, "identical ideas must share the research-input hash");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /computed-risk/);
assert.doesNotMatch(formSrc, /Use AI assessment/);
assert.doesNotMatch(formSrc, /Override: Low/);
assert.doesNotMatch(formSrc, /Overall risk override/);
assert.match(formSrc, /f4-eval-points/);
assert.match(formSrc, /DIMENSION_LABELS\[key\]/);
assert.match(formSrc, /f4-analysis-dims/);
assert.match(formSrc, /spec\.key !== "f4"/);
assert.doesNotMatch(formSrc, /tech-shift-dim-reason/);
assert.doesNotMatch(formSrc, /tech-shift-dims/);

console.log("PASS Part 52 F4 structural obsolescence — seven dimensions, deterministic aggregate, AI overall only");
