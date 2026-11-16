/**
 * Part 141 D — idea import polish: multi-column Q&A sheets, friendly aliases, an untouched template is
 * refused with a clear 400, formula / pack-size warnings, and per-field sources.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  EXAMPLE_NAME,
  NOTHING_TO_IMPORT_MESSAGE,
  buildImportTemplateBuffer,
  importIdeasFromAttachment,
  parseSpreadsheetImport,
  pathForHeader,
} from "../lib/ideaImport.js";

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

async function sheetBuffer(rows, name = "Ideas") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  rows.forEach((r, i) => r.forEach((v, c) => {
    if (v !== null && v !== undefined) ws.getCell(i + 1, c + 1).value = v;
  }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const attach = (buf, name = "ideas.xlsx") => ({
  attachment: {
    name,
    data: buf.toString("base64"),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});

await check("Parity / Why will it grow / Pack aliases resolve", () => {
  assert.equal(pathForHeader("Parity"), "f1.parityExceptions");
  assert.equal(pathForHeader("Why will it grow"), "f1.growthArgument");
  assert.equal(pathForHeader("Why will it grow?"), "f1.growthArgument");
  assert.equal(pathForHeader("Pack"), "f2.grammage");
});

await check("multi-column Q&A sheet imports one idea per answer column", async () => {
  const buf = await sheetBuffer([
    ["Field", "Idea A", "Idea B", "Idea C"],
    ["Name", "Cooling hair oil", "Protein bar", "Face wash"],
    ["Category", "Hair oils", "Snacks", "Skin care"],
    ["Parity", "Fragrance may be weaker", "Taste may be chalkier", null],
    ["Why will it grow", "Summer lift pulls new buyers", "Gym habit spreads", "Urban teens"],
    ["Pack", "100 ml", "60 g", "50 ml"],
  ]);
  const parsed = await parseSpreadsheetImport(buf, "qa.xlsx");
  assert.equal(parsed.layout, "qa");
  assert.equal(parsed.ideas.length, 3, "three ideas from three answer columns");
  const [a, b, c] = parsed.ideas;
  assert.equal(a.fields.name, "Cooling hair oil");
  assert.equal(b.fields.name, "Protein bar");
  assert.equal(c.fields.name, "Face wash");
  assert.equal(a.fields["f1.parityExceptions"], "Fragrance may be weaker");
  assert.equal(b.fields["f1.growthArgument"], "Gym habit spreads");
  assert.equal(c.fields["f2.grammage"], "50 ml");
  assert.equal(c.fields["f1.parityExceptions"], undefined, "empty answer stays empty");
  assert.deepEqual([a.column, b.column, c.column], ["B", "C", "D"]);

  // Same through the public import entry point.
  const imported = await importIdeasFromAttachment(attach(buf));
  assert.equal(imported.ideas.length, 3);
  assert.equal(imported.usedAi, false);
});

await check("an untouched template (EXAMPLE row only) throws 400 with a clear message", async () => {
  const template = await buildImportTemplateBuffer();
  await assert.rejects(
    () => importIdeasFromAttachment(attach(template, "Primus-idea-import-template.xlsx")),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, NOTHING_TO_IMPORT_MESSAGE);
      assert.match(err.message, /only has the example row/i);
      return true;
    }
  );
  // The example row really is skipped.
  const parsed = await parseSpreadsheetImport(template, "t.xlsx");
  assert.equal(parsed.ideas.length, 0);
  assert.ok(parsed.examplesSkipped >= 1);
  assert.equal(EXAMPLE_NAME, "EXAMPLE");
});

await check("a formula-looking text cell is kept as plain text with a warning", async () => {
  const buf = await sheetBuffer([
    ["Name", "Category", "Pack"],
    ["=HYPERLINK(\"http://evil\",\"x\")", "Hair oils", "100 ml"],
  ]);
  const parsed = await parseSpreadsheetImport(buf, "f.xlsx");
  assert.equal(parsed.ideas.length, 1);
  const idea = parsed.ideas[0];
  assert.ok(String(idea.fields.name).startsWith("="), "text is stored exactly as typed");
  assert.ok(
    idea.warnings.some((w) => /plain text, never run as a formula/i.test(w)),
    `warnings: ${JSON.stringify(idea.warnings)}`
  );
});

await check("a pack size without a unit warns but is still stored", async () => {
  const buf = await sheetBuffer([
    ["Name", "Category", "Pack"],
    ["Cooling hair oil", "Hair oils", "100"],
    ["Protein bar", "Snacks", "60 g"],
  ]);
  const parsed = await parseSpreadsheetImport(buf, "p.xlsx");
  assert.equal(parsed.ideas.length, 2);
  const [noUnit, withUnit] = parsed.ideas;
  assert.equal(noUnit.fields["f2.grammage"], "100", "value kept");
  assert.ok(
    noUnit.warnings.some((w) => /needs a number and a unit/i.test(w)),
    `warnings: ${JSON.stringify(noUnit.warnings)}`
  );
  assert.ok(!withUnit.warnings.some((w) => /unit/i.test(w)), "a valid pack has no unit warning");
});

await check("every imported field has a fieldSources entry", async () => {
  const buf = await sheetBuffer([
    ["Name", "Category", "Parity", "Pack"],
    ["Cooling hair oil", "Hair oils", "Fragrance may be weaker", "100 ml"],
  ]);
  const imported = await importIdeasFromAttachment(attach(buf));
  const idea = imported.ideas[0];
  assert.ok(idea.fieldSources && typeof idea.fieldSources === "object", "fieldSources present");
  for (const path of idea.filled) {
    assert.ok(idea.fieldSources[path], `fieldSources for ${path}`);
    assert.equal(idea.fieldSources[path].source, "upload");
    assert.match(idea.fieldSources[path].cell, /^[A-Z]+\d+$/, `cell address for ${path}`);
  }
  assert.equal(idea.fieldSources["f1.parityExceptions"].cell, "C2");
  assert.deepEqual(Object.keys(idea.fieldSources).sort(), [...idea.filled].sort());
});

console.log(`PASS testPart141IdeaImportPolish (${checks} checks)`);
