import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF4 } from "../lib/filterChecks.js";
import {
  aggregateTechShiftRisk,
  aggregateTechShiftRiskWithResponses,
  effectiveDimensionRisk,
  hasReassessedDimension,
  normalizeTechShiftRisk,
  TECH_SHIFT_DIMENSIONS,
} from "../lib/techShiftRisk.js";
import {
  clampReassessedRisk,
  looksVagueMitigation,
  reassessF4WithResponses,
  reassessTechShiftDimension,
} from "../lib/filters/reassessTechShift.js";
import { RESEARCH_SCHEMA_VERSION } from "../lib/researchCache.js";

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

const CHILI_RESPONSE =
  "signed cryogenic grinding capacity with Synthite Industries, effective Q3 2026";
const CHILI_FINDING = {
  risk: "High",
  reason: "Chili powder milling is exposed to cryogenic grinding scale-up that CavinKare does not currently have",
};

assert.equal(looksVagueMitigation("we'll handle it"), true);
assert.equal(looksVagueMitigation("we will address this in due course and it is not a concern for us"), true);
assert.equal(looksVagueMitigation(CHILI_RESPONSE), false);

assert.equal(clampReassessedRisk("High", "Low", { verified: true }), "Low");
assert.equal(clampReassessedRisk("High", "Low", { verified: false }), "Medium");
assert.equal(clampReassessedRisk("Medium", "Low", { verified: false }), "Medium");
assert.equal(clampReassessedRisk("High", "Low", { vague: true }), "High");
assert.equal(clampReassessedRisk("High", "High", { verified: true }), "High");

const vague = await reassessTechShiftDimension({
  dimensionKey: "manufacturingDisruptionRisk",
  originalFinding: CHILI_FINDING,
  userResponse: "we'll handle it",
  callJudgment: async () => {
    throw new Error("vague responses must not call the judge");
  },
});
assert.equal(vague.reassessedRisk, "High");
assert.equal(vague.skipped, "vague");
assert.match(vague.reassessedReason, /too vague/i);

const chili = await reassessTechShiftDimension({
  dimensionKey: "manufacturingDisruptionRisk",
  originalFinding: CHILI_FINDING,
  userResponse: CHILI_RESPONSE,
  callJudgment: async () =>
    JSON.stringify({
      reassessedRisk: "Medium",
      reassessedReason: "Named supplier contract with a dated capacity start can lower manufacturing disruption one level.",
      verified: true,
    }),
});
assert.equal(chili.reassessedRisk, "Medium");
assert.match(chili.reassessedReason, /supplier|contract|capacity/i);

const unverified = await reassessTechShiftDimension({
  dimensionKey: "manufacturingDisruptionRisk",
  originalFinding: CHILI_FINDING,
  userResponse: "signed cryogenic grinding capacity with Acme Fictional Mills Pvt Ltd, effective Q3 2026",
  callJudgment: async () =>
    JSON.stringify({
      reassessedRisk: "Low",
      reassessedReason: "Asserted-not-verified — cannot confirm the named mill via search.",
      verified: false,
    }),
});
assert.equal(unverified.reassessedRisk, "Medium", "unverified specific claim may drop one level, never to Low");
assert.notEqual(unverified.reassessedRisk, "Low");

const twoHigh = dims(["High", "High", "Low", "Low", "Low", "Low", "Low"]);
assert.equal(aggregateTechShiftRisk(twoHigh), "High");
const afterOneResponse = {
  ...twoHigh,
  functionalCoreStability: {
    ...twoHigh.functionalCoreStability,
    userResponse: CHILI_RESPONSE,
    reassessedRisk: "Medium",
    reassessedReason: "Contract moves this to Medium",
  },
};
assert.equal(aggregateTechShiftRisk(afterOneResponse), "High", "original ratings still aggregate to High");
assert.equal(aggregateTechShiftRiskWithResponses(afterOneResponse), "Medium");
assert.equal(effectiveDimensionRisk(afterOneResponse.functionalCoreStability), "Medium");
assert.equal(afterOneResponse.functionalCoreStability.risk, "High", "original risk must not be overwritten");
assert.equal(hasReassessedDimension(afterOneResponse), true);

const checked = checkF4({ techShiftRisk: { dimensions: afterOneResponse, overallRisk: "High" } });
assert.equal(checked.checkLabel, "Evidence missing", "overall must recompute from reassessed ratings");
assert.match(checked.items[0].text, /original High/);
assert.match(checked.items[0].text, /After response: Medium/);

const stillHigh = checkF4({
  techShiftRisk: {
    dimensions: {
      ...twoHigh,
      functionalCoreStability: {
        ...twoHigh.functionalCoreStability,
        userResponse: "we'll handle it",
        reassessedRisk: "High",
        reassessedReason: "too vague to move the rating",
      },
    },
  },
});
assert.equal(stillHigh.checkLabel, "Below floor");

const preserved = normalizeTechShiftRisk({ dimensions: afterOneResponse });
assert.equal(preserved.dimensions.functionalCoreStability.risk, "High");
assert.equal(preserved.dimensions.functionalCoreStability.reassessedRisk, "Medium");
assert.equal(preserved.overallRisk, "Medium");

const batch = await reassessF4WithResponses({
  techShiftRisk: {
    dimensions: {
      ...twoHigh,
      functionalCoreStability: {
        risk: "High",
        reason: CHILI_FINDING.reason,
        userResponse: CHILI_RESPONSE,
      },
    },
  },
  callJudgment: async () =>
    JSON.stringify({
      reassessedRisk: "Low",
      reassessedReason: "Verified named contract.",
      verified: true,
    }),
});
assert.equal(batch.dimensions.functionalCoreStability.risk, "High");
assert.equal(batch.dimensions.functionalCoreStability.reassessedRisk, "Low");
assert.equal(batch.dimensions.consumptionContextStability.reassessedRisk, undefined);
assert.equal(batch.overallRisk, "Medium");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /className="dimension-response"/);
assert.match(formSrc, /level === "Medium" \|\| level === "High"/);
assert.match(formSrc, /Original: \{normalizeRiskLevel\(d\.risk\) \|\| d\.risk\} risk/);
assert.match(formSrc, /After response: \{d\.reassessedRisk\} risk/);
assert.match(formSrc, /Re-assess Filter 4 with responses/);
assert.match(formSrc, /\/reassess-f4/);
assert.match(formSrc, /f4-dimension-editor/);

const judgeSrc = readFileSync(new URL("../lib/filters/reassessTechShift.js", import.meta.url), "utf8");
assert.doesNotMatch(judgeSrc, /researchCache|runFilter4|saveResearchCache|getResearchCache/);
assert.match(judgeSrc, /researchRan: false/);
assert.match(judgeSrc, /do not accept it because it exists/i);

const routerSrc = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
assert.match(routerSrc, /reassess-f4/);

assert.match(
  RESEARCH_SCHEMA_VERSION,
  /^f1-benchmark/,
  "F4 response judgment must not bump the F1–3 research cache schema family"
);

console.log("PASS Part 63 F4 responses are judged, not accepted");
