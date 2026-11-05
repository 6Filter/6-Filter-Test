import assert from "node:assert/strict";
import { migrateGarbledAssessments } from "../lib/assessmentResult.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

check("garbled none → failed", () => {
  const findings = {
    f1: {
      assessments: {
        benchmark: {
          raw: { relevance: "none" },
          returnedSources: ["https://x.example"],
        },
      },
      benchmarkVerified: false,
    },
    score: { total: 72 },
  };
  const next = migrateGarbledAssessments(findings);
  assert.notEqual(next, findings);
  assert.equal(next.f1.assessments.benchmark.status, "failed");
  assert.match(next.f1.assessments.benchmark.error, /could not be read/i);
});

check("ok status unchanged", () => {
  const ok = {
    status: "ok",
    raw: { relevance: "strong", reason: "leader" },
    returnedSources: [],
  };
  const findings = { f1: { assessments: { benchmark: ok } } };
  assert.equal(migrateGarbledAssessments(findings), findings);
});

check("score fields untouched", () => {
  const findings = {
    score: { total: 88, filters: { f1: 20 } },
    f1: {
      assessments: {
        derivation: { raw: { relevance: "none" } },
      },
    },
  };
  const next = migrateGarbledAssessments(findings);
  assert.equal(next.score.total, 88);
  assert.equal(next.score.filters.f1, 20);
});

console.log(`PASS testPart137Migration (${checks} checks)`);
