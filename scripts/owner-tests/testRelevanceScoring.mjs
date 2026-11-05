/**
 * Part 133/134 — relevance scoring with REAL check builder.
 * Updated for 15 checks (F2 = net margin only).
 */
import assert from "node:assert/strict";
import { checkF1 } from "../../lib/filterChecks.js";
import { scoreAdvisoryChecks } from "../../lib/goNoGo.js";
import { SCORE_CHECK_SLOTS_TOTAL, DECLARED_GAP_FLOOR } from "../../lib/lockedConstants.js";
import { TECH_SHIFT_DIMENSIONS } from "../../lib/techShiftRisk.js";
import { RELEVANCE_CREDIT } from "../../lib/relevanceGrade.js";

assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);
assert.equal(DECLARED_GAP_FLOOR, 2.0);

function clearedF2F3F4() {
  return {
    f2: {
      checkLabel: "Cleared",
      items: [
        {
          status: "done",
          text: "Net margin 55% clears the division minimum",
          slot: "margin",
          credit: 1,
          level: "strong",
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

// Careful entries with NO assessment → gap + margin + f3 + f4 = 10/15
{
  const f1 = checkF1(carefulF1, {});
  const score = scoreAdvisoryChecks({ f1, ...clearedF2F3F4() });
  assert.equal(score.total, 15);
  assert.equal(score.points, 10);
  assert.equal(score.pct, Math.round((100 * 10) / 15));
  for (const slot of ["benchmark", "attributes", "derivation", "route", "argument"]) {
    const it = f1.items.find((i) => i.slot === slot);
    assert.ok(it, slot);
    assert.equal(it.credit, 0, `${slot} unassessed earns nothing`);
  }
}

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
}

{
  const findings = {
    assessments: {
      benchmark: {
        raw: { relevance: "adequate", source_url: "https://a.com" },
        returnedSources: ["https://a.com"],
      },
      attributes: { raw: { relevance: "strong", specific: true } },
      derivation: { raw: { relevance: "weak", specific: false }, returnedSources: [] },
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
  assert.equal(f1.items.find((i) => i.slot === "gap").credit, 1);
}

{
  const below = checkF1({ ...carefulF1, declaredGap: 1.5 }, {});
  assert.equal(below.checkLabel, "Below floor");
  const at = checkF1({ ...carefulF1, declaredGap: 2.0 }, {});
  assert.equal(at.items.find((i) => i.slot === "gap").credit, 1);
}

{
  const f1 = checkF1(carefulF1, {});
  const bench = f1.items.find((i) => i.slot === "benchmark");
  assert.equal(bench.gainPct, Math.round(100 / 15));
}

console.log("PASS owner testRelevanceScoring");
