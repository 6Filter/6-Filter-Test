/**
 * Property: every judged F1/F2 field drops to zero credit when replaced with one-character junk,
 * even if stored assessments claim strong.
 */
import assert from "node:assert/strict";
import { checkF1 } from "../lib/filterChecks.js";
import { gradeAssessment } from "../lib/relevanceGrade.js";

const strongPlan = { raw: { relevance: "strong", specific: true } };
const strongClaim = {
  raw: { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
  returnedSources: ["https://a.com"],
};
const strongBench = {
  raw: { relevance: "strong", source_url: "https://a.com" },
  returnedSources: ["https://a.com"],
};
const strongRoute = { raw: { matches: "yes", confidence: "high" } };

const base = {
  declaredAttribute: "lasting freshness after wash",
  benchmark: "Dove Scalp Serum 100 ml",
  declaredGap: 3,
  gapDerivation: "Beat on lasting freshness",
  parityExceptions: "none",
  growthRoute: "penetration",
  growthArgument: "households growing with CMI figures",
  evidenceSourceDate: "https://example.com/study",
};

const findings = {
  assessments: {
    benchmark: strongBench,
    attributes: strongPlan,
    derivation: strongClaim,
    route: strongRoute,
    argument: strongClaim,
  },
};
const ctx = {
  evidenceRead: {
    status: "ok",
    facts: [{ topic: "attribute", verified: true, quote: "freshness" }],
  },
};

const judged = [
  ["declaredAttribute", "attributes"],
  ["gapDerivation", "derivation"],
  ["growthArgument", "argument"],
  ["benchmark", "benchmark"],
];

for (const [field, slot] of judged) {
  const doc = { ...base, [field]: "x" };
  // parity must stay long enough when testing derivation text alone
  if (field === "gapDerivation") doc.parityExceptions = "none";
  const f1 = checkF1(doc, findings, ctx);
  const it = f1.items.find((i) => i.slot === slot);
  assert.equal(it.credit, 0, `${field} junk must drop ${slot} credit to 0`);
  assert.ok(it.reasons.includes("TOO_SHORT") || it.reasons.includes("NOT_ENTERED"), `${field} → ${it.reasons}`);
}

// Direct gradeAssessment property for plan/claims
for (const kind of ["plan", "claims", "benchmark"]) {
  const g = gradeAssessment(
    kind,
    kind === "benchmark"
      ? { relevance: "strong", source_url: "https://a.com" }
      : { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
    { entered: true, tooShort: true, returnedSources: ["https://a.com"] }
  );
  assert.equal(g.credit, 0, `${kind} tooShort`);
}

console.log("PASS testJunkDropsCredit — judged fields cannot ship with presence credit");
