/**
 * Part 133 — pure grading rules (owner source of truth). Do not edit to weaken.
 */
import assert from "node:assert/strict";
import {
  RELEVANCE_CREDIT,
  MIN_ASSESSABLE_CHARS,
  gradeAssessment,
  evidenceAssessmentFromRead,
  isTooShort,
} from "../../lib/relevanceGrade.js";

assert.equal(MIN_ASSESSABLE_CHARS, 3);
assert.equal(RELEVANCE_CREDIT.none, 0);
assert.equal(RELEVANCE_CREDIT.weak, 1 / 3);
assert.equal(RELEVANCE_CREDIT.adequate, 2 / 3);
assert.equal(RELEVANCE_CREDIT.strong, 1);

assert.equal(isTooShort("x"), true);
assert.equal(isTooShort("ab"), true);
assert.equal(isTooShort("abc"), false);

// Gates
assert.equal(gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: false }).level, "none");
assert.ok(gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: false }).reasons.includes("NOT_ENTERED"));
assert.equal(gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: true, tooShort: true }).level, "none");
assert.ok(gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: true, tooShort: true }).reasons.includes("TOO_SHORT"));
assert.equal(
  gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: true, humanWritten: false }).level,
  "none"
);
assert.ok(
  gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: true, humanWritten: false }).reasons.includes(
    "NEEDS_CONFIRMATION"
  )
);
assert.equal(gradeAssessment("plan", null, { entered: true }).level, "none");
assert.ok(gradeAssessment("plan", null, { entered: true }).reasons.includes("NOT_ASSESSED"));

// Benchmark citation
{
  const g = gradeAssessment(
    "benchmark",
    { relevance: "strong", source_url: "https://evil.example/fake" },
    { entered: true, returnedSources: ["https://shop.example/real"] }
  );
  assert.equal(g.level, "none");
  assert.ok(g.reasons.includes("NOT_CITED"));
}
{
  const g = gradeAssessment(
    "benchmark",
    { relevance: "strong", source_url: "https://shop.example/real" },
    { entered: true, returnedSources: ["https://shop.example/real"] }
  );
  assert.equal(g.level, "strong");
  assert.equal(g.credit, 1);
}

// Claims: contradiction needs source + quote
{
  const g = gradeAssessment(
    "claims",
    { relevance: "strong", specific: true, contradicted: true, source_url: "https://a.com", quote: "" },
    { entered: true, returnedSources: ["https://a.com"] }
  );
  assert.notEqual(g.level, "none"); // ignored without quote
}
{
  const g = gradeAssessment(
    "claims",
    {
      relevance: "strong",
      specific: true,
      contradicted: true,
      source_url: "https://a.com",
      quote: "category shrank",
    },
    { entered: true, returnedSources: ["https://a.com"] }
  );
  assert.equal(g.level, "none");
  assert.ok(g.reasons.includes("CONTRADICTED"));
}
{
  const g = gradeAssessment(
    "claims",
    { relevance: "strong", specific: false, supported: true, source_url: "https://a.com" },
    { entered: true, returnedSources: ["https://a.com"] }
  );
  assert.equal(g.level, "weak");
  assert.ok(g.reasons.includes("NOT_SPECIFIC"));
}
{
  const g = gradeAssessment(
    "claims",
    { relevance: "strong", specific: true, supported: true, source_url: "https://a.com" },
    { entered: true, returnedSources: ["https://a.com"] }
  );
  assert.equal(g.level, "strong");
}
{
  const g = gradeAssessment(
    "claims",
    { relevance: "strong", specific: true, supported: false },
    { entered: true, returnedSources: [] }
  );
  assert.equal(g.level, "adequate");
}

// Plan: not specific capped at weak; no citation required
{
  const g = gradeAssessment("plan", { relevance: "strong", specific: false }, { entered: true });
  assert.equal(g.level, "weak");
}
{
  const g = gradeAssessment("plan", { relevance: "strong", specific: true }, { entered: true });
  assert.equal(g.level, "strong");
}

// Route
assert.equal(gradeAssessment("route", { matches: "yes" }, { entered: true }).level, "strong");
assert.equal(gradeAssessment("route", { matches: "unclear" }, { entered: true }).level, "adequate");
assert.equal(gradeAssessment("route", { matches: "no", confidence: "high" }, { entered: true }).level, "none");
assert.equal(gradeAssessment("route", { matches: "no", confidence: "medium" }, { entered: true }).level, "weak");

// Evidence from facts
{
  const ev = evidenceAssessmentFromRead({
    status: "ok",
    facts: [{ topic: "attribute", verified: true, quote: "softness" }],
  });
  assert.equal(ev.relevance, "strong");
  assert.equal(gradeAssessment("evidence", ev, { entered: true }).level, "strong");
}
{
  const ev = evidenceAssessmentFromRead({
    status: "ok",
    facts: [{ topic: "category size", verified: true, quote: "₹200 Cr" }],
  });
  assert.equal(ev.relevance, "adequate");
}
{
  const ev = evidenceAssessmentFromRead({
    status: "ok",
    facts: [{ topic: "other", verified: true, quote: "misc" }],
  });
  assert.equal(ev.relevance, "weak");
}
{
  const ev = evidenceAssessmentFromRead({ status: "unreadable" });
  assert.equal(ev.relevance, "none");
}
{
  const ev = evidenceAssessmentFromRead(null);
  assert.equal(ev.relevance, "none");
}

console.log("PASS owner testRelevanceGrading");
