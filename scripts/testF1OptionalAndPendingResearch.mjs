/**
 * F1: attrs 2–3 optional; entered benchmark/growth need web verification;
 * card copy must not echo form inputs as Already on record / Still needed.
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
        { status: "done", text: "MRP ₹99 · 50g" },
        { status: "done", text: "Net margin 55% clears the division floor" },
        { status: "done", text: "Quick-commerce terms assumption recorded" },
      ],
    },
    f3: { checkLabel: "Cleared", items: [{ status: "done", text: "Filter 2 MRP sits within the safe range" }] },
    f4: {
      checkLabel: "Cleared",
      items: Array.from({ length: 7 }, (_, i) => ({ status: "done", text: `Dim ${i} Low` })),
    },
  };
}

const base = {
  declaredAttribute: "taste",
  benchmark: "Maaza mango fruit drink",
  declaredGap: 3,
  growthRoute: "new-market",
  growthArgument: "expanding into new occasions with a fruit drink format",
};

const verified = {
  benchmarkVerified: true,
  categorySizeFound: true,
  benchmarkEvidence: "shelf",
  categorySizeEvidence: "₹200 Cr",
};

// 1) Attr 2/3 optional — same percent with or without them once research verifies
{
  const one = checkF1(base, verified);
  const three = checkF1(
    { ...base, declaredAttribute2: "refreshment", declaredAttribute3: "value" },
    verified
  );
  assert.equal(scoreAdvisoryChecks(fullRest(one)).pct, 100);
  assert.equal(scoreAdvisoryChecks(fullRest(three)).pct, 100);
  assert.equal(one.items.find((i) => /attribute/i.test(i.text)).status, "done");
  assert.doesNotMatch(one.items.find((i) => /attribute/i.test(i.text)).text, /of 3/i);
}

// 2) Named on the form alone is not accepted — awaiting web verification
{
  const f1 = checkF1(base, {});
  const bench = f1.items.find((i) => /benchmark|verification/i.test(i.text));
  assert.equal(bench.status, "pending");
  assert.match(bench.text, /awaiting web verification/i);
  assert.doesNotMatch(bench.text, /^Benchmark named:/i);
  assert.doesNotMatch(bench.text, /Maaza/i);
}

// 3) Growth inputs alone are not accepted — awaiting web research for size
{
  const f1 = checkF1(base, {});
  const growth = f1.items.find((i) => /growth|category size/i.test(i.text));
  assert.equal(growth.status, "pending");
  assert.match(growth.text, /awaiting web research/i);
  assert.doesNotMatch(growth.text, /has not returned/i);
  assert.doesNotMatch(growth.text, /argument recorded/i);
}

// 4) Narrative never echoes cleared inputs as Already on record / Still needed
{
  const f1 = checkF1(base, {});
  const narrative = fallbackFilterNarrative(f1);
  assert.doesNotMatch(narrative, /Already on record/i);
  assert.doesNotMatch(narrative, /Still needed/i);
  assert.doesNotMatch(narrative, /Attribute 1 declared/i);
  assert.match(narrative, /web verification|web research/i);
}

// Actively failed verification / size still open with defect copy
{
  const badBench = checkF1(base, {
    researchFailed: false,
    benchmarkVerified: false,
    benchmarkEvidence: "no listing found",
    categorySizeFound: true,
    categorySizeEvidence: "₹200 Cr",
  });
  assert.equal(badBench.items.find((i) => /benchmark/i.test(i.text)).status, "pending");
  assert.match(badBench.items.find((i) => /benchmark/i.test(i.text)).text, /not verified/i);

  const badSize = checkF1(base, {
    researchFailed: false,
    benchmarkVerified: true,
    benchmarkEvidence: "ok",
    categorySizeFound: false,
    categorySizeEvidence: "no triangulated category size",
  });
  assert.equal(badSize.items.find((i) => /growth/i.test(i.text)).status, "pending");
  assert.match(badSize.items.find((i) => /growth/i.test(i.text)).text, /not substantiated/i);
}

// Path asks for Submit / web check — never "Benchmark named: …"
{
  const f1 = checkF1(base, {});
  const path = buildPathToGo({
    advisoryChecks: fullRest(f1),
    sealedScore: { pct: 73, done: 11, total: 15 },
    scoreStatus: "current",
  });
  assert.equal(path.kind, "path");
  assert.ok(!path.actions.some((a) => /^Benchmark named:/i.test(a.text)));
  assert.ok(path.actions.some((a) => /web search|Submit/i.test(a.text)));
}

console.log("PASS testF1OptionalAndPendingResearch");
