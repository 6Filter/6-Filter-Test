/**
 * Part 140 D — the Inputs Excel (Log export) and the import template speak the same columns:
 * an exported idea can be uploaded again and comes back unchanged.
 */
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { FULL_EXPORT_COLUMNS, buildExportWorkbook, flattenProposition } from "../lib/logExport.js";
import { formFieldPaths } from "../lib/fieldRoles.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import {
  IMPORT_FIELDS,
  IMPORT_PATHS,
  buildImportTemplateBuffer,
  fieldsToDoc,
  importColumnHeader,
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

const exportBuffer = (props) => Buffer.from(XLSX.write(buildExportWorkbook(props), { type: "buffer", bookType: "xlsx" }));

/** An idea as the form stores it, with every importable box filled. */
function fullIdea(id, name) {
  const doc = emptyPropositionDoc(id);
  doc.name = name;
  doc.category = "Hair oils";
  doc.ideaDescription = "A light hair oil with menthol.";
  Object.assign(doc.f1, {
    declaredAttribute: "Cools the scalp",
    declaredAttribute2: "Lasting fragrance",
    declaredAttribute3: "No residue",
    evidenceSourceDate: "https://example.com/report",
    benchmark: "Parachute Cooling 100 ml",
    declaredGap: 3,
    gapDerivation: "Longer cooling feel",
    parityExceptions: "Weaker fragrance",
    targetConsumer: "Urban women 25-40",
    growthRoute: "new-market",
    growthArgument: "Summer lift pulls in new buyers.",
    pureCommodity: false,
  });
  Object.assign(doc.f2, {
    cogsAtScale: 32,
    netMarginAtScale: 12,
    gstRatePct: 18,
    grammage: "100 ml",
    mrpInr: 99,
    qcomTrajectory: "",
  });
  Object.assign(doc.f5, {
    householdsReachedY3Mn: 2,
    trialRatePct: 8,
    repeatConversionPct: 30,
    purchaseFrequencyYr: 4,
    avgPackValueInr: 99,
  });
  return doc;
}

const docValue = (doc, path) => {
  const [head, ...rest] = path.split(".");
  return rest.length ? doc[head]?.[rest.join(".")] : doc[head];
};

await check("every Inputs Excel column that is a form box is importable, bar owner-only boxes", () => {
  const exportCols = new Set(FULL_EXPORT_COLUMNS);
  const formBoxes = formFieldPaths().filter((p) => exportCols.has(p));
  const notImported = formBoxes.filter((p) => !IMPORT_PATHS.includes(p) && pathForHeader(p) !== p).sort();
  // Left out on purpose (Part 145 D111): who the uploader is (taken from the account), sign-offs, a computed result,
  // the boxes taken off the form (pure commodity, who it is for, system-filled cost/margin/MRP, quick-commerce) and the
  // proof-stage boxes (Filters 5 and 6).
  assert.deepEqual(
    notImported.filter((p) => !p.startsWith("f6.")),
    [
      "f1.pureCommodity", "f1.targetConsumer", "f2.financeSigned",
      "f2.qcomTrajectory", "f5.avgPackValueInr", "f5.computedRevenue", "f5.householdsReachedY3Mn",
      "f5.purchaseFrequencyYr", "f5.repeatConversionPct", "f5.trialRatePct", "submitterDepartment", "submitterName",
    ].sort()
  );
  for (const p of formBoxes.filter((x) => IMPORT_PATHS.includes(x))) {
    assert.equal(pathForHeader(p), p, `${p} header is recognised as itself`);
  }
});

await check("Part 145 D108: the evidence-source box is gone from the upload as well", () => {
  assert.equal(pathForHeader("f1.evidenceSourceLink"), null);
  assert.equal(pathForHeader("f1.evidenceSourceDate"), null);
});

await check("template headers and export headers resolve to the same paths", () => {
  for (const f of IMPORT_FIELDS) {
    assert.equal(pathForHeader(importColumnHeader(f.path)), f.path, `${f.path} by label`);
    assert.equal(pathForHeader(f.path), f.path, `${f.path} by path`);
  }
});

await check("export → upload: every filled box comes back, two ideas, label sheet not read", async () => {
  const a = fullIdea("a", "Cooling hair oil");
  const b = fullIdea("b", "Summer hair mist");
  b.f1.benchmark = "Brand Y 50 ml";
  const out = await parseSpreadsheetImport(exportBuffer([a, b]), "Primus-log.xlsx");
  assert.equal(out.sheet, "Propositions");
  assert.equal(out.ideas.length, 2, "the Field labels sheet is not an idea");
  for (const [idea, src] of [[out.ideas[0], a], [out.ideas[1], b]]) {
    for (const p of IMPORT_PATHS) {
      const want = docValue(src, p);
      if (want === "" || want === false || want == null) {
        assert.ok(!(p in idea.fields), `${p} stays empty`);
        continue;
      }
      assert.equal(idea.fields[p], want, `${src.name}: ${p}`);
    }
  }
  assert.equal(out.ideas[1].fields["f1.benchmark"], "Brand Y 50 ml");
  for (const col of ["id", "division", "scorePercent", "classification", "f1.narrative"]) {
    assert.ok(out.ignoredColumns.includes(col), `${col} is reported as not used`);
  }
  assert.ok(!out.ignoredColumns.includes("name"));
});

await check("template → export → upload again is stable", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildImportTemplateBuffer());
  const ws = wb.getWorksheet("Ideas");
  const src = fullIdea("t", "Template idea");
  IMPORT_FIELDS.forEach((f, i) => {
    const v = docValue(src, f.path);
    if (v !== "" && v != null && v !== false) ws.getCell(3, i + 1).value = f.path === "f1.growthRoute" ? "New market" : v;
  });
  const first = await parseSpreadsheetImport(Buffer.from(await wb.xlsx.writeBuffer()), "t.xlsx");
  assert.equal(first.ideas.length, 1);
  const doc = emptyPropositionDoc("t2");
  const built = fieldsToDoc(first.ideas[0].fields);
  doc.name = built.name;
  doc.category = built.category;
  doc.ideaDescription = built.ideaDescription;
  for (const k of ["f1", "f2", "f3", "f5"]) Object.assign(doc[k], built[k] || {});
  const second = await parseSpreadsheetImport(exportBuffer([doc]), "re.xlsx");
  assert.deepEqual(second.ideas[0].fields, first.ideas[0].fields);
});

await check("text beginning = is escaped on export and restored on re-upload", async () => {
  const doc = fullIdea("s", "=HYPERLINK(\"http://x\",\"go\")");
  doc.ideaDescription = "+1 trick";
  doc.f1.benchmark = "@brand";
  const flat = flattenProposition(doc);
  assert.equal(flat.name, "'=HYPERLINK(\"http://x\",\"go\")");
  assert.equal(flat.ideaDescription, "'+1 trick");
  assert.equal(flat["f1.benchmark"], "'@brand");
  const sheet = buildExportWorkbook([doc]).Sheets.Propositions;
  assert.ok(!Object.values(sheet).some((c) => c && typeof c.v === "string" && /^[=+@]/.test(c.v)), "no cell starts with = + @");
  const back = await parseSpreadsheetImport(exportBuffer([doc]), "s.xlsx");
  assert.equal(back.ideas[0].fields.name, doc.name);
  assert.equal(back.ideas[0].fields.ideaDescription, "+1 trick");
  assert.equal(back.ideas[0].fields["f1.benchmark"], "@brand");
});

console.log(`testIdeaImportRoundTrip: ${checks} checks passed`);
