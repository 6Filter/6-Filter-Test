/**
 * Part 141 D71 / D73 — one number: the displayed percentage (scored.pct) decides the verdict,
 * RELEVANCE_SHADOW_MODE is off, and junk free-text earns zero whatever the AI said.
 */
import assert from "node:assert/strict";
import { RELEVANCE_SHADOW_MODE, SCORING_MODEL } from "../lib/lockedConstants.js";
import { computeGoNoGo, scoreAdvisoryChecks, classifyGoNoGoFromScore } from "../lib/goNoGo.js";
import { computeF1 } from "../lib/filter1Check.js";

let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

ok(() => {
  assert.equal(RELEVANCE_SHADOW_MODE, false, "shadow mode is off");
  assert.equal(SCORING_MODEL, "relevance");
});

const F1_SLOTS = ["benchmark", "gap", "attributes", "derivation", "parity", "route", "argument"];
const TEXTS = {
  f1: [
    "Benchmark relevant: Brand",
    "Declared gap 3.0 clears the 2.0 floor",
    "Attribute claim read as adequate on the web check",
    "Gap derivation entered",
    "Parity exceptions entered",
    "Growth route penetration selected",
    "Growth argument entered",
  ],
  f2: ["Net margin 55% clears the division minimum", "Pack size 50 g entered with a unit", "GST rate 18% entered"],
  f3: ["Filter 2 MRP sits within the safe range"],
  f4: Array.from({ length: 7 }, (_, i) => `Dim ${i} Low risk`),
};

/** Every item is "done" (so a binary count reads 100%) but earns only partial credit (relevance). */
function partialCredit(credit) {
  const make = (key) => ({
    checkLabel: "Cleared",
    items: TEXTS[key].map((text, i) => ({
      status: "done",
      text,
      credit,
      level: "adequate",
      ...(key === "f1" ? { slot: F1_SLOTS[i] } : {}),
      ...(key === "f3" ? { slot: "resilience" } : {}),
    })),
  });
  return { f1: make("f1"), f2: make("f2"), f3: make("f3"), f4: make("f4") };
}

ok(() => {
  const advisory = partialCredit(0.5);
  const scored = scoreAdvisoryChecks(advisory);
  assert.notEqual(scored.pct, scored.legacyPct, "fixture must make relevance pct and legacyPct disagree");
  assert.equal(classifyGoNoGoFromScore(scored.legacyPct), "GO", `binary count would read GO-band (${scored.legacyPct})`);
  assert.equal(scored.pct, scored.relevancePct, "primary pct is the relevance pct");
  assert.ok(scored.pct < 60, `relevance pct is NO-GO band (${scored.pct})`);
  assert.equal(scored.shadowMode, false);

  const verdict = computeGoNoGo(advisory);
  assert.equal(verdict, classifyGoNoGoFromScore(scored.pct), "verdict follows scored.pct");
  assert.notEqual(verdict, classifyGoNoGoFromScore(scored.legacyPct), "verdict does NOT follow legacyPct");
  assert.equal(verdict, "NO-GO");
});

ok(() => {
  // WATCH-band relevance (65%) while legacy still says 100% → WATCH, not GO.
  const advisory = partialCredit(0.65);
  const scored = scoreAdvisoryChecks(advisory);
  assert.equal(classifyGoNoGoFromScore(scored.legacyPct), "GO");
  assert.equal(computeGoNoGo(advisory), classifyGoNoGoFromScore(scored.pct));
  assert.equal(computeGoNoGo(advisory), "WATCH");
});

ok(() => {
  // Full credit: both agree and the verdict is GO.
  const advisory = partialCredit(1);
  const scored = scoreAdvisoryChecks(advisory);
  assert.equal(scored.pct, 100);
  assert.equal(computeGoNoGo(advisory), "GO");
});

// ───────────── junk attribute + strong AI assessment → zero credit, input-invalid guard ─────────────
const SRC = "https://example.com/a";
const strongAttr = {
  raw: { relevance: "strong", specific: true, supported: true, source_url: SRC, reason: "looks great", quote: "q" },
  returnedSources: [SRC],
};
const baseF1 = {
  benchmark: "Dove Scalp Serum 100 ml",
  declaredGap: 3,
  declaredAttribute: "lasting freshness after every wash",
  gapDerivation: "Beat the benchmark on lasting freshness",
  parityExceptions: "fragrance may be weaker",
  growthRoute: "Penetration",
  growthArgument: "households growing with CMI figures",
};
const findings = { assessments: { attributes: strongAttr } };

ok(() => {
  // Control: a real attribute with a strong assessment earns credit.
  const good = computeF1(baseF1, findings, {});
  const it = good.items.find((i) => i.slot === "attributes");
  assert.ok(it.credit > 0, `real attribute earns credit (${it.credit})`);
});

ok(() => {
  const junk = computeF1({ ...baseF1, declaredAttribute: "asdfgh qwerty zxcvbn" }, findings, {});
  const it = junk.items.find((i) => i.slot === "attributes");
  assert.equal(it.credit, 0, "junk attribute earns nothing even with a strong AI assessment");
  assert.notEqual(it.status, "done");
  assert.equal(it.guard, "input-invalid", "input-invalid guard is on the item");
  assert.ok(it.reasons.includes("INPUT_INVALID"), `reasons: ${it.reasons}`);
  assert.equal(it.level, "none");
  assert.match(it.text, /Fix this input before it can score/);
  // Other, valid slots are unaffected.
  const bench = junk.items.find((i) => i.slot === "benchmark");
  assert.ok(bench, "benchmark still present");
});

console.log(`PASS testPart141OneNumber (${checks} checks)`);
