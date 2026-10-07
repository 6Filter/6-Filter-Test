import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLocalGate } from "../lib/goNoGo.js";
import { mrpDiffersFromFormula, formulaMrpValue } from "../lib/f2Derived.js";
import { computeAllAdvisoryChecks, scoreAdvisoryChecks } from "../lib/propositionScoring.js";

const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import(
  "../lib/db.js"
);

const idea = {
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A cooling herbal stick packed inside a 100 ml hair-oil bottle.",
  submitterName: "Live Test",
  submitterDepartment: "NPD",
  division: "Personal Care",
  finalVerdict: "pass",
  finalVerdictNote: "keep this note",
  attachment: {
    name: "concept.pdf",
    mediaType: "application/pdf",
    data: "Y29uY2VwdA==",
  },
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha",
    declaredGap: "No stick format in the oil aisle",
    growthRoute: "premium",
    growthArgument: "Cooling is the claimed reason to switch",
    evidenceSourceDate: "https://example.com/hair-oil",
    evidenceSourceFile: {
      name: "source.csv",
      mediaType: "text/csv",
      data: "bm9uZQ==",
    },
  },
  f2: {
    cogsAtScale: 40,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "100ml",
    mrpInr: 99,
    qcomTrajectory: "stable",
  },
};

function scoreOf(doc) {
  const gate = applyLocalGate(doc);
  return {
    classification: gate.classification,
    pct: gate.score.pct,
    done: gate.score.done,
    total: gate.score.total,
    ideaScale: gate.ideaScale,
  };
}

const created = await createProposition();
try {
  const saved = await updateProposition(created.id, { ...created, ...idea });
  assert.equal(saved.name, idea.name);
  assert.equal(saved.f1.evidenceSourceFile.data, idea.f1.evidenceSourceFile.data);
  assert.equal(saved.attachment.data, idea.attachment.data);

  const gate = {
    classification: "NO-GO",
    rationale: "Same inputs must keep this score.",
    score: { pct: 42, done: 5, total: 12, byFilter: {} },
    ideaScale: "10g",
    ideaName: idea.name,
    category: idea.category,
    at: "2026-10-07T02:30:00.000Z",
  };
  const afterScoreWrite = await updateProposition(saved.id, { goNoGo: gate });
  assert.equal(afterScoreWrite.name, idea.name, "score-only write must keep the idea name");
  assert.equal(afterScoreWrite.category, idea.category);
  assert.equal(afterScoreWrite.ideaDescription, idea.ideaDescription);
  assert.equal(afterScoreWrite.submitterName, idea.submitterName);
  assert.equal(afterScoreWrite.division, idea.division);
  assert.equal(afterScoreWrite.finalVerdict, "pass");
  assert.equal(afterScoreWrite.finalVerdictNote, "keep this note");
  assert.equal(afterScoreWrite.f2.mrpInr, 99);
  assert.equal(afterScoreWrite.f2.cogsAtScale, 40);
  assert.equal(afterScoreWrite.f1.evidenceSourceFile.name, "source.csv");
  assert.equal(afterScoreWrite.f1.evidenceSourceFile.data, "bm9uZQ==");
  assert.equal(afterScoreWrite.attachment.name, "concept.pdf");
  assert.equal(afterScoreWrite.attachment.data, "Y29uY2VwdA==");
  assert.equal(afterScoreWrite.goNoGo.classification, "NO-GO");
  assert.equal(afterScoreWrite.goNoGo.score.pct, 42);

  const reloaded = await getPropositionById(created.id);
  assert.equal(reloaded.name, idea.name);
  assert.equal(reloaded.ideaDescription, idea.ideaDescription);
  assert.equal(reloaded.f1.benchmark, "Indulekha");
  assert.equal(reloaded.f1.evidenceSourceFile.data, "bm9uZQ==");
  assert.equal(reloaded.attachment.data, "Y29uY2VwdA==");
  assert.equal(reloaded.goNoGo.score.pct, 42);

  const cleared = await updateProposition(created.id, { name: "" });
  assert.equal(cleared.name, "", "an explicit empty name still clears");
  assert.equal(cleared.category, idea.category, "clearing the name must not clear the category");
  assert.equal(cleared.attachment.data, idea.attachment.data);

  const same = { ...idea, id: created.id };
  const first = scoreOf(same);
  const second = scoreOf(same);
  assert.deepEqual(second, first, "the same form values must score the same");

  const serverA = await computeAllAdvisoryChecks(same);
  const serverB = await computeAllAdvisoryChecks(same);
  assert.deepEqual(scoreAdvisoryChecks(serverB), scoreAdvisoryChecks(serverA));
  assert.equal(serverA.f2.checkLabel, serverB.f2.checkLabel);
  assert.equal(serverA.f3.checkLabel, serverB.f3.checkLabel);
} finally {
  await deleteProposition(created.id);
}

const typedMrp = {
  cogsAtScale: 40,
  netMarginAtScale: 22,
  gstRatePct: 18,
  mrpInr: 99,
};
const formula = formulaMrpValue(typedMrp);
assert.equal(formula, "60.51");
assert.equal(mrpDiffersFromFormula(typedMrp), true, "a typed MRP must not be treated as the formula");
assert.equal(
  mrpDiffersFromFormula({ ...typedMrp, mrpInr: formula }),
  false,
  "a stored formula MRP can still follow COGS / margin / GST"
);
assert.equal(mrpDiffersFromFormula({ ...typedMrp, mrpInr: "" }), false);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /mrpTouchedByHuman\.current = mrpDiffersFromFormula\(initial\?\.f2\)/);

console.log("PASS partial score write keeps the idea, and the same values score the same");
