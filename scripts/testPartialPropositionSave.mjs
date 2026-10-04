import assert from "node:assert/strict";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";

const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import("../lib/db.js");

const full = {
  name: "Live Check partial save",
  category: "Hair oils",
  division: "Personal Care",
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  ideaDescription: "A herbal cooling hair oil stick that does not drip.",
  f1: {
    declaredAttribute: "Non-drip cooling feel",
    benchmark: "Parachute Advansed",
    declaredGap: 2,
    conceptCardName: "qa-concept-card.csv",
  },
  f2: {
    cogsAtScale: 40,
    netMarginAtScale: 55,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: "104.89",
  },
  f3: { marginElasticity: { minMrpInr: 80, maxMrpInr: 140 } },
  f4: { techShiftRisk: { dimensions: { format: { risk: "High", note: "Stick format" } } } },
  attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: "aGVsbG8=" },
};

async function scoreOf(doc) {
  const checks = await computeAllAdvisoryChecks(doc);
  const score = scoreAdvisoryChecks(checks);
  return {
    classification: computeGoNoGo(checks),
    pct: score.pct,
    f3: checks.f3?.checkLabel,
    f4: checks.f4?.checkLabel,
  };
}

const created = await createProposition({ submitterDepartment: "NPD" });
try {
  const saved = await updateProposition(created.id, full);
  assert.equal(saved.name, full.name);
  assert.equal(saved.f2.mrpInr, "104.89");
  assert.equal(saved.f3.marginElasticity.minMrpInr, 80);
  assert.equal(saved.attachment.name, "qa-concept-card.csv");
  const first = await scoreOf(saved);

  const verdictOnly = await updateProposition(created.id, {
    goNoGo: { classification: first.classification, score: { pct: first.pct }, ideaScale: "10g", at: "2026-10-04T00:00:00.000Z" },
  });
  assert.equal(verdictOnly.name, full.name, "verdict-only save must keep the name");
  assert.equal(verdictOnly.category, full.category);
  assert.equal(verdictOnly.ideaDescription, full.ideaDescription);
  assert.equal(verdictOnly.f1.conceptCardName, "qa-concept-card.csv");
  assert.equal(verdictOnly.f2.cogsAtScale, 40);
  assert.equal(verdictOnly.f2.mrpInr, "104.89");
  assert.equal(verdictOnly.f2.grammage, "10g");
  assert.equal(verdictOnly.f3.marginElasticity.maxMrpInr, 140);
  assert.equal(verdictOnly.attachment.data, "aGVsbG8=");
  assert.equal(verdictOnly.goNoGo.classification, first.classification);
  const afterVerdict = await getPropositionById(created.id);
  const verdictScore = await scoreOf(afterVerdict);
  assert.deepEqual(verdictScore, first, "stored score must match after the verdict-only save");

  const sameQuery = await updateProposition(created.id, {
    name: full.name,
    category: full.category,
    ideaDescription: full.ideaDescription,
    submitterName: full.submitterName,
    submitterDepartment: full.submitterDepartment,
    division: "Foods",
    f1: full.f1,
    f2: full.f2,
  });
  assert.equal(sameQuery.division, "Personal Care", "a later division value must not overwrite the locked division");
  assert.equal(sameQuery.f3.marginElasticity.minMrpInr, 80, "omitted Filter 3 must stay");
  assert.ok(sameQuery.f4.techShiftRisk.dimensions.format, "omitted Filter 4 must stay");
  assert.equal(sameQuery.attachment.name, "qa-concept-card.csv");
  assert.equal(sameQuery.goNoGo.classification, first.classification, "omitted verdict must stay");
  const second = await scoreOf(await getPropositionById(created.id));
  assert.deepEqual(second, first, "the same query must not change the score");

  const renamed = await updateProposition(created.id, { name: "Renamed stick" });
  assert.equal(renamed.name, "Renamed stick");
  assert.equal(renamed.f2.grammage, "10g");
  assert.equal(renamed.category, full.category);
} finally {
  await deleteProposition(created.id);
}

console.log("PASS partial proposition save keeps omitted fields and the same score");
