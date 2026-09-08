import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeIdeaRevenueCr,
  ideaScaleFromDoc,
  ideaSizeForResult,
  ideaSizeFromF5,
} from "../lib/ideaScale.js";
import { classifyIdeaWeight } from "../lib/scoring.js";

const scaleSrc = readFileSync(new URL("../lib/ideaScale.js", import.meta.url), "utf8");
assert.match(scaleSrc, /LOCKED/);
assert.match(scaleSrc, /const cr = ideaBusinessCr\(/);
assert.match(scaleSrc, /const sized = ideaSizeForResult\(doc\)/);
assert.doesNotMatch(
  scaleSrc,
  /numOrNull\(f5\.computedRevenue\) \?\?/,
  "badge must not prefer a stored rupee figure over the live five-factor product"
);
const exportSrc = readFileSync(new URL("../lib/logExport.js", import.meta.url), "utf8");
assert.match(exportSrc, /ideaSizeForResult/);

const staleVsLive = {
  householdsReachedY3Mn: 0.5,
  trialRatePct: 10,
  repeatConversionPct: 50,
  purchaseFrequencyYr: 4,
  avgPackValueInr: 50,
  computedRevenue: 25,
};

const liveCr = computeIdeaRevenueCr({ ...staleVsLive, computedRevenue: null });
assert.equal(liveCr, 0.5);

const fromDoc = ideaScaleFromDoc({ f5: staleVsLive });
const badge = ideaSizeForResult({ f5: staleVsLive });
const fromF5 = ideaSizeFromF5(staleVsLive);

assert.equal(fromDoc, "10g", "gate/log scale must follow the five live factors");
assert.equal(badge.tier, "10g", "results badge must follow the same live factors");
assert.equal(fromF5.tier, "10g", "F5 helper must not keep a stale stored rupee figure");
assert.equal(fromF5.computedRevenueCr, 0.5);
assert.match(fromF5.derivation, /₹0\.5 Cr/);
assert.equal(fromDoc, badge.tier);
assert.equal(badge.tier, fromF5.tier);

const atOneCr = { computedRevenue: 1 };
assert.equal(ideaScaleFromDoc({ f5: atOneCr }), "10g");
assert.equal(ideaSizeForResult({ f5: atOneCr }).tier, "10g");

const justOverOne = { computedRevenue: 1.01 };
assert.equal(ideaScaleFromDoc({ f5: justOverOne }), "100g");
assert.equal(ideaSizeForResult({ f5: justOverOne }).tier, "100g");

const atTwelve = { computedRevenue: 12 };
assert.equal(ideaScaleFromDoc({ f5: atTwelve }), "100g");
assert.equal(ideaSizeForResult({ f5: atTwelve }).tier, "100g");

const justOverTwelve = { computedRevenue: 12.01 };
assert.equal(ideaScaleFromDoc({ f5: justOverTwelve }), "1000g");
assert.equal(ideaSizeForResult({ f5: justOverTwelve }).tier, "1000g");

assert.equal(ideaSizeFromF5({ ...staleVsLive, computedRevenue: null }), null);

assert.equal(classifyIdeaWeight(0.5), "10g");
assert.equal(classifyIdeaWeight(1), "10g");
assert.equal(classifyIdeaWeight(12), "100g");
assert.equal(classifyIdeaWeight(12.01), "1000g");

console.log("idea scale: badge, gate, and F5 helper now agree on the live year-3 figure");
