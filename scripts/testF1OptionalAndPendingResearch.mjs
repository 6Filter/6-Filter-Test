/**
 * F1 (v5.0): attrs 2–3 optional; typed benchmark/route/argument need research;
 * card copy must not echo form inputs as Already on record / Still needed.
 * Credit requires stored relevance assessments (never presence alone).
 */
import assert from "node:assert/strict";
import { checkF1 } from "../lib/filterChecks.js";
import { scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { buildPathToGo } from "../lib/improvementPoints.js";
import { fallbackFilterNarrative } from "../lib/filterNarrativeText.js";

function fullRest(f1Check) {
  return {
    f1: f1Check,
    f2: {
      checkLabel: "Cleared",
      items: [
        { status: "done", text: "MRP ₹99 · 50g", credit: 1 },
        { status: "done", text: "Net margin 55% clears the division floor", credit: 1 },
        { status: "done", text: "Quick-commerce terms assumption recorded", credit: 1, slot: "qcom" },
      ],
    },
    f3: { checkLabel: "Cleared", items: [{ status: "done", text: "Filter 2 MRP sits within the safe range", credit: 1 }] },
    f4: {
      checkLabel: "Cleared",
      items: Array.from({ length: 7 }, (_, i) => ({ status: "done", text: `Dim ${i} Low`, credit: 1 })),
    },
  };
}

const SRC = "https://example.com/maaza";

const base = {
  declaredAttribute: "taste preferred over benchmark",
  benchmark: "Maaza mango fruit drink",
  declaredGap: 3,
  gapDerivation: "Beat Maaza on freshness perception by 2 points",
  parityExceptions: "none",
  growthRoute: "new-market",
  growthArgument: "expanding into new occasions with a fruit drink format",
  evidenceSourceDate: "https://example.com/study.pdf",
};

const clearedFindings = {
  assessments: {
    benchmark: {
      raw: { relevance: "strong", source_url: SRC, reason: "on shelf in India" },
      returnedSources: [SRC],
    },
    derivation: {
      raw: {
        relevance: "strong",
        specific: true,
        supported: true,
        source_url: SRC,
        quote: "freshness leads purchase",
      },
      returnedSources: [SRC],
    },
    argument: {
      raw: {
        relevance: "strong",
        specific: true,
        supported: true,
        source_url: SRC,
        quote: "occasion expansion",
      },
      returnedSources: [SRC],
    },
    attributes: { raw: { relevance: "strong", specific: true }, returnedSources: [] },
    route: { raw: { matches: "yes", confidence: "high", expected: "new-market" }, returnedSources: [] },
  },
  benchmarkCheck: { status: "relevant", source_url: SRC, reason: "on shelf in India" },
  routeCheck: { expected: "new-market", confidence: "high", reason: "new audience" },
};

const clearedCtx = {
  evidenceRead: {
    status: "ok",
    relevant: true,
    facts: [{ topic: "attribute", verified: true, quote: "taste preferred" }],
  },
};

// 1) Attr 2/3 optional — same percent with or without them once research clears
{
  const one = checkF1(base, clearedFindings, clearedCtx);
  const three = checkF1(
    { ...base, declaredAttribute2: "refreshment", declaredAttribute3: "value" },
    clearedFindings,
    clearedCtx
  );
  assert.equal(scoreAdvisoryChecks(fullRest(one)).pct, 100);
  assert.equal(scoreAdvisoryChecks(fullRest(three)).pct, 100);
  const attr = one.items.find((i) => i.slot === "attributes");
  assert.equal(attr.status, "done");
  assert.doesNotMatch(attr.text, /of 3/i);
}

// 2) Named on the form alone is not accepted — awaiting assessment
{
  const f1 = checkF1(base, {});
  const bench = f1.items.find((i) => i.slot === "benchmark");
  assert.equal(bench.status, "pending");
  assert.match(bench.text, /awaiting web check|awaiting relevance|assessed when you Submit/i);
  assert.doesNotMatch(bench.text, /^Benchmark named:/i);
  assert.doesNotMatch(bench.text, /Maaza/i);
}

// 3) Growth route / argument alone are not accepted — awaiting checks
{
  const f1 = checkF1(base, {});
  const route = f1.items.find((i) => i.slot === "route");
  const argument = f1.items.find((i) => i.slot === "argument");
  assert.equal(route.status, "pending");
  assert.match(route.text, /awaiting AI check|awaiting|assessed when you Submit/i);
  assert.equal(argument.status, "pending");
  assert.match(argument.text, /awaiting fact-check|awaiting|assessed when you Submit/i);
}

// 4) Narrative never echoes cleared inputs as Already on record / Still needed
{
  const f1 = checkF1(base, {});
  const narrative = fallbackFilterNarrative(f1);
  assert.doesNotMatch(narrative, /Already on record/i);
  assert.doesNotMatch(narrative, /Still needed/i);
  assert.doesNotMatch(narrative, /Attribute 1 declared/i);
}

// Actively failed relevance / missing evidence stay open
{
  const badBench = checkF1(base, {
    benchmarkCheck: { status: "not-found", reason: "no listing found" },
  });
  assert.equal(badBench.items.find((i) => i.slot === "benchmark").status, "pending");
  assert.match(badBench.items.find((i) => i.slot === "benchmark").text, /not found/i);

  const noEvidence = checkF1(
    { ...base, evidenceSourceDate: "" },
    { ...clearedFindings }
  );
  assert.equal(noEvidence.items.find((i) => i.slot === "attributes").status, "pending");
  assert.match(noEvidence.items.find((i) => i.slot === "attributes").text, /Evidence Source|Upload/i);
}

// Path asks for Submit / web check — never "Benchmark named: …"
{
  const f1 = checkF1(base, {});
  const path = buildPathToGo({
    advisoryChecks: fullRest(f1),
    sealedScore: { pct: 65, done: 11, total: 17 },
    scoreStatus: "current",
  });
  assert.equal(path.kind, "path");
  assert.ok(!path.actions.some((a) => /^Benchmark named:/i.test(a.text)));
  assert.ok(path.actions.some((a) => /web search|Submit|web check|fact-check|AI check|assess/i.test(a.text)));
}

console.log("PASS testF1OptionalAndPendingResearch");
