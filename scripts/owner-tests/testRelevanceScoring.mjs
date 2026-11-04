/**
 * Part 133 — relevance scoring with the REAL check builder (no DB, no AI).
 * Owner source of truth. Do not edit to weaken.
 */
import assert from "node:assert/strict";
import { checkF1 } from "../../lib/filterChecks.js";
import { scoreAdvisoryChecks } from "../../lib/goNoGo.js";
import { SCORE_CHECK_SLOTS_TOTAL, DECLARED_GAP_FLOOR } from "../../lib/lockedConstants.js";
import { TECH_SHIFT_DIMENSIONS } from "../../lib/techShiftRisk.js";
import { RELEVANCE_CREDIT } from "../../lib/relevanceGrade.js";

assert.equal(SCORE_CHECK_SLOTS_TOTAL, 17);
assert.equal(DECLARED_GAP_FLOOR, 2.0);

function clearedF2F3F4({ qcomCredit = 0 } = {}) {
  return {
    f2: {
      checkLabel: "Cleared",
      items: [
        { status: "done", text: "MRP ₹99 · 50g", slot: "mrpGrammage", credit: 1, level: "strong" },
        {
          status: "done",
          text: "Net margin 55% clears the division floor",
          slot: "netMarginFloor",
          credit: 1,
          level: "strong",
        },
        {
          status: qcomCredit >= 1 ? "done" : "pending",
          text: qcomCredit >= 1 ? "Quick-commerce strong" : "Quick-commerce awaiting assessment",
          slot: "qcom",
          credit: qcomCredit,
          level: qcomCredit >= 1 ? "strong" : qcomCredit > 0 ? "adequate" : "none",
        },
      ],
    },
    f3: { checkLabel: "Cleared", items: [{ status: "done", text: "in range", credit: 1, level: "strong" }] },
    f4: {
      checkLabel: "Cleared",
      items: TECH_SHIFT_DIMENSIONS.map((d) => ({
        status: "done",
        text: `${d} Low`,
        credit: 1,
        level: "strong",
      })),
    },
  };
}

const carefulF1 = {
  declaredAttribute: "24-hour odour control on fabric",
  benchmark: "Dove Scalp Serum 100 ml",
  declaredGap: 3,
  gapDerivation: "Beat Dove on lasting freshness after sweat",
  parityExceptions: "none",
  growthRoute: "penetration",
  growthArgument: "Hair-care households in India are growing at 8% with CMI numbers",
  evidenceSourceDate: "https://example.com/study.pdf",
  targetConsumer: "Current hair-oil buyers aged 25–40",
};

// Careful entries with NO assessment → only numeric / non-judged slots credit → 11/17
{
  const f1 = checkF1(carefulF1, {});
  const score = scoreAdvisoryChecks({ f1, ...clearedF2F3F4({ qcomCredit: 0 }) });
  assert.equal(score.total, 17);
  // gap (1) + mrp (1) + margin (1) + f3 (1) + f4 (7) = 11; judged F1 + qcom = 0
  assert.equal(score.points, 11);
  assert.equal(score.pct, Math.round((100 * 11) / 17));
  for (const slot of ["benchmark", "attributes", "derivation", "route", "argument"]) {
    const it = f1.items.find((i) => i.slot === slot);
    assert.ok(it, slot);
    assert.equal(it.credit, 0, `${slot} unassessed earns nothing`);
  }
}

