/**
 * A verdict-only save must keep the idea. Same stored values must score the same twice.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

delete process.env.DATABASE_URL;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(tmpdir(), "primus-save-"));
process.chdir(work);

const { createProposition, getPropositionById, updateProposition } = await import(
  pathToFileURL(path.join(root, "lib/db.js")).href
);
const { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } = await import(
  pathToFileURL(path.join(root, "lib/propositionScoring.js")).href
);

const idea =
  "A herbal cooling hair oil stick for Indian households. Menthol cooling feel versus Parachute Advansed.";
const fields = {
  name: "Live Check partial save",
  category: "Hair oils",
  ideaDescription: idea,
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  attachment: {
    name: "qa-concept-card.csv",
    mediaType: "text/csv",
    data: Buffer.from("Category,Hair oils\n", "utf8").toString("base64"),
  },
  f1: {
    declaredAttribute: "Menthol cooling feel",
    benchmark: "Parachute Advansed",
    declaredGap: "3",
    forumVerdict: "",
    verdictNote: "",
  },
  f2: {
    gstRatePct: 18,
    cogsAtScale: 40,
    netMarginAtScale: 55,
    grammage: "10g",
    mrpInr: 99,
    qcomTrajectory: "Year 1 listing",
    forumVerdict: "",
    verdictNote: "",
  },
};

const created = await createProposition({ submitterDepartment: "NPD" });
const saved = await updateProposition(created.id, fields);
assert.equal(saved.name, fields.name);
assert.equal(saved.ideaDescription, idea);
assert.equal(saved.attachment?.name, "qa-concept-card.csv");
assert.equal(saved.f2.mrpInr, 99);

const goNoGo = {
  classification: "NO-GO",
  rationale: "Stored gate read.",
  score: { pct: 47, done: 7, total: 15, byFilter: {} },
  ideaScale: "10g",
  ideaName: fields.name,
  category: fields.category,
  at: "2026-10-01T02:00:00.000Z",
};
const afterVerdict = await updateProposition(created.id, { goNoGo });
assert.equal(afterVerdict.name, fields.name, "verdict write must keep the name");
assert.equal(afterVerdict.category, fields.category);
assert.equal(afterVerdict.ideaDescription, idea);
assert.equal(afterVerdict.submitterName, "Live Check");
assert.equal(afterVerdict.submitterDepartment, "NPD");
assert.equal(afterVerdict.attachment?.name, "qa-concept-card.csv");
assert.equal(afterVerdict.f1.benchmark, "Parachute Advansed");
assert.equal(afterVerdict.f1.declaredAttribute, "Menthol cooling feel");
assert.equal(afterVerdict.f2.gstRatePct, 18);
assert.equal(afterVerdict.f2.cogsAtScale, 40);
assert.equal(afterVerdict.f2.netMarginAtScale, 55);
assert.equal(afterVerdict.f2.grammage, "10g");
assert.equal(afterVerdict.f2.mrpInr, 99);
assert.equal(afterVerdict.goNoGo?.classification, "NO-GO");
assert.equal(afterVerdict.goNoGo?.score?.pct, 47);

const reloaded = await getPropositionById(created.id);
assert.equal(reloaded.name, fields.name);
assert.equal(reloaded.ideaDescription, idea);
assert.equal(reloaded.attachment?.name, "qa-concept-card.csv");
assert.equal(reloaded.f2.mrpInr, 99);
assert.equal(reloaded.goNoGo?.classification, "NO-GO");

const renamed = await updateProposition(created.id, { name: "Renamed only" });
assert.equal(renamed.name, "Renamed only");
assert.equal(renamed.ideaDescription, idea, "renaming must not drop the idea");
assert.equal(renamed.f2.mrpInr, 99);
assert.equal(renamed.goNoGo?.classification, "NO-GO");

async function settledScore(doc) {
  const checks = await computeAllAdvisoryChecks(doc);
  return {
    classification: computeGoNoGo(checks),
    pct: scoreAdvisoryChecks(checks).pct,
  };
}

const first = await settledScore(reloaded);
const second = await settledScore(reloaded);
assert.deepEqual(second, first, "same stored values must score the same twice");

const clone = await settledScore({
  ...reloaded,
  id: "other-id",
  goNoGo: { ...reloaded.goNoGo, at: "2026-10-02T00:00:00.000Z", score: { pct: 1 } },
});
assert.deepEqual(clone, first, "same field values must score the same even if the stored pct differs");

console.log(`PASS partial proposition save · ${first.classification} ${first.pct}%`);
