/**
 * A verdict-only save must not blank the idea. The same stored values must
 * score the same way twice.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const { createProposition, deleteProposition, getPropositionById, initDb, isUsingPostgres, updateProposition } =
  await import("../lib/db.js");
const { computeAllAdvisoryChecks, computeGoNoGo, scoreAdvisoryChecks } = await import(
  "../lib/propositionScoring.js"
);

const propFile = new URL("../data/propositions.json", import.meta.url);
const backup = existsSync(propFile) ? readFileSync(propFile) : null;

const full = {
  name: "Partial save cooling stick",
  category: "Hair oils",
  ideaDescription: "A herbal cooling stick for the scalp.",
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  division: "Personal Care",
  attachment: {
    name: "qa-concept-card.csv",
    mediaType: "text/csv",
    data: Buffer.from("category,idea\nHair oils,cooling stick\n").toString("base64"),
  },
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Parachute coconut oil",
    declaredGap: "12",
    forumVerdict: "",
    verdictNote: "",
  },
  f2: {
    gstRatePct: 18,
    cogsAtScale: 40,
    netMarginAtScale: 55,
    grammage: "10g",
    mrpInr: 99,
    forumVerdict: "",
    verdictNote: "",
  },
  f3: { forumVerdict: "", verdictNote: "" },
  f4: { forumVerdict: "", verdictNote: "" },
  f5: { forumVerdict: "", verdictNote: "" },
  f6: { forumVerdict: "", verdictNote: "" },
};

function assertKept(row, label) {
  assert.equal(row.name, full.name, `${label} name`);
  assert.equal(row.category, full.category, `${label} category`);
  assert.equal(row.ideaDescription, full.ideaDescription, `${label} idea`);
  assert.equal(row.submitterName, full.submitterName, `${label} submitter`);
  assert.equal(row.division, full.division, `${label} division`);
  assert.equal(row.attachment?.name, full.attachment.name, `${label} attachment name`);
  assert.equal(row.attachment?.data, full.attachment.data, `${label} attachment bytes`);
  assert.equal(row.f1.declaredAttribute, "cooling", `${label} attribute`);
  assert.equal(row.f1.benchmark, full.f1.benchmark, `${label} benchmark`);
  assert.equal(Number(row.f2.gstRatePct), 18, `${label} GST`);
  assert.equal(Number(row.f2.cogsAtScale), 40, `${label} COGS`);
  assert.equal(Number(row.f2.netMarginAtScale), 55, `${label} margin`);
  assert.equal(row.f2.grammage, "10g", `${label} grammage`);
  assert.equal(Number(row.f2.mrpInr), 99, `${label} MRP`);
}

let createdId = null;
try {
  await initDb();
  assert.equal(isUsingPostgres(), false, "this regression must use the file store");
  const created = await createProposition({ submitterDepartment: "NPD" });
  createdId = created.id;
  const saved = await updateProposition(created.id, full);
  assertKept(saved, "full save");

  const go = {
    classification: "NO-GO",
    score: { pct: 73, done: 8, total: 11, byFilter: {} },
    ideaScale: "10g",
    ideaName: full.name,
    category: full.category,
    at: "2026-10-02T02:30:00.000Z",
  };
  const verdictOnly = await updateProposition(created.id, { goNoGo: go });
  assertKept(verdictOnly, "verdict-only save");
  assert.equal(verdictOnly.goNoGo.classification, "NO-GO");
  assert.equal(verdictOnly.goNoGo.score.pct, 73);

  const second = await updateProposition(created.id, { goNoGo: { ...go, at: "2026-10-02T02:31:00.000Z" } });
  const reloaded = await getPropositionById(created.id);
  assertKept(second, "second verdict save");
  assertKept(reloaded, "reload");
  assert.equal(reloaded.goNoGo.score.pct, 73);

  const checksA = await computeAllAdvisoryChecks(reloaded);
  const checksB = await computeAllAdvisoryChecks(reloaded);
  const scoreA = scoreAdvisoryChecks(checksA);
  const scoreB = scoreAdvisoryChecks(checksB);
  assert.deepEqual(scoreA, scoreB);
  assert.equal(computeGoNoGo(checksA), computeGoNoGo(checksB));
  assert.equal(scoreA.pct, scoreB.pct);

  const cleared = await updateProposition(created.id, { name: "", attachment: null });
  assert.equal(cleared.name, "");
  assert.equal(cleared.attachment, null);
  assert.equal(cleared.category, full.category, "clearing the name must keep the category");
  assert.equal(cleared.ideaDescription, full.ideaDescription);

  console.log(
    `PASS partial proposition save keeps the idea; same values score ${scoreA.pct}% ${computeGoNoGo(checksA)} twice`
  );
} finally {
  if (createdId) {
    try {
      await deleteProposition(createdId);
    } catch {
      /* restore below */
    }
  }
  if (backup == null) {
    /* leave the store as the test finished if there was no prior file */
  } else {
    writeFileSync(propFile, backup);
  }
}
