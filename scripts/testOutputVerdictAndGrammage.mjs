import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLocalGate, computeGoNoGo, classifyGoNoGoFromScore } from "../lib/goNoGo.js";
import { ideaSizeForResult, ideaScaleFromDoc } from "../lib/ideaScale.js";

const verdicts = new Set(["GO", "NO-GO", "WATCH"]);

assert.equal(classifyGoNoGoFromScore(0), "NO-GO");
assert.ok(verdicts.has(classifyGoNoGoFromScore(40)));
assert.ok(verdicts.has(classifyGoNoGoFromScore(70)));
assert.ok(verdicts.has(classifyGoNoGoFromScore(90)));

const floorFail = computeGoNoGo({
  f1: { checkLabel: "Below floor", items: [] },
  f2: { checkLabel: "Evidence complete", items: [] },
  f3: { checkLabel: "Evidence complete", items: [] },
  f4: { checkLabel: "Evidence complete", items: [] },
});
assert.equal(floorFail, "NO-GO");

const emptyDoc = {
  name: "Logic verify herbal hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for Indian households.",
};
const emptyGate = applyLocalGate(emptyDoc);
assert.ok(verdicts.has(emptyGate.classification), "empty idea still gets a verdict");
assert.ok(["10g", "100g", "1000g"].includes(emptyGate.ideaScale));
assert.ok(String(emptyGate.rationale || "").length > 10, "verdict rationale must be generated");

const sizedDoc = {
  ...emptyDoc,
  goNoGo: { classification: emptyGate.classification },
  researchFindings: {
    f5: {
      householdsReachedY3Mn: 0.4,
      trialRatePct: 20,
      repeatConversionPct: 25,
      purchaseFrequencyYr: 4,
      avgPackValueInr: 80,
      computedRevenue: 0.64,
    },
  },
};
const badge = ideaSizeForResult(sizedDoc);
assert.ok(badge, "output badge must exist");
assert.equal(badge.tier, "10g");
assert.match(String(badge.label || ""), /Cr|business|₹/i);
assert.equal(ideaScaleFromDoc(sizedDoc), badge.tier);

const stored = ideaSizeForResult({
  goNoGo: { classification: "WATCH", ideaScale: "100g" },
});
assert.equal(stored.tier, "100g");
assert.equal(stored.provisional, true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(
  formSrc,
  /initial\?\.goNoGo\?\.classification \? "goNoGoResult" : "propositionForm"/
);
assert.match(formSrc, /result\.classification/);
assert.match(formSrc, /sizeTier\.tier} · \{sizeTier\.label/);
assert.match(formSrc, /gonogo-classification/);
assert.match(formSrc, /gonogo-scale-chip idea-size-badge/);
assert.match(formSrc, /data-view="goNoGoResult"/);

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /ideaSizeForResult/);
assert.match(logSrc, /log-scale-chip/);
assert.match(logSrc, /<th>Scale<\/th>/);

console.log(
  `PASS output verdict + grammage · empty=${emptyGate.classification}/${emptyGate.ideaScale} · sized=${badge.tier}`
);
