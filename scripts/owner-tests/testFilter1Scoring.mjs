/**
 * Part 133 — Filter 1 six-check scoring (pure). Owner attached suite when present;
 * this lock encodes the six rules until that file lands untouched.
 */
import assert from "node:assert/strict";
import { checkF1, computeF1, F1_SLOTS, F1_ITEM_CODES } from "../../lib/filter1Check.js";
import { scoreAdvisoryChecks } from "../../lib/goNoGo.js";
import { SCORE_CHECK_SLOTS, SCORE_CHECK_SLOTS_TOTAL, SCORING_RULESET_VERSION } from "../../lib/lockedConstants.js";
import { countDoneSlots } from "../../lib/scoreSlots.js";

assert.equal(SCORING_RULESET_VERSION, "v5.0");
assert.equal(SCORE_CHECK_SLOTS.f1, 6);
assert.equal(SCORE_CHECK_SLOTS_TOTAL, 17);
assert.deepEqual(F1_SLOTS, ["benchmark", "gap", "attributes", "derivation", "route", "argument"]);

function slots(result) {
  return result.items.map((i) => i.slot);
}

function bySlot(result, slot) {
  return result.items.find((i) => i.slot === slot);
}

const base = {
  declaredAttribute: "hair growth",
  benchmark: "Dove Scalp Serum",
  declaredGap: 3,
  gapDerivation: "Beat Dove on density feel after 8 weeks",
  parityExceptions: "none",
  growthRoute: "penetration",
  growthArgument: "Hair serum households grow 6% a year in India (CMI 2024).",
  evidenceSourceDate: "https://example.com/study",
};

// Six items in fixed order; never formAdmin
{
  const r = computeF1(base, {
    benchmarkCheck: { status: "relevant", source_url: "https://x", reason: "on shelf" },
    claimChecks: {
      gapDerivation: { verdict: "supported", claims: [] },
      parityExceptions: { verdict: "unverified", claims: [] },
      growthArgument: { verdict: "supported", claims: [] },
    },
    routeCheck: { expected: "penetration", confidence: "high" },
  }, {
    evidenceRead: {
      status: "read",
      relevant: true,
      facts: [{ verified: true, topic: "attribute", quote: "growth" }],
    },
  });
  assert.deepEqual(slots(r), F1_SLOTS);
  assert.ok(r.items.every((i) => i.code && !i.formAdmin));
  assert.equal(r.items.filter((i) => i.status === "done").length, 6);
  assert.equal(countDoneSlots("f1", r), 6);
}

// Gap 1.99 below floor; 2.0 and 2.01 clear
for (const [gap, expectDone] of [
  [1.99, false],
  [2.0, true],
  [2.01, true],
]) {
  const r = computeF1({ ...base, declaredGap: gap }, {
    benchmarkCheck: { status: "relevant" },
    claimChecks: { gapDerivation: { verdict: "unverified", claims: [] }, parityExceptions: { verdict: "unverified", claims: [] }, growthArgument: { verdict: "unverified", claims: [] } },
    routeCheck: { expected: "penetration", confidence: "medium" },
  }, { evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] } });
  assert.equal(bySlot(r, "gap").status === "done", expectDone, `gap ${gap}`);
  if (!expectDone) {
    assert.equal(bySlot(r, "gap").code, F1_ITEM_CODES.F1_GAP_BELOW_FLOOR);
    assert.equal(r.checkLabel, "Below floor");
  }
}

// Gap 0 with benchmark = below floor
{
  const r = computeF1({ ...base, declaredGap: 0 }, { benchmarkCheck: { status: "relevant" } }, {});
  assert.equal(bySlot(r, "gap").code, F1_ITEM_CODES.F1_GAP_BELOW_FLOOR);
  assert.equal(r.checkLabel, "Below floor");
}

// First-mover verified: checks 1–4 N/A done; 5–6 still apply
{
  const r = computeF1(
    { declaredGap: 0, benchmark: "", growthRoute: "new-market", growthArgument: "new users in Tier-2" },
    {
      noCompetitorCheck: { majorCompetitorsFound: [], searchSummary: "none found" },
      routeCheck: { expected: "new-market", confidence: "high" },
      claimChecks: { growthArgument: { verdict: "unverified", claims: [] } },
    },
    {}
  );
  assert.equal(bySlot(r, "benchmark").code, F1_ITEM_CODES.F1_NOT_APPLICABLE);
  assert.equal(bySlot(r, "gap").status, "done");
  assert.equal(bySlot(r, "attributes").code, F1_ITEM_CODES.F1_NOT_APPLICABLE);
  assert.equal(bySlot(r, "derivation").code, F1_ITEM_CODES.F1_NOT_APPLICABLE);
  assert.notEqual(r.checkLabel, "Below floor");
  assert.equal(bySlot(r, "route").status, "done");
}

