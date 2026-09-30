/**
 * Saving a score must not blank the idea. A goNoGo-only write used to clear
 * name, description, filters, and uploads.
 */
import assert from "node:assert/strict";
import { createProposition, deleteProposition, getPropositionById, updateProposition } from "../lib/db.js";
import { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } from "../lib/propositionScoring.js";

const created = await createProposition();
try {
  const saved = await updateProposition(created.id, {
    name: "Keep me",
    category: "Snacks",
    ideaDescription: "Roasted millet chips must survive a score save",
    submitterName: "Live Check",
    submitterDepartment: "NPD",
    division: "Foods",
    f1: {
      benchmark: "Too Yumm",
      declaredAttribute: "crunchier bite",
      declaredGap: 3,
      evidenceSourceFile: { name: "e.pdf", mediaType: "application/pdf", data: "QQ==" },
    },
    f2: {
      cogsAtScale: 12,
      netMarginAtScale: 18,
      gstRatePct: 18,
      mrpInr: "17.27",
      grammage: "40g",
    },
  });
  assert.equal(saved.name, "Keep me");

  const scored = await updateProposition(created.id, {
    goNoGo: {
      classification: "WATCH",
      score: { pct: 42, done: 4, total: 10 },
      at: "2026-09-30T00:00:00.000Z",
    },
  });
  assert.equal(scored.name, "Keep me");
  assert.equal(scored.ideaDescription, "Roasted millet chips must survive a score save");
  assert.equal(scored.category, "Snacks");
  assert.equal(scored.division, "Foods");
  assert.equal(scored.submitterName, "Live Check");
  assert.equal(scored.f1.benchmark, "Too Yumm");
  assert.equal(scored.f1.evidenceSourceFile.name, "e.pdf");
  assert.equal(scored.f1.evidenceSourceFile.data, "QQ==");
  assert.equal(scored.f2.cogsAtScale, 12);
  assert.equal(scored.f2.mrpInr, "17.27");
  assert.equal(scored.goNoGo.classification, "WATCH");

  const loaded = await getPropositionById(created.id);
  assert.equal(loaded.name, "Keep me");
  assert.equal(loaded.ideaDescription, "Roasted millet chips must survive a score save");
  assert.equal(loaded.f1.evidenceSourceFile.data, "QQ==");
  assert.equal(loaded.goNoGo.score.pct, 42);

  const cleared = await updateProposition(created.id, { name: "" });
  assert.equal(cleared.name, "");
  assert.equal(cleared.ideaDescription, "Roasted millet chips must survive a score save");
  assert.equal(cleared.f2.grammage, "40g");

  const doc = {
    name: "Keep me",
    category: "Snacks",
    division: "Foods",
    ideaDescription: "Roasted millet chips must survive a score save",
    f1: saved.f1,
    f2: saved.f2,
    f3: {},
    f4: {},
    f5: {},
    f6: {},
  };
  const firstChecks = await computeAllAdvisoryChecks(doc);
  const secondChecks = await computeAllAdvisoryChecks(doc);
  const first = { classification: computeGoNoGo(firstChecks), score: scoreAdvisoryChecks(firstChecks) };
  const second = { classification: computeGoNoGo(secondChecks), score: scoreAdvisoryChecks(secondChecks) };
  assert.deepEqual(second, first);
  assert.equal(typeof first.score.pct, "number");
} finally {
  await deleteProposition(created.id);
}

console.log("PASS proposition score save keeps the idea, and the same fields score once");
