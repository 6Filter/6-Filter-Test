import assert from "node:assert/strict";
import {
  createProposition,
  deleteProposition,
  getPropositionById,
  mergePropositionPatch,
  updateProposition,
} from "../lib/db.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { scoreAdvisoryChecks } from "../lib/goNoGo.js";

const stored = {
  name: "Live Check cooling stick",
  category: "Hair oils",
  ideaDescription: "A menthol cooling stick that melts into a light hair oil.",
  finalVerdict: "pass",
  finalVerdictNote: "forum note",
  f1: { conceptCardName: "qa-concept-card.csv", declaredAttribute: "Cooling sensation", forumVerdict: "", verdictNote: "" },
  f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18, grammage: "10g", mrpInr: "104.89", forumVerdict: "", verdictNote: "" },
  f3: { forumVerdict: "", verdictNote: "" },
  f4: { forumVerdict: "", verdictNote: "" },
  f5: { forumVerdict: "", verdictNote: "" },
  f6: { forumVerdict: "", verdictNote: "" },
};

const verdictOnly = mergePropositionPatch(stored, {
  goNoGo: { classification: "NO-GO", score: { pct: 58 } },
});
assert.equal(verdictOnly.name, stored.name);
assert.equal(verdictOnly.category, stored.category);
assert.equal(verdictOnly.ideaDescription, stored.ideaDescription);
assert.equal(verdictOnly.finalVerdict, "pass");
assert.equal(verdictOnly.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(verdictOnly.f2.cogsAtScale, 40);
assert.equal(verdictOnly.f2.mrpInr, "104.89");
assert.equal(verdictOnly.f2.grammage, "10g");

const cleared = mergePropositionPatch(stored, { name: "" });
assert.equal(cleared.name, "");
assert.equal(cleared.category, stored.category);

const created = await createProposition({ submitterDepartment: "NPD" });
try {
  const saved = await updateProposition(created.id, {
    name: stored.name,
    category: stored.category,
    ideaDescription: stored.ideaDescription,
    submitterName: "Live Check",
    submitterDepartment: "NPD",
    division: "Personal Care",
    finalVerdict: "pass",
    finalVerdictNote: "forum note",
    attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: "Q2F0ZWdvcnk=" },
    f1: stored.f1,
    f2: stored.f2,
    f3: stored.f3,
    f4: stored.f4,
    f5: stored.f5,
    f6: stored.f6,
  });
  assert.equal(saved.name, stored.name);
  assert.equal(saved.f2.gstRatePct, 18);

  const afterVerdict = await updateProposition(created.id, {
    goNoGo: {
      classification: "NO-GO",
      rationale: "same inputs",
      score: { pct: 58, done: 7, total: 12 },
      ideaScale: "100g",
      at: "2026-10-06T00:00:00.000Z",
    },
  });
  assert.equal(afterVerdict.name, stored.name, "verdict-only save must keep the name");
  assert.equal(afterVerdict.category, stored.category);
  assert.equal(afterVerdict.ideaDescription, stored.ideaDescription);
  assert.equal(afterVerdict.submitterName, "Live Check");
  assert.equal(afterVerdict.attachment.name, "qa-concept-card.csv");
  assert.equal(afterVerdict.f1.conceptCardName, "qa-concept-card.csv");
  assert.equal(afterVerdict.f2.cogsAtScale, 40);
  assert.equal(afterVerdict.f2.netMarginAtScale, 55);
  assert.equal(afterVerdict.f2.gstRatePct, 18);
  assert.equal(afterVerdict.f2.grammage, "10g");
  assert.equal(afterVerdict.f2.mrpInr, "104.89");
  assert.equal(afterVerdict.finalVerdict, "pass");
  assert.equal(afterVerdict.goNoGo.classification, "NO-GO");
  assert.equal(afterVerdict.goNoGo.score.pct, 58);

  const loaded = await getPropositionById(created.id);
  assert.equal(loaded.name, stored.name);
  assert.equal(loaded.f2.mrpInr, "104.89");
  assert.equal(loaded.goNoGo.ideaScale, "100g");

  const firstChecks = await computeAllAdvisoryChecks(loaded);
  const secondChecks = await computeAllAdvisoryChecks(loaded);
  const firstScore = scoreAdvisoryChecks(firstChecks);
  const secondScore = scoreAdvisoryChecks(secondChecks);
  assert.deepEqual(secondScore, firstScore, "the same stored values must score the same way twice");
  assert.equal(firstScore.pct, secondScore.pct);
} finally {
  await deleteProposition(created.id);
}

console.log("PASS partial proposition save keeps fields and repeats the same score");
