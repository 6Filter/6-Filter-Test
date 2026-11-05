/**
 * Part 137 — owner test (do not edit to make it pass; fix production code).
 * Pure: every filled field is accounted for; benchmark never waits for confirmation;
 * AI-written text waits for confirmation.
 */
import assert from "node:assert/strict";
import { inputCoverage, coverageInstruction } from "../../lib/inputCoverage.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

check("empty doc returns no rows", () => {
  assert.deepEqual(inputCoverage({}), []);
});

check("typed benchmark is pending until assessed", () => {
  const rows = inputCoverage({ f1: { benchmark: "Amul Probiotic buttermilk pouch" } });
  const b = rows.find((r) => r.field === "f1.benchmark");
  assert.ok(b);
  assert.equal(b.status, "pending");
  assert.match(b.reason || coverageInstruction(b), /Evaluate to assess this/);
});

check("benchmark is never needs-confirmation even when AI suggested", () => {
  const rows = inputCoverage({
    f1: { benchmark: "Amul Probiotic buttermilk pouch" },
    researchFindings: {
      autofillStatus: {
        "f1.benchmark": { aiSuggested: "Amul Probiotic buttermilk pouch" },
      },
    },
  });
  const b = rows.find((r) => r.field === "f1.benchmark");
  assert.equal(b.status, "pending");
  assert.notEqual(b.status, "needs-confirmation");
});

check("assessed benchmark is assessed", () => {
  const rows = inputCoverage({
    f1: { benchmark: "Amul" },
    researchFindings: {
      f1: {
        assessments: {
          benchmark: { status: "ok", raw: { relevance: "strong", source_url: "https://x.example" }, returnedSources: ["https://x.example"] },
        },
      },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.benchmark").status, "assessed");
});

check("failed benchmark shows failed with reason", () => {
  const rows = inputCoverage({
    f1: { benchmark: "Amul" },
    researchFindings: {
      f1: {
        assessments: {
          benchmark: { status: "failed", error: "The AI did not answer" },
        },
      },
    },
  });
  const b = rows.find((r) => r.field === "f1.benchmark");
  assert.equal(b.status, "failed");
  assert.match(b.reason, /AI did not answer/);
});

check("AI-written derivation waits for confirmation", () => {
  const rows = inputCoverage({
    f1: { gapDerivation: "AI wrote this derivation text" },
    researchFindings: {
      autofillStatus: {
        "f1.gapDerivation": { aiSuggested: "AI wrote this derivation text" },
      },
    },
  });
  const d = rows.find((r) => r.field === "f1.gapDerivation");
  assert.equal(d.status, "needs-confirmation");
  assert.match(d.reason || coverageInstruction(d), /Confirm or edit/);
});

check("confirmed AI derivation is pending assessment", () => {
  const rows = inputCoverage({
    f1: { gapDerivation: "AI wrote this derivation text" },
    researchFindings: {
      autofillStatus: {
        "f1.gapDerivation": { aiSuggested: "AI wrote this derivation text", confirmed: true },
      },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.gapDerivation").status, "pending");
});

check("person-edited AI text is pending not needs-confirmation", () => {
  const rows = inputCoverage({
    f1: { gapDerivation: "I edited this" },
    researchFindings: {
      autofillStatus: {
        "f1.gapDerivation": { aiSuggested: "AI original" },
      },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.gapDerivation").status, "pending");
});

check("declared gap is rule", () => {
  const rows = inputCoverage({ f1: { declaredGap: 3 } });
  assert.equal(rows.find((r) => r.field === "f1.declaredGap").status, "rule");
});

check("growth argument AI text needs confirmation", () => {
  const rows = inputCoverage({
    f1: { growthArgument: "AI argument text here" },
    researchFindings: {
      autofillStatus: { "f1.growthArgument": { aiSuggested: "AI argument text here" } },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.growthArgument").status, "needs-confirmation");
});

check("route AI text needs confirmation", () => {
  const rows = inputCoverage({
    f1: { growthRoute: "penetration" },
    researchFindings: {
      autofillStatus: { "f1.growthRoute": { aiSuggested: "penetration" } },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.growthRoute").status, "needs-confirmation");
});

check("attribute AI text needs confirmation", () => {
  const rows = inputCoverage({
    f1: { declaredAttribute: "prebiotic fibre" },
    researchFindings: {
      autofillStatus: { "f1.declaredAttribute": { aiSuggested: "prebiotic fibre" } },
    },
  });
  assert.equal(rows.find((r) => r.field === "f1.declaredAttribute").status, "needs-confirmation");
});

check("COGS typed is rule", () => {
  const rows = inputCoverage({ f2: { cogsAtScale: 12 } });
  assert.equal(rows.find((r) => r.field === "f2.cogsAtScale").status, "rule");
});

check("every filled field is listed", () => {
  const doc = {
    f1: {
      benchmark: "BrandX yoghurt drink",
      declaredGap: 3,
      gapDerivation: "Beats on fibre",
      growthArgument: "Category growing 12%",
      growthRoute: "penetration",
      declaredAttribute: "prebiotic",
    },
    f2: { cogsAtScale: 10, gstRatePct: 12, netMarginAtScale: 40 },
  };
  const rows = inputCoverage(doc);
  const fields = new Set(rows.map((r) => r.field));
  for (const f of [
    "f1.benchmark",
    "f1.declaredGap",
    "f1.gapDerivation",
    "f1.growthArgument",
    "f1.growthRoute",
    "f1.declaredAttribute",
    "f2.cogsAtScale",
    "f2.gstRatePct",
    "f2.netMarginAtScale",
  ]) {
    assert.ok(fields.has(f), `missing coverage for ${f}`);
  }
});

check("coverageInstruction pending", () => {
  assert.equal(coverageInstruction({ status: "pending" }), "Evaluate to assess this");
});

check("coverageInstruction failed", () => {
  assert.match(coverageInstruction({ status: "failed", reason: "timeout" }), /did not complete.*timeout.*Evaluate/i);
});

check("coverageInstruction needs-confirmation", () => {
  assert.match(coverageInstruction({ status: "needs-confirmation" }), /Confirm or edit/);
});

console.log(`PASS testInputCoverage (${checks} checks)`);
