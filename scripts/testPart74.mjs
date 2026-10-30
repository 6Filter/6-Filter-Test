import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1 } from "../lib/filterChecks.js";
import { fallbackFilterNarrative } from "../lib/filterNarrativeText.js";
import { ideaSizeFromF5, ideaSizeForResult } from "../lib/ideaScale.js";
import { mergeProposition } from "../lib/propositionFields.js";

const deoF5 = {
  householdsReachedY3Mn: 3.2,
  trialRatePct: 45,
  repeatConversionPct: 30,
  purchaseFrequencyYr: 5,
  avgPackValueInr: 120,
  computedRevenue: null,
};

assert.equal(ideaSizeFromF5(deoF5), null, "factors without computedRevenue must not mint a gram tier");
const watchBadge = ideaSizeForResult({
  name: "48-Hour Roll-On Deodorant",
  goNoGo: { classification: "WATCH", score: { pct: 73 } },
  f5: deoF5,
});
assert.ok(watchBadge);
assert.equal(watchBadge.tier, "1000g");
assert.equal(watchBadge.provisional, true);

const unlocked = {
  goNoGo: { classification: "GO" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
  f5: { ...deoF5 },
};
const badge = ideaSizeForResult(unlocked);
assert.ok(badge);
assert.equal(badge.tier, "1000g");
assert.equal(badge.provisional, true, "unlock without a human edit stays estimated");

const confirmed = ideaSizeForResult({
  ...unlocked,
  f5: { ...deoF5, confirmedByHuman: true },
});
assert.equal(confirmed.provisional, false);

const mergedLocked = mergeProposition({
  goNoGo: { classification: "WATCH" },
  f5: deoF5,
});
assert.equal(mergedLocked.f5.computedRevenue, null);

const mergedGo = mergeProposition({
  goNoGo: { classification: "GO" },
  marketResearchProof: { name: "ua.pdf", data: "x" },
  f5: { ...deoF5 },
});
assert.equal(typeof mergedGo.f5.computedRevenue, "number");
assert.ok(mergedGo.f5.computedRevenue > 12);

assert.equal(checkF1({}).checkLabel, "Not yet run");
assert.equal(fallbackFilterNarrative({ checkLabel: "Locked", items: [] }), fallbackFilterNarrative({ checkLabel: "Locked", items: [] }));
assert.match(fallbackFilterNarrative({ checkLabel: "Locked", items: [] }), /Filter 5 unlocks/);
assert.match(fallbackFilterNarrative({ checkLabel: "Not yet run", items: [] }), /not been run yet/i);
assert.doesNotMatch(fallbackFilterNarrative({ checkLabel: "Locked", items: [] }), /cleared/i);

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /ideaSizeForResult/);
assert.match(form, /min-height:11\.25rem/);
assert.match(form, /<ErrorBoundary/);
assert.match(form, /The verdict above is still valid/);
assert.match(form, /className="manager-review-banner"/);
const requestedHits = form.match(/Manager review requested by \{requesterName\}/g) || [];
assert.equal(requestedHits.length, 1, "manager review confirmation line must render once");
assert.match(form, /WATCH at \{scorePct\}%/);

const boundary = readFileSync(new URL("../src/ErrorBoundary.jsx", import.meta.url), "utf8");
assert.match(boundary, /this\.props\.fallback/);

console.log("PASS Part 74 hero isolate, F5 gram gate, F1 not-yet-run, manager line once");
