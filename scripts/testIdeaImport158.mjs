/**
 * Part 158 — the upload template carries every typed box from Filter 1 to Filter 4: the Filter 3 yearly price rise
 * and, for each of the seven Filter 4 points, "your rating" (Low / Medium / High) and "your view".
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

let n = 0;
async function check(name, fn) {
  try {
    await fn();
    n += 1;
    console.log(`  ok ${n} — ${name}`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

const imp = await import("../lib/ideaImport.js");
const { IMPORT_FIELDS, IMPORT_PATHS, coerceFieldValue, fieldsToDoc, importColumnHeader, pathForHeader, buildImportTemplateBuffer, parseSpreadsheetImport } = imp;
const { TECH_SHIFT_DIMENSIONS, DIMENSION_LABELS } = await import("../lib/techShiftRisk.js");
const { buildExportWorkbook, flattenProposition } = await import("../lib/logExport.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");

await check("the template runs Filter 1, 2, 3, 4 in form order and ends with Filter 4's seven points", () => {
  const filters = IMPORT_PATHS.map((p) => (p.match(/^f(\d)\./) || [])[1] || "0");
  const order = filters.map(Number);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "columns never go back to an earlier filter");
  assert.ok(IMPORT_PATHS.includes("f3.plannedAnnualIncreasePct"));
  for (const k of TECH_SHIFT_DIMENSIONS) {
    assert.ok(IMPORT_PATHS.includes(`f4.userInputs.${k}.rating`), `${k} rating`);
    assert.ok(IMPORT_PATHS.includes(`f4.userInputs.${k}.pov`), `${k} view`);
  }
  assert.equal(IMPORT_PATHS.length, 39);
  for (const k of TECH_SHIFT_DIMENSIONS) assert.ok(IMPORT_PATHS.includes(`f4.f4MitigationResponses.${k}`), `${k} response`);
});

await check("a rating is read as Low, Medium or High; anything else is left out with a warning", () => {
  const p = "f4.userInputs.userHabitShiftPotential.rating";
  assert.equal(coerceFieldValue(p, "low").value, "Low");
  assert.equal(coerceFieldValue(p, " MEDIUM ").value, "Medium");
  assert.equal(coerceFieldValue(p, "High").value, "High");
  assert.equal(coerceFieldValue(p, "med").value, "Medium");
  const bad = coerceFieldValue(p, "very risky");
  assert.equal(bad.value, undefined);
  assert.match(bad.warning, /not Low, Medium or High/);
});

await check("the yearly price rise reads 5, 5% and a %-formatted 0.05 as 5", () => {
  assert.equal(coerceFieldValue("f3.plannedAnnualIncreasePct", 5).value, 5);
  assert.equal(coerceFieldValue("f3.plannedAnnualIncreasePct", "5%").value, 5);
  assert.equal(coerceFieldValue("f3.plannedAnnualIncreasePct", 0.05).value, 5);
});

await check("Filter 4 columns become f4.userInputs.<point> = { rating, pov }, the way the form stores them", () => {
  const doc = fieldsToDoc({
    name: "X",
    "f4.userInputs.functionalCoreStability.rating": "Low",
    "f4.userInputs.functionalCoreStability.pov": "Core is stable",
    "f4.userInputs.purchaseFrequencyShift.pov": "View only, no rating",
  });
  assert.equal(doc.name, "X");
  assert.equal(doc.f4.userInputs.functionalCoreStability.rating, "Low");
  assert.equal(doc.f4.userInputs.functionalCoreStability.pov, "Core is stable");
  assert.equal(doc.f4.userInputs.purchaseFrequencyShift.rating, "");
  assert.equal(doc.f4.userInputs.purchaseFrequencyShift.pov, "View only, no rating");
  assert.ok(doc.f4.userInputs.functionalCoreStability.at, "stamped like a typed entry");
  assert.equal(fieldsToDoc({ name: "Y" }).f4, undefined, "no Filter 4 columns, no f4 in the draft");
  const withResp = fieldsToDoc({ "f4.f4MitigationResponses.userHabitShiftPotential": "Switch to sachets" });
  assert.deepEqual(withResp.f4.f4MitigationResponses, { userHabitShiftPotential: "Switch to sachets" }, "responses are stored the way the form stores them");
});

await check("headers are plain: '<point> — your rating' / '— your view', and each is recognised on upload", () => {
  for (const k of TECH_SHIFT_DIMENSIONS) {
    const label = DIMENSION_LABELS[k];
    assert.equal(importColumnHeader(`f4.userInputs.${k}.rating`), `${label} — your rating`);
    assert.equal(pathForHeader(`${label} — your view`), `f4.userInputs.${k}.pov`);
    assert.equal(pathForHeader(`${label} rating`), `f4.userInputs.${k}.rating`);
    assert.equal(importColumnHeader(`f4.f4MitigationResponses.${k}`), `${label} — your response to the risk`);
    assert.equal(pathForHeader(`${label} mitigation`), `f4.f4MitigationResponses.${k}`);
  }
  assert.deepEqual(imp.ALIAS_CONFLICTS, []);
});

await check("the rating columns have a Low / Medium / High drop-down; the view columns do not", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildImportTemplateBuffer());
  const ws = wb.getWorksheet("Ideas");
  IMPORT_FIELDS.forEach((f, i) => {
    const dv = ws.getCell(3, i + 1).dataValidation;
    if (f.type === "risk") {
      assert.equal(dv?.type, "list", `${f.path} is a drop-down`);
      assert.match(String(dv.formulae[0]), /Low,Medium,High/);
    } else if (/\.pov$|MitigationResponses/.test(f.path)) {
      assert.ok(!dv, `${f.path} is free text`);
    }
  });
  const guide = wb.getWorksheet("Guide");
  const text = [];
  guide.eachRow((r) => text.push(r.values.slice(1).join("|")));
  assert.match(text.join("\n"), /Filter 4 has your rating/);
  assert.match(text.join("\n"), /Functional core stability — your rating\|Optional/);
});

await check("a Log export carries the same columns, so an exported idea uploads back with its Filter 3 and 4 answers", async () => {
  const doc = emptyPropositionDoc("e1");
  doc.name = "Round trip";
  doc.category = "Hair oils";
  doc.ideaDescription = "A cooling oil.";
  doc.f3.plannedAnnualIncreasePct = 6;
  doc.f4.userInputs = {
    functionalCoreStability: { rating: "Low", pov: "Core is stable", at: null },
    adjacentSubstitutionThreat: { rating: "High", pov: "Ready-mix sachets", at: null },
  };
  doc.f4.f4MitigationResponses = { adjacentSubstitutionThreat: "Launch our own sachet" };
  const flat = flattenProposition(doc);
  assert.equal(flat["f3.plannedAnnualIncreasePct"], 6);
  assert.equal(flat["f4.userInputs.adjacentSubstitutionThreat.rating"], "High");
  const buf = XLSX.write(buildExportWorkbook([doc]), { type: "buffer", bookType: "xlsx" });
  const out = await parseSpreadsheetImport(Buffer.from(buf), "log.xlsx");
  assert.equal(out.ideas.length, 1);
  const f = out.ideas[0].fields;
  assert.equal(f["f3.plannedAnnualIncreasePct"], 6);
  assert.equal(f["f4.userInputs.functionalCoreStability.pov"], "Core is stable");
  assert.equal(f["f4.userInputs.adjacentSubstitutionThreat.rating"], "High");
  assert.equal(f["f4.f4MitigationResponses.adjacentSubstitutionThreat"], "Launch our own sachet");
  assert.equal(f["f4.userInputs.purchaseFrequencyShift.rating"], undefined, "an untouched point stays empty");
});

console.log(`PASS Part 158 template through Filter 4 (${n} checks)`);
process.exit(0);
