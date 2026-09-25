import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gateInputKey,
  isScoredProposition,
  propositionInputsChanged,
  shouldForkLogResubmit,
} from "../lib/analysisStability.js";

const scored = {
  id: "log-1",
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "menthol stick in pack",
  division: "Personal Care",
  researchRunAt: "2026-09-25T05:00:00.000Z",
  goNoGo: { classification: "NO-GO", score: { pct: 64 } },
  f1: { declaredAttribute: "cooling", benchmark: "Indulekha" },
  f2: { cogsAtScale: 22, netMarginAtScale: 50, gstRatePct: 18, mrpInr: 51.92 },
  f3: {},
  f4: {},
  f5: { householdsReachedY3Mn: 2, trialRatePct: 8, repeatConversionPct: 40, purchaseFrequencyYr: 4, avgPackValueInr: 80 },
};

assert.equal(isScoredProposition(scored), true);
assert.equal(isScoredProposition({ id: "draft", name: "x" }), false);
assert.equal(shouldForkLogResubmit(scored, scored), false, "unchanged resubmit stays on the same row");
assert.equal(
  shouldForkLogResubmit(scored, { ...scored, f2: { ...scored.f2, cogsAtScale: 28 } }),
  true,
  "changed COGS from a scored Log row must fork"
);
assert.equal(
  shouldForkLogResubmit(scored, { ...scored, ideaDescription: "menthol stick plus amla" }),
  true,
  "changed idea text from a scored Log row must fork"
);
assert.equal(
  shouldForkLogResubmit({ ...scored, id: "", researchRunAt: null, goNoGo: null }, { ...scored, f2: { ...scored.f2, cogsAtScale: 28 } }),
  false,
  "missing id cannot fork"
);
assert.equal(
  shouldForkLogResubmit({ id: "draft-1", name: "x", ideaDescription: "y" }, { id: "draft-1", name: "x", ideaDescription: "changed" }),
  false,
  "unscored draft keeps the same id"
);
assert.equal(
  propositionInputsChanged(scored, { ...scored, name: "Herbal cooling hair oil v2" }),
  true
);
assert.equal(gateInputKey(scored), gateInputKey({ ...scored, goNoGo: { classification: "GO" } }));

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /shouldForkLogResubmit/);
assert.match(apiSrc, /const asNew = Boolean\(body\?\.asNew\)/);
assert.match(apiSrc, /forkedFrom = opened\.id/);
assert.match(apiSrc, /id: _openedId/);
assert.match(apiSrc, /let outProposition = \{ \.\.\.advisory\.proposition, id: targetId \}/);
assert.match(apiSrc, /withAdvisory\(derivedProposition, \{ attachGate: true \}\)/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /shouldForkLogResubmit\(sourceDocRef\.current, doc\)/);
assert.match(formSrc, /asNew,/);
assert.match(formSrc, /isScoredProposition\(sourceDocRef\.current\)/);
assert.match(formSrc, /if \(nextGo\.classification\) setCurrentView\("goNoGoResult"\)/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /asNew: Boolean\(asNew\)/);
assert.match(appSrc, /asNew: Boolean\(saveOpts\?\.asNew\)/);

console.log("PASS Log resubmit fork: changed scored values become a new entry");
