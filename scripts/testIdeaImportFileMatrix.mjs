/**
 * File-recognition matrix for idea upload: types, size/count limits, and corrupt files.
 * No live Anthropic: labelled Word/PDF do not call the model; any free-form path is stubbed.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { IMPORT_MAX_BYTES, IMPORT_MAX_IDEAS, importIdeasFromAttachment } from "../lib/ideaImport.js";
import { clearCallLlmStub, setCallLlmStub } from "./installCallLlmStub.mjs";

const user = { id: "u1", email: "bm@example.com", name: "Asha", team: "PC" };
const LABELLED = [
  "Proposition name: Herbal cooling hair oil",
  "Category: Hair oils",
  "Idea description: A light oil with menthol and amla.",
  "Benchmark: Dabur Amla 90 ml",
  "Declared gap: 3",
  "GST rate: 18%",
];

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

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

async function xlsxRows(n, name = "ideas.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ideas");
  ws.addRow(["Proposition name", "Category", "Idea description"]);
  for (let i = 1; i <= n; i += 1) ws.addRow([`Idea ${i}`, "Hair oils", `Description ${i}`]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { name, data: b64(buf), mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

async function wordFile(lines, name = "idea.docx") {
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
  const buf = await Packer.toBuffer(doc);
  return {
    name,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: b64(buf),
  };
}

function pdfFile(lines, name = "idea.pdf") {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve({ name, mediaType: "application/pdf", data: b64(Buffer.concat(chunks)) }));
    pdf.on("error", reject);
    for (const line of lines) pdf.fontSize(12).text(line);
    pdf.end();
  });
}

async function expectRefuse(attachment, pattern) {
  await assert.rejects(
    importIdeasFromAttachment({ attachment, user }),
    (e) => e.status === 400 && pattern.test(String(e.message || ""))
  );
}

setCallLlmStub(async () => {
  throw new Error("file matrix must not call Anthropic");
});

await check("xlsx with one idea is accepted", async () => {
  const out = await importIdeasFromAttachment({ attachment: await xlsxRows(1), user });
  assert.equal(out.usedAi, false);
  assert.equal(out.ideas.length, 1);
  assert.equal(out.ideas[0].fields.name, "Idea 1");
});

await check("xlsm is read as plain cells", async () => {
  const att = await xlsxRows(1, "ideas.xlsm");
  att.mediaType = "application/vnd.ms-excel.sheet.macroEnabled.12";
  const out = await importIdeasFromAttachment({ attachment: att, user });
  assert.equal(out.ideas.length, 1);
  assert.equal(out.usedAi, false);
});

await check("csv with a header row is accepted", async () => {
  const csv = "Proposition name,Category,Idea description\nOil,Hair oils,A cooling oil\n";
  const out = await importIdeasFromAttachment({
    attachment: { name: "ideas.csv", data: b64(csv), mediaType: "text/csv" },
    user,
  });
  assert.equal(out.ideas.length, 1);
  assert.equal(out.ideas[0].fields.name, "Oil");
});

await check("labelled docx is accepted with no AI", async () => {
  const out = await importIdeasFromAttachment({ attachment: await wordFile(LABELLED), user });
  assert.equal(out.usedAi, false);
  assert.equal(out.ideas[0].fields.name, "Herbal cooling hair oil");
});

await check("labelled pdf is accepted with no AI", async () => {
  const out = await importIdeasFromAttachment({ attachment: await pdfFile(LABELLED), user });
  assert.equal(out.usedAi, false);
  assert.equal(out.ideas[0].fields.category, "Hair oils");
});

await check("old .xls is refused", async () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
  await expectRefuse({ name: "old.xls", data: b64(ole), mediaType: "application/vnd.ms-excel" }, /Save this spreadsheet as \.xlsx/);
});

await check("png is refused", async () => {
  await expectRefuse({ name: "scan.png", data: b64("x"), mediaType: "image/png" }, /Excel, Word or PDF/);
});

await check("jpeg is refused", async () => {
  await expectRefuse({ name: "photo.jpg", data: b64("x"), mediaType: "image/jpeg" }, /Excel, Word or PDF/);
});

await check("html is refused", async () => {
  await expectRefuse(
    { name: "page.html", data: b64("<html><body>Proposition name: X</body></html>"), mediaType: "text/html" },
    /Excel, Word or PDF/
  );
});

await check("zip is refused", async () => {
  const zip = Buffer.from("PK\u0003\u0004not-a-sheet");
  await expectRefuse({ name: "ideas.zip", data: b64(zip), mediaType: "application/zip" }, /Excel, Word or PDF/);
});

await check("exe is refused", async () => {
  await expectRefuse({ name: "setup.exe", data: b64("MZ"), mediaType: "application/octet-stream" }, /Excel, Word or PDF/);
});

await check("empty payload is refused", async () => {
  await expectRefuse({ name: "ideas.xlsx", data: "", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, /empty/);
});

await check("missing attachment is refused", async () => {
  await expectRefuse(null, /Choose an Excel, Word or PDF file/);
});

await check("over 5 MB is refused", async () => {
  const data = Buffer.alloc(IMPORT_MAX_BYTES + 32, 65).toString("base64");
  await expectRefuse(
    { name: "big.xlsx", data, mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    /over 5 MB/
  );
});

await check("200 ideas are accepted, 201 are refused", async () => {
  const ok = await importIdeasFromAttachment({ attachment: await xlsxRows(IMPORT_MAX_IDEAS), user });
  assert.equal(ok.ideas.length, 200);
  await expectRefuse(await xlsxRows(IMPORT_MAX_IDEAS + 1), /limit is 200/);
});

await check("garbage xlsx is a plain 400", async () => {
  await expectRefuse(
    { name: "bad.xlsx", data: b64("PK\u0003\u0004 not really"), mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    /Could not read that spreadsheet/
  );
});

await check("truncated pdf is a plain 400", async () => {
  await expectRefuse({ name: "cut.pdf", data: b64("%PDF-1.4\n1 0 obj"), mediaType: "application/pdf" }, /no readable text|Could not|Excel, Word or PDF|PDF/);
});

await check("garbage docx is a plain 400", async () => {
  await expectRefuse(
    {
      name: "bad.docx",
      data: b64("PK\u0003\u0004xxxx"),
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    /no readable text|Could not|Excel, Word or PDF|Word/
  );
});

await check("garbage .doc is a plain 400", async () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32, 7)]);
  await expectRefuse({ name: "old.doc", data: b64(ole), mediaType: "application/msword" }, /no readable text|Could not|Excel, Word or PDF|Word/);
});

clearCallLlmStub();
console.log(`testIdeaImportFileMatrix: ${checks} checks passed`);
