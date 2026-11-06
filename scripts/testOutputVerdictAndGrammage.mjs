import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLocalGate, computeGoNoGo, classifyGoNoGoFromScore } from "../lib/goNoGo.js";
import { ideaSizeForResult, ideaScaleFromDoc } from "../lib/ideaScale.js";

const verdicts = new Set(["GO", "NO-GO", "WATCH", "INCOMPLETE"]);
const bandVerdicts = new Set(["GO", "NO-GO", "WATCH"]);

assert.equal(classifyGoNoGoFromScore(0), "NO-GO");
assert.ok(bandVerdicts.has(classifyGoNoGoFromScore(40)));
assert.ok(bandVerdicts.has(classifyGoNoGoFromScore(70)));
assert.ok(bandVerdicts.has(classifyGoNoGoFromScore(90)));

// Part 138 D49 — the F4 overall-High floor is the only hard stop left.
const floorFail = computeGoNoGo({
  f1: { checkLabel: "Evidence complete", items: [] },
  f2: { checkLabel: "Evidence complete", items: [] },
  f3: { checkLabel: "Evidence complete", items: [] },
  f4: { checkLabel: "Below floor", items: [] },
});
assert.equal(floorFail, "NO-GO");

const emptyDoc = {
  name: "Logic verify herbal hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for Indian households.",
};
const emptyGate = applyLocalGate(emptyDoc);
assert.ok(verdicts.has(emptyGate.classification), "empty idea still gets a verdict");
assert.equal(emptyGate.classification, "INCOMPLETE", "empty idea is INCOMPLETE under v4.2");
assert.equal(emptyGate.ideaScale, undefined, "INCOMPLETE ideas do not carry a gram badge");
assert.ok(String(emptyGate.rationale || "").length > 10, "verdict rationale must be generated");

const f5Findings = {
  householdsReachedY3Mn: 0.4,
  trialRatePct: 20,
  repeatConversionPct: 25,
  purchaseFrequencyYr: 4,
  avgPackValueInr: 80,
  computedRevenue: 0.64,
};
assert.equal(
  ideaSizeForResult({
    ...emptyDoc,
    goNoGo: { classification: "INCOMPLETE" },
    researchFindings: { f5: f5Findings },
  }),
  null,
  "INCOMPLETE suppresses gram badge even when F5 revenue exists"
);

const sizedDoc = {
  ...emptyDoc,
  goNoGo: { classification: "WATCH" },
  researchFindings: { f5: f5Findings },
};
const badge = ideaSizeForResult(sizedDoc);
assert.ok(badge, "output badge must exist for complete banded ideas");
assert.equal(badge.tier, "10g");
assert.match(String(badge.label || ""), /Cr|business|₹/i);
assert.equal(ideaScaleFromDoc(sizedDoc), badge.tier);

const stored = ideaSizeForResult({
  goNoGo: { classification: "WATCH", ideaScale: "100g" },
});
assert.equal(stored.tier, "100g");
assert.equal(stored.provisional, true);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /preferOutputView\(initial\) \? "goNoGoResult" : "propositionForm"/);
assert.match(formSrc, /View entered inputs/);
assert.match(formSrc, /View GO\/NO-GO output/);
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
