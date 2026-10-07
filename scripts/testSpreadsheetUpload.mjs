import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { prepareIdeaInput } from "../lib/extractAttachment.js";

const src = readFileSync(new URL("../lib/extractAttachment.js", import.meta.url), "utf8");
assert.doesNotMatch(src, /XLSX\.read/);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Idea");
sheet.addRow(["sandal soap for hard water"]);
const buf = Buffer.from(await workbook.xlsx.writeBuffer());
const out = await prepareIdeaInput("", {
  name: "idea.xlsx",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  data: buf.toString("base64"),
});
assert.match(out.idea, /sandal soap for hard water/);

const huge = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
await assert.rejects(
  () =>
    prepareIdeaInput("", {
      name: "big.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: huge.toString("base64"),
    }),
  /too large/
);

const wide = new ExcelJS.Workbook();
const many = wide.addWorksheet("TooBig");
for (let i = 0; i < 2001; i += 1) many.addRow([`row ${i}`]);
const wideBuf = Buffer.from(await wide.xlsx.writeBuffer());
await assert.rejects(
  () =>
    prepareIdeaInput("", {
      name: "wide.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: wideBuf.toString("base64"),
    }),
  /too many rows/
);

console.log("PASS spreadsheet uploads are read with exceljs, size-capped, and row-capped");
