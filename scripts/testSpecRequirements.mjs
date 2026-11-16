/**
 * Part 141 — spec requirement checks (light): one test per requirement we do not want to regress.
 * P6 is the evidence read: a quote that appears in the file verifies the fact and fills the Filter 5 value.
 */
import assert from "node:assert/strict";
import {
  GONOGO_SCORE_BANDS,
  RELEVANCE_SHADOW_MODE,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORING_RULESET_VERSION,
} from "../lib/lockedConstants.js";
import { verifyEvidenceFacts, f5f6FromFacts, f5f6SuggestionsFromEvidence } from "../lib/evidenceRead.js";
import { SCORING_FINGERPRINT_FILES } from "../lib/scoringRuleset.js";

let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

// P1 — ruleset v5.7, shadow mode off, 18 fixed slots, locked bands.
ok(() => {
  assert.equal(SCORING_RULESET_VERSION, "v5.7");
  assert.equal(RELEVANCE_SHADOW_MODE, false);
  assert.equal(SCORE_CHECK_SLOTS_TOTAL, 18);
  assert.equal(GONOGO_SCORE_BANDS.NOGO_MAX, 60);
  assert.equal(GONOGO_SCORE_BANDS.WATCH_MAX, 80);
});

// P2 — the verdict-deciding files are covered by the scoring fingerprint.
ok(() => {
  assert.ok(SCORING_FINGERPRINT_FILES.includes("lib/sealOutput.js"));
  assert.ok(SCORING_FINGERPRINT_FILES.includes("lib/improvementPoints.js"));
  assert.ok(SCORING_FINGERPRINT_FILES.includes("lib/goNoGo.js"));
});

// P6 — evidence quote "the trial rate was 8% of households reached" is found in the document text.
ok(() => {
  const text = "In the pilot the trial rate was 8% of households reached. Repeat data is still being collected.";
  const raw = [
    {
      topic: "f5.trialRatePct",
      statement: "Pilot trial rate was 8%",
      quote: "the trial rate was 8% of households reached",
      location: "page 2",
      figure: 8,
      unit: "%",
    },
  ];
  const facts = verifyEvidenceFacts(raw, text, {});
  assert.equal(facts.length, 1);
  assert.equal(facts[0].verified, true, `rejectReason: ${facts[0].rejectReason}`);
  assert.equal(facts[0].rejectReason, null);

  const { found, notFound } = f5f6FromFacts(facts);
  const trial = found.find((f) => f.topic === "f5.trialRatePct");
  assert.ok(trial, "the trial rate is yielded");
  assert.equal(trial.filter, "f5");
  assert.equal(trial.key, "trialRatePct");
  assert.equal(trial.value, 8);
  assert.equal(trial.quote, "the trial rate was 8% of households reached");
  assert.ok(notFound.includes("f5.repeatConversionPct"), "values the file did not state stay not-found");

  const suggestions = f5f6SuggestionsFromEvidence({ facts });
  assert.equal(suggestions.f5.trialRatePct, 8);
});

// P6 (negative) — a quote that is not in the file, or a figure not in the quote, never verifies.
ok(() => {
  const text = "In the pilot the trial rate was 8% of households reached.";
  const [invented] = verifyEvidenceFacts(
    [{ topic: "f5.trialRatePct", statement: "x", quote: "the trial rate was 12% of households", figure: 12 }],
    text,
    {}
  );
  assert.equal(invented.verified, false);
  assert.equal(invented.rejectReason, "quote not found in document");

  const [wrongFigure] = verifyEvidenceFacts(
    [{ topic: "f5.trialRatePct", statement: "x", quote: "the trial rate was 8% of households reached", figure: 9 }],
    text,
    {}
  );
  assert.equal(wrongFigure.verified, false);
  assert.equal(wrongFigure.rejectReason, "figure not present in quote");
  assert.equal(f5f6FromFacts([invented, wrongFigure]).found.length, 0);

  const [noQuote] = verifyEvidenceFacts([{ topic: "f5.trialRatePct", statement: "x", figure: 8 }], text, {});
  assert.equal(noQuote.verified, false);
  assert.equal(noQuote.rejectReason, "missing quote");
});

console.log(`PASS testSpecRequirements (${checks} checks)`);
