import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { classifyAttachment, prepareIdeaInput } from "../lib/extractAttachment.js";
import { statedFieldsFromConceptText } from "../lib/filters/extractConceptCard.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /handleConceptCardFile/);
assert.match(
  formSrc,
  /readUploadFile\(file, setConceptCardError, \{ allowExcel: true, allowImage: true \}\)/
);
assert.match(formSrc, /accept="[^"]*\.xlsx/);
assert.match(formSrc, /PDF, Word, or Excel/);

const extractSrc = readFileSync(new URL("../lib/filters/extractConceptCard.js", import.meta.url), "utf8");
assert.match(extractSrc, /PDF, Word, or Excel/);

assert.equal(classifyAttachment({ name: "card.pdf" }), "pdf");
assert.equal(classifyAttachment({ name: "card.docx" }), "docx");
assert.equal(classifyAttachment({ name: "card.doc" }), "doc");
assert.equal(classifyAttachment({ name: "card.xlsx" }), "xlsx");
assert.equal(classifyAttachment({ name: "card.xls" }), "xlsx");
assert.equal(classifyAttachment({ name: "card.csv" }), "xlsx");
assert.equal(
  classifyAttachment({
    name: "card.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }),
  "xlsx"
);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["Category", "Hair oils"],
    ["Idea", "Herbal cooling hair oil with pearl extract"],
    ["Benchmark", "Dabur Amla 90ml"],
  ]),
  "Concept"
);
const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
const prepared = await prepareIdeaInput("", {
  name: "concept-card.xlsx",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  data: Buffer.from(xlsxBuf).toString("base64"),
});
assert.match(prepared.idea, /Hair oils/);
assert.match(prepared.idea, /Herbal cooling hair oil/);

await assert.rejects(
  () => prepareIdeaInput("", { name: "notes.txt", data: Buffer.from("hello").toString("base64") }),
  /PDF, Word \(.doc \/ .docx\), Excel/
);

const stated = statedFieldsFromConceptText(
  "Category,Hair oils\nBenchmark,Parachute Advansed\nDeclared attribute,cooling sensation\nDeclared gap,2\n"
);
assert.equal(stated.category, "Hair oils");
assert.equal(stated.benchmark, "Parachute Advansed");
assert.equal(stated.declaredAttribute, "cooling sensation");
assert.equal(stated.declaredGap, 2);
assert.equal(statedFieldsFromConceptText("a cooling oil for summer").category, undefined);

console.log("PASS concept card accepts PDF, Word, and Excel");
