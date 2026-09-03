import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyGoNoGoFromScore,
  computeGoNoGo,
  goNoGoTone,
  buildGateRationale,
} from "../lib/goNoGo.js";
import {
  categoryCheckCopy,
  formIdeaLabel,
  ideaScaleFromDoc,
  ideaScaleLabel,
} from "../lib/ideaScale.js";
import { rewriteUnmatchedDivisionCopy } from "../lib/sanitizeAiText.js";

function items(done, pending) {
  return [
    ...Array.from({ length: done }, () => ({ status: "done", text: "ok" })),
    ...Array.from({ length: pending }, () => ({ status: "pending", text: "gap" })),
  ];
}

assert.equal(classifyGoNoGoFromScore(0), "NO-GO");
assert.equal(classifyGoNoGoFromScore(60), "NO-GO");
assert.equal(classifyGoNoGoFromScore(61), "WATCH");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(81), "GO");
assert.equal(classifyGoNoGoFromScore(100), "GO");
assert.equal(goNoGoTone("WATCH"), "watch");
assert.equal(goNoGoTone("GO"), "pass");
assert.equal(goNoGoTone("NO-GO"), "fail");

assert.equal(computeGoNoGo({ f1: { items: items(6, 4) } }), "NO-GO");
assert.equal(computeGoNoGo({ f1: { items: items(7, 3) } }), "WATCH");
assert.equal(computeGoNoGo({ f1: { items: items(8, 2) } }), "WATCH");
assert.equal(computeGoNoGo({ f1: { items: items(13, 3) } }), "GO");

assert.equal(ideaScaleLabel(0), "10g");
assert.equal(ideaScaleLabel(1), "10g");
assert.equal(ideaScaleLabel(1.01), "100g");
assert.equal(ideaScaleLabel(12), "100g");
assert.equal(ideaScaleLabel(12.01), "1000g");

assert.equal(ideaScaleFromDoc({}), "10g");
assert.equal(
  ideaScaleFromDoc({
    f5: {
      householdsReachedY3Mn: 1,
      trialRatePct: 10,
      repeatConversionPct: 50,
      purchaseFrequencyYr: 4,
      avgPackValueInr: 50,
    },
  }),
  "10g"
);
assert.equal(
  ideaScaleFromDoc({
    f5: {
      householdsReachedY3Mn: 10,
      trialRatePct: 20,
      repeatConversionPct: 50,
      purchaseFrequencyYr: 6,
      avgPackValueInr: 80,
    },
  }),
  "1000g"
);
assert.equal(ideaScaleFromDoc({ researchFindings: { f1: { categoryTamCr: 8 } } }), "100g");

assert.equal(categoryCheckCopy("Hair care"), "Category: Hair care");
assert.match(categoryCheckCopy(""), /not filled/);
assert.equal(formIdeaLabel({ name: "Herbal cooling hair oil" }), "Herbal cooling hair oil");
assert.equal(formIdeaLabel({ name: "  " }), "");

const rewritten = rewriteUnmatchedDivisionCopy(
  "Division could not be determined automatically — the idea doesn't clearly match any of CavinKare's divisions. Net margin is still open.",
  "Hair care"
);
assert.equal(rewritten, "Category: Hair care. Net margin is still open.");
assert.doesNotMatch(rewritten, /doesn['’]t clearly match/i);
assert.doesNotMatch(rewritten, /CavinKare/i);

const scoring = readFileSync(new URL("../lib/propositionScoring.js", import.meta.url), "utf8");
assert.doesNotMatch(
  scoring,
  /doesn't clearly match any of CavinKare's divisions/
);
assert.match(scoring, /categoryCheckCopy\(category\)/);

const skinChecks = {
  f3: {
    checkLabel: "Below floor",
    items: [
      {
        status: "pending",
        text: "Current margin implies a price above the safe ₹168 ceiling — risks over 10% volume loss",
      },
    ],
  },
  f2: {
    checkLabel: "Evidence missing",
    items: [{ status: "pending", text: "The margin computation hasn't been confirmed by Finance yet" }],
  },
};
const skinArgs = {
  classification: "NO-GO",
  score: { pct: 58 },
  checks: skinChecks,
  ideaName: "Gentle foaming face wash",
  category: "Skin cleanser",
};
const skinA = buildGateRationale(skinArgs);
const skinB = buildGateRationale(skinArgs);
assert.equal(skinA, skinB, "same form inputs must yield the same rationale");
assert.match(skinA, /Gentle foaming face wash/);
assert.match(skinA, /58%/);
assert.match(skinA, /₹168 ceiling/);
assert.doesNotMatch(skinA, /confirmed by Finance/i);
assert.doesNotMatch(skinA, /Beyond that hard blocker/);
assert.doesNotMatch(skinA, /purchase-decision attribute/);
assert.doesNotMatch(skinA, /Category: Skin cleanser should not advance/);
assert.doesNotMatch(skinA, /written responses to each threat/);

const oilA = buildGateRationale({
  classification: "NO-GO",
  score: { pct: 50 },
  checks: {
    f2: {
      checkLabel: "Below floor",
      items: [
        {
          status: "pending",
          text: "Net margin 25% is below the 50% floor (v4, non-negotiable)",
        },
      ],
    },
  },
  ideaName: "Cooling herbal hair oil",
  category: "Hair oils",
});
assert.match(oilA, /Cooling herbal hair oil/);
assert.match(oilA, /Net margin 25%/);
assert.notEqual(oilA, skinA, "different form numbers must not share the same paragraph");

const gateSrc = readFileSync(new URL("../lib/propositionGateApi.js", import.meta.url), "utf8");
assert.match(gateSrc, /buildGateRationale/);
assert.doesNotMatch(gateSrc, /generateFilterNarratives/);
assert.doesNotMatch(gateSrc, /write a 2-3 sentence plain-language read/);

console.log("part56 ok");
