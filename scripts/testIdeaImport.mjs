/**
 * Part 140 D — idea import, pure parts: template, Q&A sheet, row sheet, labelled text,
 * verifyAgainstDocument, formula safety, limits.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  ALIAS_CONFLICTS,
  EXAMPLE_NAME,
  GUIDE_SHEET_NAME,
  IDEAS_SHEET_NAME,
  IMPORT_FIELDS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_IDEAS,
  buildImportTemplateBuffer,
  decodeImportAttachment,
  importColumnHeader,
  parseCsv,
  parseLabelledText,
  parseSpreadsheetImport,
  verifyAgainstDocument,
} from "../lib/ideaImport.js";
import { ROLE_LABEL, roleLabel } from "../lib/fieldRoles.js";

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

async function sheetBuffer(build) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function rejects(promise, pattern, status = 400) {
  await assert.rejects(promise, (e) => {
    assert.equal(e.status, status, `status ${e.status}`);
    assert.match(e.message, pattern);
    return true;
  });
}

// ───────────────────────────── template ─────────────────────────────
const templateBuf = await buildImportTemplateBuffer();

await check("template has Ideas + Guide sheets", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), [IDEAS_SHEET_NAME, GUIDE_SHEET_NAME]);
  const ideas = wb.getWorksheet(IDEAS_SHEET_NAME);
  const headers = ideas.getRow(1).values.slice(1);
  assert.deepEqual(headers, IMPORT_FIELDS.map((f) => importColumnHeader(f.path)));
  assert.ok(headers.includes("Proposition name") && headers.includes("Category") && headers.includes("Idea description"));
  assert.ok(headers.some((h) => /COGS/.test(h)), "COGS column");
  assert.ok(headers.some((h) => /Net margin/.test(h)) && headers.some((h) => /GST/.test(h)) && headers.some((h) => /Pack size/.test(h)));
  assert.equal(ideas.getRow(2).getCell(1).value, EXAMPLE_NAME, "row 2 is the EXAMPLE row");
});

await check("Guide carries the Part 139 role label for every column", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf);
  const guide = wb.getWorksheet(GUIDE_SHEET_NAME);
  const rows = [];
  guide.eachRow((row) => rows.push(row.values.slice(1)));
  for (const f of IMPORT_FIELDS) {
    const header = importColumnHeader(f.path);
    const row = rows.find((r) => r[0] === header);
    assert.ok(row, `Guide row for ${header}`);
    assert.equal(row[1], roleLabel(f.path, {}), `${header} role label`);
    assert.ok(Object.values(ROLE_LABEL).includes(row[1]), `${header} uses a ROLE_LABEL word`);
  }
  const flat = rows.flat().join("|");
  for (const word of Object.values(ROLE_LABEL)) assert.ok(flat.includes(word), `legend lists "${word}"`);
});

await check("aliases never point two paths at one header", () => {
  assert.deepEqual(ALIAS_CONFLICTS, []);
});

await check("untouched template imports nothing (EXAMPLE row ignored)", async () => {
  const out = await parseSpreadsheetImport(templateBuf, "template.xlsx");
  assert.equal(out.ideas.length, 0);
  assert.equal(out.examplesSkipped, 1);
  assert.equal(out.sheet, IDEAS_SHEET_NAME);
});

await check("filled template: two ideas, typed values, cells recorded", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf);
  const ws = wb.getWorksheet(IDEAS_SHEET_NAME);
  const col = (path) => IMPORT_FIELDS.findIndex((f) => f.path === path) + 1;
  const put = (row, path, v) => {
    ws.getCell(row, col(path)).value = v;
  };
  put(3, "name", "Cooling hair oil");
  put(3, "category", "Hair oils");
  put(3, "ideaDescription", "A menthol hair oil.");
  put(3, "f1.benchmark", "Parachute Cooling 100 ml");
  put(3, "f1.declaredGap", 3);
  put(3, "f1.growthRoute", "New market");
  put(3, "f2.gstRatePct", "18%");
  put(3, "f2.mrpInr", "₹ 99");
  put(3, "f2.cogsAtScale", "1,250");
  put(4, "name", "Protein bar");
  put(4, "f2.grammage", "50 g");
  put(4, "f2.netMarginAtScale", "abc");
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const out = await parseSpreadsheetImport(buf, "ideas.xlsx");
  assert.equal(out.ideas.length, 2);
  const [a, b] = out.ideas;
  assert.equal(a.fields.name, "Cooling hair oil");
  assert.equal(a.fields["f1.declaredGap"], 3);
  assert.equal(a.fields["f1.growthRoute"], "new-market");
  assert.equal(a.fields["f2.gstRatePct"], 18);
  assert.equal(a.fields["f2.mrpInr"], 99);
  assert.equal(a.fields["f2.cogsAtScale"], 1250);
  assert.deepEqual(a.fieldSources.name, { source: "upload", cell: "A3" });
  assert.equal(a.row, 3);
  assert.equal(b.fields["f2.grammage"], "50 g");
  assert.ok(!("f2.netMarginAtScale" in b.fields), "a non-number is left out");
  assert.ok(b.warnings.some((w) => /not a number/.test(w)), "and explained");
  assert.deepEqual(b.dropped, ["f2.netMarginAtScale"]);
});

// ───────────────────────────── Q&A sheet ─────────────────────────────
await check("Q&A sheet (Field | Answer) reads as one idea", async () => {
  const buf = await sheetBuffer((wb) => {
    const ws = wb.addWorksheet("Idea");
    ws.addRow(["Question", "Answer"]);
    ws.addRow(["Proposition name", "Neem face wash"]);
    ws.addRow(["Category", "Face wash"]);
    ws.addRow(["Idea description", "A neem and tulsi gel face wash."]);
    ws.addRow(["GST rate", 18]);
    ws.addRow(["Favourite colour", "green"]);
  });
  const out = await parseSpreadsheetImport(buf, "qa.xlsx");
  assert.equal(out.layout, "qa");
  assert.equal(out.ideas.length, 1);
  const f = out.ideas[0].fields;
  assert.equal(f.name, "Neem face wash");
  assert.equal(f.category, "Face wash");
  assert.equal(f["f2.gstRatePct"], 18);
  assert.equal(out.ideas[0].fieldSources.name.cell, "B2");
  assert.ok(out.ignoredColumns.includes("Favourite colour"));
});

await check("headers may be the Inputs Excel paths, and unknown columns are reported", async () => {
  const buf = await sheetBuffer((wb) => {
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["name", "f1.benchmark", "division", "scorePercent"]);
    ws.addRow(["Idea A", "Brand X 100 g", "Hair care", 80]);
  });
  const out = await parseSpreadsheetImport(buf, "x.xlsx");
  assert.equal(out.ideas[0].fields["f1.benchmark"], "Brand X 100 g");
  assert.deepEqual(out.ignoredColumns.sort(), ["division", "scorePercent"]);
});

await check("a sheet with no idea columns is refused in plain words", async () => {
  const buf = await sheetBuffer((wb) => {
    wb.addWorksheet("S").addRow(["foo", "bar"]);
  });
  await rejects(parseSpreadsheetImport(buf, "x.xlsx"), /No idea columns were found/);
});

await check("row with only unreadable values is rejected with its row number", async () => {
  const buf = await sheetBuffer((wb) => {
    const ws = wb.addWorksheet("Ideas");
    ws.addRow(["Proposition name", "Pack size", "GST rate"]);
    ws.addRow(["Fine idea", "100 g", 18]);
    ws.addRow([null, null, "lots"]);
  });
  const out = await parseSpreadsheetImport(buf, "x.xlsx");
  assert.equal(out.ideas.length, 1);
  assert.equal(out.rejected.length, 1);
  assert.equal(out.rejected[0].row, 3);
  assert.match(out.rejected[0].reason, /Nothing on this row could be read/);
});

// ───────────────────────────── labelled text ─────────────────────────────
await check("parseLabelledText reads Field name: answer lines", () => {
  const out = parseLabelledText(
    [
      "Proposition name: Herbal cooling hair oil",
      "Category: Hair oils",
      "Idea description: A light oil with menthol",
      "  and amla that cools the scalp.",
      "",
      "Footer line that belongs to nothing",
      "Declared gap: 3",
      "GST rate: 18%",
      "Benchmark:",
      "Dabur Amla 90 ml",
      "- Pack size: 100 ml",
    ].join("\n")
  );
  assert.equal(out.labelCount, 7);
  const f = out.fields;
  assert.equal(f.name, "Herbal cooling hair oil");
  assert.equal(f.ideaDescription, "A light oil with menthol and amla that cools the scalp.");
  assert.equal(f["f1.declaredGap"], 3);
  assert.equal(f["f2.gstRatePct"], 18);
  assert.equal(f["f1.benchmark"], "Dabur Amla 90 ml", "answer on the next line");
  assert.equal(f["f2.grammage"], "100 ml", "bullet stripped");
  assert.equal(out.ideas[0].fieldSources["f1.declaredGap"].source, "upload");
});

await check("labelled text: a repeated Proposition name starts a second idea; unknown labels are not fields", () => {
  const out = parseLabelledText("Proposition name: A\nCategory: X\nNote: hello\nProposition name: B\nCategory: Y");
  assert.equal(out.ideas.length, 2);
  assert.equal(out.ideas[1].fields.name, "B");
  assert.ok(!Object.values(out.ideas[0].fields).includes("hello"));
});

await check("labelled text never reads a switch such as Pure commodity", () => {
  const out = parseLabelledText("Proposition name: A\nPure commodity: Yes\nCategory: Z");
  assert.ok(!("f1.pureCommodity" in out.fields));
});

// ───────────────────────────── verifyAgainstDocument ─────────────────────────────
await check("verifyAgainstDocument keeps stated values and drops invented ones", () => {
  const doc = "Concept: Herbal cooling hair oil. Category: Hair oils. Benchmark is Dabur Amla 90 ml. Declared gap 4 points. GST 18%.";
  const out = verifyAgainstDocument(
    {
      name: "Herbal cooling hair oil",
      category: "Hair oils",
      "f1.benchmark": "dabur amla 90ml".replace("90ml", "90 ml"),
      "f1.declaredGap": 4,
      "f2.gstRatePct": "18%",
      "f1.declaredAttribute": "Clinically proven dandruff removal",
      "f2.mrpInr": 249,
      "f1.targetConsumer": "Parachute loyalists",
    },
    doc
  );
  assert.deepEqual(Object.keys(out.kept).sort(), ["category", "f1.benchmark", "f1.declaredGap", "f2.gstRatePct", "name"]);
  assert.deepEqual(out.dropped.sort(), ["f1.declaredAttribute", "f1.targetConsumer", "f2.mrpInr"]);
  assert.equal(out.droppedCount, 3);
});

await check("verifyAgainstDocument accepts the nested shape too", () => {
  const out = verifyAgainstDocument({ name: "Oil", f1: { benchmark: "Oil 100 g" } }, "Oil. Benchmark Oil 100 g");
  assert.equal(out.kept["f1.benchmark"], "Oil 100 g");
});

await check("a number only counts when the number itself is in the document", () => {
  const out = verifyAgainstDocument({ "f1.declaredGap": 4 }, "Gap of 14 points and 40 percent");
  assert.equal(out.droppedCount, 1, "4 is not the same as 14 or 40");
});

// ───────────────────────────── formula / = safety ─────────────────────────────
await check("a formula cell is read as its saved value only", async () => {
  const buf = await sheetBuffer((wb) => {
    const ws = wb.addWorksheet("Ideas");
    ws.addRow(["Proposition name", "Pack size", "GST rate"]);
    ws.getCell("A2").value = { formula: 'CONCATENATE("Oil"," ","one")', result: "Oil one" };
    ws.getCell("B2").value = { formula: 'HYPERLINK("http://evil","click")' }; // no saved result
    ws.getCell("C2").value = { formula: "9+9", result: 18 };
  });
  const out = await parseSpreadsheetImport(buf, "f.xlsx");
  const f = out.ideas[0].fields;
  assert.equal(f.name, "Oil one");
  assert.equal(f["f2.gstRatePct"], 18);
  assert.ok(!("f2.grammage" in f), "a formula with no saved value gives nothing");
  assert.ok(!JSON.stringify(out).includes("HYPERLINK"), "formula text is never carried");
});

await check("text that starts = + @ - stays plain text", async () => {
  const buf = await sheetBuffer((wb) => {
    const ws = wb.addWorksheet("Ideas");
    ws.addRow(["Proposition name", "Idea description", "Category", "Benchmark"]);
    ws.addRow(["=HYPERLINK(\"http://x\",\"y\")", "+cmd|' /C calc'!A0", "@SUM(1+1)", "-2+3"]);
  });
  const out = await parseSpreadsheetImport(buf, "e.xlsx");
  const f = out.ideas[0].fields;
  assert.equal(f.name, '=HYPERLINK("http://x","y")');
  assert.equal(f.ideaDescription, "+cmd|' /C calc'!A0");
  assert.equal(f.category, "@SUM(1+1)");
  assert.equal(f["f1.benchmark"], "-2+3");
});

await check("CSV: = stays text, quotes and commas read, example row skipped", async () => {
  const csv = 'Proposition name,Category,Idea description\nEXAMPLE,x,y\n"=1+1","Hair, oils","Say ""hi"""\n';
  const out = await parseSpreadsheetImport(Buffer.from(csv), "ideas.csv");
  assert.equal(out.ideas.length, 1);
  assert.equal(out.examplesSkipped, 1);
  assert.equal(out.ideas[0].fields.name, "=1+1");
  assert.equal(out.ideas[0].fields.category, "Hair, oils");
  assert.equal(out.ideas[0].fields.ideaDescription, 'Say "hi"');
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]], "semicolon files");
});

// ───────────────────────────── limits ─────────────────────────────
await check("200 ideas is fine, 201 is refused with a plain 400", async () => {
  const mk = (n) =>
    sheetBuffer((wb) => {
      const ws = wb.addWorksheet("Ideas");
      ws.addRow(["Proposition name", "Category"]);
      for (let i = 1; i <= n; i += 1) ws.addRow([`Idea ${i}`, "Hair oils"]);
    });
  const ok = await parseSpreadsheetImport(await mk(IMPORT_MAX_IDEAS), "a.xlsx");
  assert.equal(ok.ideas.length, 200);
  await rejects(parseSpreadsheetImport(await mk(IMPORT_MAX_IDEAS + 1), "a.xlsx"), /201 ideas.*limit is 200/);
});

await check("over 5 MB is refused with a plain 400", async () => {
  await rejects(parseSpreadsheetImport(Buffer.alloc(IMPORT_MAX_BYTES + 1, 65), "big.xlsx"), /over 5 MB/);
  const big = Buffer.alloc(IMPORT_MAX_BYTES + 10, 65).toString("base64");
  assert.throws(
    () => decodeImportAttachment({ name: "big.xlsx", data: big }),
    (e) => e.status === 400 && /over 5 MB/.test(e.message)
  );
  assert.throws(() => decodeImportAttachment({ name: "x.xlsx", data: "" }), (e) => e.status === 400);
  assert.throws(() => decodeImportAttachment(null), (e) => e.status === 400);
});

await check("old .xls is refused, not read", async () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
  await rejects(parseSpreadsheetImport(ole, "old.xls"), /Save this spreadsheet as \.xlsx/);
});

await check("garbage that claims to be xlsx is a plain 400", async () => {
  await rejects(parseSpreadsheetImport(Buffer.from("PK\u0003\u0004 not really"), "bad.xlsx"), /Could not read that spreadsheet/);
});

console.log(`testIdeaImport: ${checks} checks passed`);
