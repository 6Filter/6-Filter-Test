import assert from "node:assert/strict";
import {
  computeAllAdvisoryChecks,
  computeGoNoGo,
  scoreAdvisoryChecks,
} from "../lib/propositionScoring.js";
import {
  createProposition,
  deleteProposition,
  getPropositionById,
  updateProposition,
} from "../lib/db.js";

const created = await createProposition({ submitterDepartment: "NPD" });

const full = {
  name: "Keep me cooling stick",
  category: "Hair oils",
  division: "Personal Care",
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  ideaDescription: "A herbal cooling stick for the scalp, 10g, sold beside hair oil.",
  attachment: {
    name: "qa-concept-card.csv",
    mediaType: "text/csv",
    data: "Q29uY2VwdA==",
  },
  finalVerdictNote: "forum note",
  f1: {
    declaredAttribute: "cooling feel",
    benchmark: "Parachute coconut oil",
    declaredGap: "15",
    conceptCardName: "qa-concept-card.csv",
  },
  f2: {
    cogsAtScale: 40,
    netMarginAtScale: 55,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: "99",
    qcomTrajectory: "Take-rate stays near today's level over three years.",
  },
};

try {
  await updateProposition(created.id, full);
  const goNoGo = {
    classification: "NO-GO",
    rationale: "Filter 4 is below the floor.",
    score: { pct: 53, done: 8, total: 15, byFilter: {} },
    ideaScale: "100g",
    ideaName: full.name,
    category: full.category,
    checkLabels: { f1: "Cleared", f2: "Cleared", f3: "Cleared", f4: "Below floor" },
    at: "2026-10-03T00:00:00.000Z",
  };

  const afterVerdict = await updateProposition(created.id, { goNoGo });
  assert.equal(afterVerdict.name, full.name);
  assert.equal(afterVerdict.category, full.category);
  assert.equal(afterVerdict.ideaDescription, full.ideaDescription);
  assert.equal(afterVerdict.attachment?.name, full.attachment.name);
  assert.equal(afterVerdict.attachment?.data, full.attachment.data);
  assert.equal(afterVerdict.f1.declaredAttribute, "cooling feel");
  assert.equal(afterVerdict.f1.conceptCardName, "qa-concept-card.csv");
  assert.equal(afterVerdict.f2.gstRatePct, 18);
  assert.equal(String(afterVerdict.f2.cogsAtScale), "40");
  assert.equal(String(afterVerdict.f2.netMarginAtScale), "55");
  assert.equal(afterVerdict.f2.grammage, "10g");
  assert.equal(String(afterVerdict.f2.mrpInr), "99");
  assert.equal(afterVerdict.goNoGo.classification, "NO-GO");
  assert.equal(afterVerdict.goNoGo.score.pct, 53);
  assert.equal(afterVerdict.finalVerdictNote, "forum note");

  const loaded = await getPropositionById(created.id);
  assert.equal(loaded.name, full.name);
  assert.equal(loaded.ideaDescription, full.ideaDescription);
  assert.equal(loaded.attachment?.name, full.attachment.name);
  assert.equal(loaded.f2.grammage, "10g");
  assert.equal(loaded.goNoGo.score.pct, 53);

  const again = await updateProposition(created.id, { goNoGo });
  assert.equal(again.name, full.name);
  assert.equal(again.goNoGo.score.pct, 53);
  assert.equal(again.goNoGo.ideaScale, "100g");

  const checksA = await computeAllAdvisoryChecks(loaded);
  const checksB = await computeAllAdvisoryChecks(loaded);
  const scoreA = scoreAdvisoryChecks(checksA);
  const scoreB = scoreAdvisoryChecks(checksB);
  assert.equal(scoreA.pct, scoreB.pct);
  assert.equal(computeGoNoGo(checksA), computeGoNoGo(checksB));

  const cleared = await updateProposition(created.id, { name: "" });
  assert.equal(cleared.name, "");
  assert.equal(cleared.category, full.category);
  assert.equal(cleared.ideaDescription, full.ideaDescription);
  assert.equal(cleared.f2.gstRatePct, 18);
  assert.equal(cleared.goNoGo.classification, "NO-GO");
} finally {
  await deleteProposition(created.id);
}

console.log("PASS partial proposition save keeps fields and the same score");
