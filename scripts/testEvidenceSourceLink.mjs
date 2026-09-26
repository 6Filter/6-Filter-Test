import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { filterSidebarCount } from "../lib/formProgress.js";
import { canWriteField, fieldOwners } from "../lib/fieldOwnership.js";

const f1 = SIX_FILTERS_FORM.find((s) => s.key === "f1");
const field = f1.fields.find((f) => f.key === "evidenceSourceDate");
assert.equal(field.label, "Evidence Source link");
assert.equal(field.placeholder, "https://…");
assert.equal(field.fileKey, "evidenceSourceFile");
assert.match(field.fileAccept, /xlsx/);
assert.match(field.helper, /no market-research study required/i);
assert.doesNotMatch(field.label, /date/i);

assert.deepEqual(fieldOwners("evidenceSourceFile"), ["CMI"]);
assert.equal(canWriteField("CMI", "evidenceSourceFile"), true);
assert.equal(canWriteField("BM", "evidenceSourceFile"), false);

assert.equal(
  filterSidebarCount("f1", { f1: { evidenceSourceDate: "https://example.com/note" } }).have >= 1,
  true
);
const viaFile = filterSidebarCount("f1", { f1: { evidenceSourceFile: { name: "source.xlsx", data: "xx" } } });
const empty = filterSidebarCount("f1", { f1: {} });
assert.ok(viaFile.have > empty.have, "an uploaded source file counts as evidence");

assert.equal(field.fileLabel, "Upload source file (Word, PDF, or Excel)");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /handleEvidenceSourceFile/);
assert.match(formSrc, /allowExcel: true/);
assert.match(formSrc, /field\.fileKey/);
assert.match(formSrc, /conceptCardName: savedName/);
assert.doesNotMatch(formSrc, /Evidence source & date/);
assert.doesNotMatch(formSrc, /U&A 2026 \/ tracker wave/);

const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const created = await createProposition();
try {
  const saved = await updateProposition(created.id, {
    ...created,
    f1: {
      ...(created.f1 || {}),
      evidenceSourceDate: "https://example.com/source",
      evidenceSourceFile: {
        name: "note.xlsx",
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: "dGVzdA==",
      },
    },
  });
  assert.equal(saved.f1.evidenceSourceDate, "https://example.com/source");
  assert.equal(saved.f1.evidenceSourceFile.name, "note.xlsx");
  const loaded = await getPropositionById(created.id);
  assert.equal(loaded.f1.evidenceSourceDate, "https://example.com/source");
  assert.equal(loaded.f1.evidenceSourceFile.name, "note.xlsx");
  assert.equal(loaded.f1.evidenceSourceFile.data, "dGVzdA==");

  const named = await updateProposition(created.id, {
    name: "Herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "Cooling hair oil, 100 ml.",
    submitterName: "Live Check",
    submitterDepartment: "NPD",
    f2: { cogsAtScale: "70", netMarginAtScale: "22", gstRatePct: 18, mrpInr: "105.90" },
  });
  assert.equal(named.name, "Herbal cooling hair oil");
  assert.equal(named.f1.evidenceSourceFile.name, "note.xlsx");

  const scoredOnly = await updateProposition(created.id, {
    goNoGo: { classification: "NO-GO", score: { pct: 57, done: 8, total: 14 } },
  });
  assert.equal(scoredOnly.name, "Herbal cooling hair oil");
  assert.equal(scoredOnly.category, "Hair oils");
  assert.equal(scoredOnly.ideaDescription, "Cooling hair oil, 100 ml.");
  assert.equal(scoredOnly.submitterName, "Live Check");
  assert.equal(scoredOnly.f2.cogsAtScale, "70");
  assert.equal(scoredOnly.f2.mrpInr, "105.90");
  assert.equal(scoredOnly.f1.evidenceSourceFile.name, "note.xlsx");
  assert.equal(scoredOnly.f1.evidenceSourceFile.data, "dGVzdA==");
  assert.equal(scoredOnly.goNoGo.classification, "NO-GO");
  assert.equal(scoredOnly.goNoGo.score.pct, 57);

  const reread = await getPropositionById(created.id);
  assert.equal(reread.name, "Herbal cooling hair oil");
  assert.equal(reread.f2.cogsAtScale, "70");
  assert.equal(reread.goNoGo.score.pct, 57);
} finally {
  await deleteProposition(created.id);
}

console.log("PASS Evidence Source link + Word/PDF/Excel upload");