// First-mover disproved
{
  const r = computeF1(
    { declaredGap: 0, benchmark: "" },
    { noCompetitorCheck: { majorCompetitorsFound: ["Brand A", "Brand B"] } },
    {}
  );
  assert.equal(bySlot(r, "gap").code, F1_ITEM_CODES.F1_GAP_BELOW_FLOOR);
  assert.equal(bySlot(r, "benchmark").code, F1_ITEM_CODES.F1_BENCHMARK_COMPETITORS_FOUND);
  assert.equal(r.checkLabel, "Below floor");
}

// Blank gap is missing, not first-mover / not hard stop
{
  const r = computeF1({ ...base, declaredGap: "" }, { benchmarkCheck: { status: "relevant" } }, {});
  assert.equal(bySlot(r, "gap").code, F1_ITEM_CODES.F1_GAP_MISSING);
  assert.notEqual(r.checkLabel, "Below floor");
}

// Benchmark not relevant / not found
{
  const nf = computeF1(base, { benchmarkCheck: { status: "not-found", reason: "gone" } }, {});
  assert.equal(bySlot(nf, "benchmark").code, F1_ITEM_CODES.F1_BENCHMARK_NOT_FOUND);
  const nr = computeF1(base, { benchmarkCheck: { status: "not-relevant", reason: "wrong tier" } }, {});
  assert.equal(bySlot(nr, "benchmark").code, F1_ITEM_CODES.F1_BENCHMARK_NOT_RELEVANT);
}

// Evidence modes
{
  const missing = computeF1({ ...base, evidenceSourceDate: "" }, { benchmarkCheck: { status: "relevant" } }, {});
  assert.equal(bySlot(missing, "attributes").code, F1_ITEM_CODES.F1_EVIDENCE_MISSING);
  const unread = computeF1(base, { benchmarkCheck: { status: "relevant" } }, {
    evidenceRead: { status: "unreadable", advice: "Upload the file instead" },
  });
  assert.equal(bySlot(unread, "attributes").code, F1_ITEM_CODES.F1_EVIDENCE_UNREADABLE);
}

// AI text needs confirmation
{
  const r = computeF1(base, { benchmarkCheck: { status: "relevant" } }, {
    evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] },
    autofillStatus: {
      "f1.gapDerivation": { aiSuggested: base.gapDerivation },
      "f1.parityExceptions": { aiSuggested: "none", confirmed: true },
      "f1.growthRoute": { aiSuggested: "penetration", confirmed: true },
      "f1.growthArgument": { aiSuggested: base.growthArgument, confirmed: true },
    },
  });
  assert.equal(bySlot(r, "derivation").code, F1_ITEM_CODES.F1_NEEDS_CONFIRMATION);
}

// Contradicted claim opens derivation; unverifiable does not
{
  const bad = computeF1(base, {
    benchmarkCheck: { status: "relevant" },
    claimChecks: {
      gapDerivation: {
        verdict: "contradicted",
        claims: [{ verdict: "contradicted", source_url: "https://x", quote: "no" }],
      },
      parityExceptions: { verdict: "unverified", claims: [] },
      growthArgument: { verdict: "unverified", claims: [] },
    },
    routeCheck: { expected: "penetration", confidence: "high" },
  }, { evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] } });
  assert.equal(bySlot(bad, "derivation").code, F1_ITEM_CODES.F1_CLAIM_CONTRADICTED);

  const ok = computeF1(base, {
    benchmarkCheck: { status: "relevant" },
    claimChecks: {
      gapDerivation: { verdict: "unverified", claims: [{ verdict: "unverifiable" }] },
      parityExceptions: { verdict: "unverified", claims: [] },
      growthArgument: { verdict: "unverified", claims: [] },
    },
    routeCheck: { expected: "penetration", confidence: "high" },
  }, { evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] } });
  assert.equal(bySlot(ok, "derivation").status, "done");
}

// Route: high mismatch marks down; medium does not
{
  const high = computeF1(base, {
    benchmarkCheck: { status: "relevant" },
    claimChecks: {
      gapDerivation: { verdict: "unverified", claims: [] },
      parityExceptions: { verdict: "unverified", claims: [] },
      growthArgument: { verdict: "unverified", claims: [] },
    },
    routeCheck: { expected: "frequency", confidence: "high", reason: "current buyers" },
  }, { evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] } });
  assert.equal(bySlot(high, "route").code, F1_ITEM_CODES.F1_ROUTE_MISMATCH);

  const med = computeF1(base, {
    benchmarkCheck: { status: "relevant" },
    claimChecks: {
      gapDerivation: { verdict: "unverified", claims: [] },
      parityExceptions: { verdict: "unverified", claims: [] },
      growthArgument: { verdict: "unverified", claims: [] },
    },
    routeCheck: { expected: "frequency", confidence: "medium" },
  }, { evidenceRead: { status: "read", relevant: true, facts: [{ verified: true, topic: "attribute" }] } });
  assert.equal(bySlot(med, "route").status, "done");
}

// Total score uses 17
{
  const empty = { checkLabel: "Not yet run", items: [] };
  const f1 = checkF1(base, {});
  const score = scoreAdvisoryChecks({ f1, f2: empty, f3: empty, f4: empty });
  assert.equal(score.total, 17);
}

console.log("PASS owner testFilter1Scoring");