// One-character junk earns nothing even if the AI rates strong
{
  const junk = {
    ...carefulF1,
    declaredAttribute: "x",
    gapDerivation: "y",
    parityExceptions: "z",
    growthArgument: "n",
  };
  const findings = {
    assessments: {
      attributes: { raw: { relevance: "strong", specific: true } },
      derivation: {
        raw: { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
      argument: {
        raw: { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
      route: { raw: { matches: "yes", confidence: "high" } },
      benchmark: {
        raw: { relevance: "strong", source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
    },
  };
  const f1 = checkF1(junk, findings, {
    evidenceRead: {
      status: "ok",
      relevant: true,
      facts: [{ topic: "attribute", verified: true, quote: "x" }],
    },
  });
  assert.equal(f1.items.find((i) => i.slot === "attributes").credit, 0);
  assert.ok(f1.items.find((i) => i.slot === "attributes").reasons.includes("TOO_SHORT"));
  assert.equal(f1.items.find((i) => i.slot === "derivation").credit, 0);
  assert.ok(f1.items.find((i) => i.slot === "derivation").reasons.includes("TOO_SHORT"));
  assert.equal(f1.items.find((i) => i.slot === "argument").credit, 0);
  assert.ok(f1.items.find((i) => i.slot === "argument").reasons.includes("TOO_SHORT"));
}

// Credit follows level
{
  const findings = {
    assessments: {
      benchmark: {
        raw: { relevance: "adequate", source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
      attributes: { raw: { relevance: "strong", specific: true } },
      derivation: {
        raw: { relevance: "weak", specific: false },
        returnedSources: [],
      },
      route: { raw: { matches: "yes", confidence: "high" } },
      argument: {
        raw: { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
    },
  };
  const f1 = checkF1(carefulF1, findings, {
    evidenceRead: {
      status: "ok",
      facts: [{ topic: "attribute", verified: true, quote: "odour control" }],
    },
  });
  assert.equal(f1.items.find((i) => i.slot === "benchmark").credit, RELEVANCE_CREDIT.adequate);
  assert.equal(f1.items.find((i) => i.slot === "attributes").credit, RELEVANCE_CREDIT.strong);
  assert.equal(f1.items.find((i) => i.slot === "derivation").credit, RELEVANCE_CREDIT.weak);
  assert.equal(f1.items.find((i) => i.slot === "route").credit, RELEVANCE_CREDIT.strong);
  assert.equal(f1.items.find((i) => i.slot === "argument").credit, RELEVANCE_CREDIT.strong);
  assert.equal(f1.items.find((i) => i.slot === "gap").credit, 1);
  assert.equal(f1.items.find((i) => i.slot === "benchmark").status, "pending"); // not strong
  assert.equal(f1.items.find((i) => i.slot === "route").status, "done");
}

// Gap floor unchanged
{
  const below = checkF1({ ...carefulF1, declaredGap: 1.5 }, {});
  assert.equal(below.checkLabel, "Below floor");
  assert.equal(below.items.find((i) => i.slot === "gap").credit, 0);
  const at = checkF1({ ...carefulF1, declaredGap: 2.0 }, {});
  assert.equal(at.items.find((i) => i.slot === "gap").credit, 1);
  const above = checkF1({ ...carefulF1, declaredGap: 2.01 }, {});
  assert.equal(above.items.find((i) => i.slot === "gap").credit, 1);
}

// First-mover verified clears 1–4 as N/A strong; checks 5–6 still apply
{
  const f1 = checkF1(
    {
      declaredAttribute: "enzyme probiotic dal",
      declaredGap: 0,
      growthRoute: "penetration",
      growthArgument: "first ambient probiotic dal",
    },
    {
      noCompetitorCheck: { majorCompetitorsFound: [], searchSummary: "none" },
      assessments: {
        route: { raw: { matches: "yes", confidence: "high" } },
        argument: {
          raw: { relevance: "adequate", specific: true, supported: false },
          returnedSources: [],
        },
      },
    }
  );
  for (const slot of ["benchmark", "gap", "attributes", "derivation"]) {
    assert.equal(f1.items.find((i) => i.slot === slot).credit, 1);
    assert.equal(f1.items.find((i) => i.slot === slot).code, "F1_NOT_APPLICABLE");
  }
  assert.notEqual(f1.checkLabel, "Below floor");
}

// gainPct is fractional remaining share of 17
{
  const f1 = checkF1(carefulF1, {});
  const gap = f1.items.find((i) => i.slot === "gap");
  assert.equal(gap.gainPct, 0);
  const bench = f1.items.find((i) => i.slot === "benchmark");
  assert.equal(bench.gainPct, Math.round(100 / 17));
}

console.log("PASS owner testRelevanceScoring");
