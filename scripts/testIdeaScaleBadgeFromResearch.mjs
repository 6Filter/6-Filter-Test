import assert from "node:assert/strict";
import { ideaSizeForResult, ideaScaleFromDoc } from "../lib/ideaScale.js";
import {
  buildResearchFindings,
  enrichResearchFindingsSizingFactors,
} from "../lib/researchFindings.js";

const sizingResearch = {
  householdsReachedY3Mn: 3.2,
  trialRatePct: 45,
  repeatConversionPct: 30,
  purchaseFrequencyYr: 5,
  avgPackValueInr: 120,
  sources: [{ title: "Kantar panel", url: "https://example.com" }],
};

const findings = buildResearchFindings({ sizingResearch });
assert.equal(findings.f5.householdsReachedY3Mn, 3.2);
assert.equal(findings.f5.trialRatePct, 45);
assert.equal(findings.f5.sizingFactorsFound, true);

const badgeFromFindings = ideaSizeForResult({
  goNoGo: { classification: "WATCH" },
  f5: {},
  researchFindings: findings,
});
assert.ok(badgeFromFindings, "researchFindings.f5 factors must mint the hero gram badge");
assert.equal(badgeFromFindings.tier, "1000g");
assert.equal(badgeFromFindings.provisional, true);

const legacyFindings = {
  f5: { sizingFactorsFound: true, sizingEvidence: "5 of 5 sizing factors returned" },
};
const suggestions = {
  f5: {
    householdsReachedY3Mn: 0.4,
    trialRatePct: 20,
    repeatConversionPct: 25,
    purchaseFrequencyYr: 4,
    avgPackValueInr: 80,
  },
};
const enriched = enrichResearchFindingsSizingFactors(legacyFindings, suggestions);
assert.equal(enriched.f5.householdsReachedY3Mn, 0.4);
assert.equal(enriched.f5.avgPackValueInr, 80);

const badgeFromLegacy = ideaSizeForResult({
  goNoGo: { classification: "WATCH" },
  researchFindings: legacyFindings,
  suggestions,
});
assert.ok(badgeFromLegacy, "legacy findings + suggestions.f5 must still mint a badge");
assert.equal(badgeFromLegacy.tier, ideaScaleFromDoc({ researchFindings: enriched }));

const emptyBadge = ideaSizeForResult({ goNoGo: { classification: "WATCH" }, f5: {} });
assert.equal(emptyBadge, null, "no factors → no fabricated gram badge");

console.log("PASS idea-scale badge from researchFindings.f5");
