/**
 * Part 139 F — the Inputs PDF and the Log Excel carry each field's role label.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { ROLE_LABEL, roleLabel } from "../lib/fieldRoles.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import {
  FIELD_LABEL_SHEET_NAME,
  FULL_EXPORT_COLUMNS,
  buildExportWorkbook,
  fieldLabelRows,
} from "../lib/logExport.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// ── Inputs PDF (source-level: it renders off-screen through html2canvas) ──
{
  const pdf = read("../src/exportInputsPdf.jsx");
  assert.match(pdf, /import \{ roleLabel \} from "\.\.\/lib\/fieldRoles\.js"/);
  assert.match(pdf, /role: roleLabel\(f\.key, doc\)/, "top fields get a role label");
  assert.match(pdf, /role: roleLabel\(`\$\{spec\.key\}\.\$\{f\.key\}`, doc\)/, "filter fields get a role label");
  assert.match(pdf, /Label: \{row\.role\}/, "the label is visible text next to each field");
  assert.match(pdf, /data-role-for=\{row\.path\}/);
  // No role words typed into the PDF source.
  for (const word of Object.values(ROLE_LABEL).filter((w) => /\s/.test(w))) {
    assert.ok(!pdf.includes(word), `PDF source must not hard-code "${word}"`);
  }
}

// ── Excel ──
{
  const src = read("../lib/logExport.js");
  assert.match(src, /from "\.\/fieldRoles\.js"/);
  assert.match(src, /roleLabel\(path, p\)/);

  const doc = emptyPropositionDoc("x");
  const rows = fieldLabelRows([doc]);
  assert.ok(rows.length >= 30, `a Label for each field column (${rows.length})`);
  const byCol = Object.fromEntries(rows.map((r) => [r.Column, r.Label]));
  assert.equal(byCol.name, ROLE_LABEL.required);
  assert.equal(byCol.submitterDepartment, ROLE_LABEL.required);
  assert.equal(byCol["f1.declaredGap"], ROLE_LABEL.scored);
  assert.equal(byCol["f1.declaredAttribute2"], ROLE_LABEL.optional);
  assert.equal(byCol["f2.cogsAtScale"], ROLE_LABEL["needed-for-verdict"]);
  assert.equal(byCol["f1.pureCommodity"], ROLE_LABEL["changes-checks"]);
  assert.equal(byCol["f5.trialRatePct"], ROLE_LABEL["not-in-score"]);
  // Columns that are aliases of a form box still get its label.
  assert.equal(byCol["f1.evidenceSourceLink"], roleLabel("f1.evidenceSourceDate", doc));
  assert.equal(byCol["f5.cmiSigned"], roleLabel("f5.cmiHeadSigned", doc));
  assert.equal(byCol["f6.labGap"], roleLabel("f6.labGapVsBenchmark", doc));
  // Result-only columns have no role, so no label.
  assert.ok(!("classification" in byCol));
  assert.ok(!("f1.narrative" in byCol));
  for (const r of rows) assert.ok(FULL_EXPORT_COLUMNS.includes(r.Column));

  // Ideas that disagree show both (Benchmark under a New market route).
  const nm = { ...doc, f1: { ...doc.f1, growthRoute: "new-market" } };
  const both = Object.fromEntries(fieldLabelRows([doc, nm]).map((r) => [r.Column, r.Label]));
  assert.equal(both["f1.benchmark"], `${ROLE_LABEL.scored} / ${ROLE_LABEL.optional}`);

  const book = buildExportWorkbook([doc, nm]);
  assert.deepEqual(book.SheetNames, ["Propositions", FIELD_LABEL_SHEET_NAME]);
  const parsed = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const sheet = XLSX.utils.sheet_to_json(parsed.Sheets[FIELD_LABEL_SHEET_NAME]);
  assert.ok(sheet.length >= 30);
  assert.deepEqual(Object.keys(sheet[0]), ["Column", "Label"], "a Label column");
  assert.equal(sheet.find((r) => r.Column === "f1.declaredGap").Label, ROLE_LABEL.scored);
  // The data sheet is untouched: one row per idea.
  assert.equal(XLSX.utils.sheet_to_json(parsed.Sheets.Propositions).length, 2);
  // An empty export still builds both sheets.
  assert.deepEqual(buildExportWorkbook([]).SheetNames, ["Propositions", FIELD_LABEL_SHEET_NAME]);
}

console.log("PASS testFieldLabelsExport");
