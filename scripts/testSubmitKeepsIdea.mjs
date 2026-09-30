import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const { createProposition, deleteProposition, getPropositionById, setPropositionGoNoGo, updateProposition } =
  await import("../lib/db.js");
const { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } = await import(
  "../lib/propositionScoring.js"
);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(apiSrc, /setPropositionGoNoGo\(targetId, advisory\.proposition\.goNoGo\)/);
assert.doesNotMatch(apiSrc, /updateProposition\(targetId,\s*\{\s*goNoGo:/);
assert.match(
  dbSrc,
  /UPDATE propositions SET go_nogo_json = \$2, updated_at = NOW\(\) WHERE id = \$1/
);

const created = await createProposition({ submitterDepartment: "NPD" });
const id = created.id;
try {
  await updateProposition(
    id,
    {
      name: "Keep me",
      category: "Hair oils",
      ideaDescription: "A herbal cooling stick sealed inside the bottle.",
      submitterName: "Primus QA Probe",
      submitterDepartment: "NPD",
      f1: { declaredAttribute: "cooling feel on the scalp", benchmark: "Indulekha", declaredGap: 2.5 },
      f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, grammage: "100ml", mrpInr: 121 },
      f5: {
        householdsReachedY3Mn: 0.5,
        trialRatePct: 10,
        repeatConversionPct: 50,
        purchaseFrequencyYr: 4,
        avgPackValueInr: 50,
      },
    },
    { bumpVersion: false }
  );

  const verdict = {
    classification: "NO-GO",
    rationale: "Net margin is below the floor.",
    score: { done: 6, total: 13, pct: 47, byFilter: {} },
    ideaScale: "10g",
    ideaName: "Keep me",
    category: "Hair oils",
    checkLabels: { f1: "Cleared", f2: "Below floor", f3: "Below floor", f4: "Below floor" },
    at: "2026-09-30T00:00:00.000Z",
  };

  const saved = await setPropositionGoNoGo(id, verdict);
  assert.equal(saved.name, "Keep me");
  assert.equal(saved.category, "Hair oils");
  assert.equal(saved.ideaDescription, "A herbal cooling stick sealed inside the bottle.");
  assert.equal(saved.f1.declaredAttribute, "cooling feel on the scalp");
  assert.equal(Number(saved.f2.cogsAtScale), 70);
  assert.equal(Number(saved.f2.mrpInr), 121);
  assert.equal(saved.f2.grammage, "100ml");
  assert.equal(saved.goNoGo.classification, "NO-GO");
  assert.equal(saved.goNoGo.score.pct, 47);
  assert.equal(saved.goNoGo.ideaScale, "10g");

  const partial = await updateProposition(id, {
    goNoGo: { ...verdict, score: { ...verdict.score, pct: 47 } },
  });
  assert.equal(partial.name, "Keep me", "a verdict-only update must not blank the name");
  assert.equal(partial.category, "Hair oils");
  assert.equal(partial.ideaDescription, "A herbal cooling stick sealed inside the bottle.");
  assert.equal(partial.f1.benchmark, "Indulekha");
  assert.equal(Number(partial.f2.netMarginAtScale), 22);
  assert.equal(Number(partial.f5.householdsReachedY3Mn), 0.5);
  assert.equal(partial.goNoGo.score.pct, 47);

  const reloaded = await getPropositionById(id);
  assert.equal(reloaded.name, "Keep me");
  assert.equal(reloaded.goNoGo.score.pct, 47);

  const first = await computeAllAdvisoryChecks(reloaded);
  const second = await computeAllAdvisoryChecks(reloaded);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(scoreAdvisoryChecks(first).pct, scoreAdvisoryChecks(second).pct);
  assert.equal(computeGoNoGo(first), computeGoNoGo(second));
} finally {
  await deleteProposition(id);
}

console.log("PASS submit keeps the idea and the same values score the same");
