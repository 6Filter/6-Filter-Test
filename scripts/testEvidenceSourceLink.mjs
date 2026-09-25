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

  await updateProposition(created.id, {
    name: "Herbal cooling hair oil stick",
    category: "Hair oils",
    ideaDescription: "A herbal cooling stick inside a hair oil pack.",
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: "105.90" },
  });
  const gated = await updateProposition(created.id, {
    goNoGo: { classification: "NO-GO", score: { pct: 57, done: 4, total: 7 } },
  });
  assert.equal(gated.name, "Herbal cooling hair oil stick");
  assert.equal(gated.category, "Hair oils");
  assert.equal(gated.ideaDescription, "A herbal cooling stick inside a hair oil pack.");
  assert.equal(gated.f1.evidenceSourceFile.name, "note.xlsx");
  assert.equal(gated.f1.evidenceSourceFile.data, "dGVzdA==");
  assert.equal(gated.f2.cogsAtScale, 70);
  assert.equal(String(gated.f2.mrpInr), "105.90");
  assert.equal(gated.goNoGo.classification, "NO-GO");
  assert.equal(gated.goNoGo.score.pct, 57);
  const afterGate = await getPropositionById(created.id);
  assert.equal(afterGate.name, gated.name);
  assert.equal(afterGate.ideaDescription, gated.ideaDescription);
  assert.equal(afterGate.f1.evidenceSourceDate, "https://example.com/source");
  assert.equal(afterGate.f2.cogsAtScale, 70);
} finally {
  await deleteProposition(created.id);
}

console.log("PASS Evidence Source link + Word/PDF/Excel upload");
