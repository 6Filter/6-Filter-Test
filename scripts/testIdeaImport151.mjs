/**
 * Part 151 — upload ideas from one Excel file: the template has a column for every input on the form, a single
 * upload takes one row, a bulk upload takes many, every value is read into the right box, and the draft is ready to
 * be tested (Submit) so the verdict and score land in the Log.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

process.env.REQUIRE_AUTH = "false";
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-import-151-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
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
const { IMPORT_FIELDS, IMPORT_PATHS, buildImportTemplateBuffer, parseSpreadsheetImport, coerceFieldValue, importColumnHeader } = imp;

// Every box a person types on the input form (Part 145 form: hidden boxes are the system's or other teams').
const FORM_INPUTS = [
  "name", "category", "ideaDescription",
  "f1.declaredAttribute", "f1.declaredAttribute2", "f1.declaredAttribute3", "f1.benchmark", "f1.declaredGap",
  "f1.gapDerivation", "f1.parityExceptions", "f1.growthRoute", "f1.growthArgument",
  "f2.cogsAtScale", "f2.netMarginAtScale", "f2.gstRatePct", "f2.grammage", "f2.mrpInr",
];

await check("the template has one column for every input on the form, in form order", () => {
  assert.deepEqual(IMPORT_PATHS, FORM_INPUTS);
});

await check("the template's Ideas sheet shows all those headers, frozen, with a note and a colour on each", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildImportTemplateBuffer());
  const ws = wb.getWorksheet("Ideas");
  const headers = ws.getRow(1).values.slice(1);
  assert.equal(headers.length, 17);
  assert.deepEqual(headers, FORM_INPUTS.map(importColumnHeader));
  for (let c = 1; c <= 17; c += 1) {
    const cell = ws.getRow(1).getCell(c);
    assert.ok(cell.fill?.fgColor?.argb, `header ${c} has a colour`);
    assert.ok(cell.note, `header ${c} explains itself`);
  }
  assert.equal(ws.views[0].state, "frozen");
  assert.ok(ws.views[0].zoomScale <= 100, "opens zoomed out enough to see many columns");
  const guide = wb.getWorksheet("Guide");
  const rows = [];
  guide.eachRow((r) => rows.push(r.values.slice(1)));
  for (const p of FORM_INPUTS) assert.ok(rows.some((r) => r[0] === importColumnHeader(p)), `Guide row for ${p}`);
  assert.match(rows.flat().join("|"), /One row = single upload; many rows = bulk upload/);
});

const sample = (i) => ({
  name: `Idea ${i}`,
  category: "Hair oils",
  ideaDescription: `A cooling oil number ${i}.`,
  "f1.declaredAttribute": "Cools the scalp",
  "f1.declaredAttribute2": "Lasting fragrance",
  "f1.declaredAttribute3": "Not sticky",
  "f1.benchmark": "Parachute Cooling 100 ml",
  "f1.declaredGap": 3,
  "f1.gapDerivation": "Cools longer",
  "f1.parityExceptions": "Fragrance weaker",
  "f1.growthRoute": "Penetration",
  "f1.growthArgument": "Summer lift",
  "f2.cogsAtScale": 55 + i,
  "f2.netMarginAtScale": "30%",
  "f2.gstRatePct": 18,
  "f2.grammage": "100 ml",
  "f2.mrpInr": "₹120",
});
async function filledTemplate(rows) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildImportTemplateBuffer());
  const ws = wb.getWorksheet("Ideas");
  const col = (p) => IMPORT_FIELDS.findIndex((f) => f.path === p) + 1;
  rows.forEach((row, i) => {
    for (const [p, v] of Object.entries(row)) ws.getCell(3 + i, col(p)).value = v;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

await check("a bulk file of 25 rows reads 25 ideas, every value in its own box, the example row skipped", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => sample(i + 1));
  const parsed = await parseSpreadsheetImport(await filledTemplate(rows), "bulk.xlsx");
  assert.equal(parsed.ideas.length, 25);
  assert.equal(parsed.examplesSkipped, 1);
  assert.deepEqual(parsed.rejected, []);
  parsed.ideas.forEach((idea, i) => {
    assert.equal(Object.keys(idea.fields).length, 17, `row ${i + 1} filled all 17 boxes`);
    assert.equal(idea.fields.name, `Idea ${i + 1}`);
    assert.equal(idea.fields["f1.growthRoute"], "penetration");
    assert.equal(idea.fields["f2.cogsAtScale"], 56 + i);
    assert.equal(idea.fields["f2.netMarginAtScale"], 30, "30% is read as 30");
    assert.equal(idea.fields["f2.mrpInr"], 120, "₹120 is read as 120");
    assert.equal(idea.fields["f2.gstRatePct"], 18);
  });
});

await check("a percent typed in a %-formatted cell (0.24, 0.18) is read as 24 and 18", () => {
  assert.equal(coerceFieldValue("f2.netMarginAtScale", 0.24).value, 24);
  assert.equal(coerceFieldValue("f2.gstRatePct", 0.18).value, 18);
  assert.equal(coerceFieldValue("f2.netMarginAtScale", 24).value, 24);
  assert.equal(coerceFieldValue("f2.cogsAtScale", 0.5).value, 0.5, "other numbers are never rescaled");
});

await check("friendly column names are understood (COGS, Net margin, MRP)", () => {
  for (const [header, p] of [["COGS", "f2.cogsAtScale"], ["Net margin", "f2.netMarginAtScale"], ["MRP", "f2.mrpInr"], ["Cost to make one unit (COGS)", "f2.cogsAtScale"], ["MRP after tax", "f2.mrpInr"]]) {
    assert.equal(imp.pathForHeader(header), p, header);
  }
});

// ---- live: the real dispatcher ----
const { handleApiRequest } = await import("../lib/apiRouter.js");
const { initDb } = await import("../lib/db.js");
const { clearRateLimits } = await import("../lib/rateLimit.js");
await initDb();
const server = createServer(async (req, res) => {
  if (!(await handleApiRequest(req, res))) {
    res.statusCode = 404;
    res.end("no");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const api = async (p, init = {}) => {
  const res = await fetch(`${base}${p}`, init);
  const json = await res.json().catch(() => null);
  return { res, json };
};
const post = (buf, mode) =>
  api("/api/propositions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      attachment: { name: "ideas.xlsx", data: buf.toString("base64"), mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }),
  });

try {
  await check("Upload one idea: a file with several ideas is refused and nothing is created", async () => {
    clearRateLimits();
    const before = (await api("/api/propositions")).json;
    const countBefore = (before.propositions || before).length;
    const { res, json } = await post(await filledTemplate([sample(1), sample(2), sample(3)]), "single");
    assert.equal(res.status, 400);
    assert.match(json.error, /3 ideas.*Bulk upload/);
    assert.equal(json.ideaCount, 3);
    const after = (await api("/api/propositions")).json;
    assert.equal((after.propositions || after).length, countBefore, "no draft was created");
  });

  let singleId;
  await check("Upload one idea: one row becomes one draft with all 17 values and the typed-number markers", async () => {
    clearRateLimits();
    const { res, json } = await post(await filledTemplate([sample(1)]), "single");
    assert.equal(res.status, 201, JSON.stringify(json));
    assert.equal(json.created.length, 1);
    assert.equal(json.created[0].filled.length, 17);
    singleId = json.created[0].id;
    const got = await api(`/api/propositions/${singleId}`);
    const p = got.json.proposition || got.json;
    assert.equal(p.name, "Idea 1");
    assert.equal(Number(p.f2.cogsAtScale), 56);
    assert.equal(Number(p.f2.netMarginAtScale), 30);
    assert.equal(Number(p.f2.mrpInr), 120);
    assert.equal(p.f2.netMarginSource, "user", "your margin is never replaced by the division minimum");
    assert.equal(p.f2.mrpOverride, true, "your MRP is used as typed");
    assert.equal(p.f1.declaredAttribute2, "Lasting fragrance");
    assert.equal(p.researchRunAt, null, "nothing is scored until Submit");
  });

  await check("Bulk upload: 12 rows become 12 drafts, each ready to test; the Log lists them", async () => {
    clearRateLimits();
    const rows = Array.from({ length: 12 }, (_, i) => sample(i + 10));
    const { res, json } = await post(await filledTemplate(rows), "bulk");
    assert.equal(res.status, 201);
    assert.equal(json.created.length, 12);
    assert.ok(json.created.every((c) => c.missingRequired.length === 0), "all required boxes are filled, so each can be submitted");
    const list = (await api("/api/propositions")).json;
    const names = (list.propositions || list).map((r) => r.name);
    for (let i = 10; i < 22; i += 1) assert.ok(names.includes(`Idea ${i}`), `Idea ${i} is in the list the Log reads`);
  });

  await check("a row missing a required box is imported as a draft and told what is still needed", async () => {
    clearRateLimits();
    const { json } = await post(await filledTemplate([{ ...sample(40), category: "" }, sample(41)]), "bulk");
    assert.equal(json.created.length, 2);
    assert.ok(json.created[0].missingRequired.includes("Category"));
    assert.equal(json.created[1].missingRequired.length, 0);
  });
} finally {
  server.close();
}

// ---- the panel, mounted for real: single opens the form, bulk tests every idea and lists verdict + score ----
const { JSDOM } = await import("jsdom");
const { build } = await import("esbuild");
const { pathToFileURL, fileURLToPath } = await import("node:url");
const { writeFileSync } = await import("node:fs");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  FileReader: window.FileReader,
  File: window.File,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
const bundled = await build({
  stdin: {
    contents: `
      import React, { act, useState } from "react";
      import { createRoot } from "react-dom/client";
      import IdeaImportPanel, { bulkSummaryRows } from "./src/IdeaImportPanel.jsx";
      export { React, act, createRoot, useState, IdeaImportPanel, bulkSummaryRows };
    `,
    resolveDir: root,
    sourcefile: "panel-entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const pdir = mkdtempSync(path.join(tmpdir(), "primus-import-panel-"));
const pfile = path.join(pdir, "bundle.mjs");
writeFileSync(pfile, bundled.outputFiles[0].text);
const { React, act, createRoot, useState, IdeaImportPanel, bulkSummaryRows } = await import(pathToFileURL(pfile).href);
const h = React.createElement;

function Harness({ opened, onSubmit, logs }) {
  const [result, setResult] = useState(null);
  return h(IdeaImportPanel, { result, setResult, onOpenDraft: (id) => opened.push(id), onSubmitIdea: onSubmit, onOpenLog: () => logs.push("log") });
}
let lastMode = "";
function stubFetch(ideas) {
  globalThis.fetch = async (url, init) => {
    lastMode = JSON.parse(init.body).mode;
    return { ok: true, json: async () => ({ created: ideas, rejected: [], ignoredColumns: [], usedAi: false }) };
  };
}
const idea = (id, name, missing = []) => ({ id, name, filled: ["name"], warnings: [], missingRequired: missing, fieldSources: {} });
async function mountPanel(opened, onSubmit, logs) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(h(Harness, { opened, onSubmit, logs }));
  });
  return host;
}
async function pickFile(host, testid) {
  const input = host.querySelector('[data-testid="import-file"]');
  const file = new window.File([new Uint8Array([1, 2, 3])], "ideas.xlsx", { type: "application/vnd.ms-excel" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    host.querySelector(`[data-testid="${testid}"]`).click();
  });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
}

await check("Upload one idea (single): sends mode=single and opens the form for that draft straight away", async () => {
  const opened = [];
  stubFetch([idea("a1", "Solo idea")]);
  const host = await mountPanel(opened, async () => ({ ok: true }), []);
  await pickFile(host, "import-upload");
  assert.equal(lastMode, "single");
  assert.deepEqual(opened, ["a1"]);
});

await check("Bulk upload: sends mode=bulk, does not open a form, and Submit all tests every ready idea", async () => {
  const opened = [];
  const logs = [];
  const tested = [];
  stubFetch([idea("b1", "Alpha"), idea("b2", "Beta"), idea("b3", "Gamma", ["Category"])]);
  window.confirm = () => true;
  globalThis.window.confirm = () => true;
  const verdicts = { b1: { verdict: "GO", pct: 91.4 }, b2: { verdict: "NO-GO", pct: 52 } };
  const host = await mountPanel(opened, async (id) => {
    tested.push(id);
    return { ok: true, message: "Submitted.", ...verdicts[id] };
  }, logs);
  await pickFile(host, "import-upload-bulk");
  assert.equal(lastMode, "bulk");
  assert.deepEqual(opened, []);
  assert.equal(host.querySelectorAll('[data-testid="import-idea"]').length, 3);
  assert.match(host.querySelector('[data-testid="import-submit-all"]').textContent, /Submit all \(2\)/, "the idea missing a required box is skipped");
  await act(async () => {
    host.querySelector('[data-testid="import-submit-all"]').click();
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.deepEqual(tested, ["b1", "b2"]);
  const rows = [...host.querySelectorAll('[data-testid="import-summary-row"]')].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
  assert.deepEqual(rows, [["Alpha", "GO", "91%"], ["Beta", "NO-GO", "52%"]]);
  await act(async () => {
    host.querySelector('[data-testid="import-open-log"]').click();
  });
  assert.deepEqual(logs, ["log"]);
});

await check("a failed test shows as 'Not tested' in the summary instead of disappearing", () => {
  const rows = bulkSummaryRows([
    { id: "x", name: "Fails", submitState: "failed" },
    { id: "y", name: "Draft", submitState: "" },
    { id: "z", name: "Done", submitState: "submitted", verdict: "WATCH", pct: 78 },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.verdict, r.score]), [["Fails", "Not tested", "—"], ["Done", "WATCH", "78%"]]);
});
// ---- the page wiring (source) ----
const panel = read("../src/IdeaImportPanel.jsx");
const app = read("../src/App.jsx");
const form = read("../src/PropositionForm.jsx");
await check("two upload buttons: one idea, and bulk; the bulk one sends mode=bulk", () => {
  assert.match(panel, /data-testid="import-upload"/);
  assert.match(panel, /data-testid="import-upload-bulk"/);
  assert.match(panel, /Bulk upload \(many ideas\)/);
  assert.match(panel, /mode: modeRef\.current/);
  assert.match(panel, /modeRef\.current = "bulk"/);
  assert.match(panel, /modeRef\.current = "single"/);
});
await check("one idea opens straight into the form; bulk shows Submit all, progress and a verdict/score table", () => {
  assert.match(panel, /modeRef\.current === "single" && createdIdeas\.length === 1/);
  assert.match(panel, /data-testid="import-submit-all"/);
  assert.match(panel, /Testing idea/);
  assert.match(panel, /data-testid="import-summary"/);
  assert.match(panel, /<th scope="col">Verdict<\/th>/);
  assert.match(panel, /<th scope="col">Score<\/th>/);
  assert.match(panel, /data-testid="import-open-log"/);
  assert.match(app, /pct: Number\.isFinite\(pct\) \? pct : null/);
  assert.match(app, /onOpenImportedLog=\{openLogTab\}/);
  assert.match(form, /onOpenLog=\{onOpenImportedLog\}/);
});
await check("the text-size control is drawn in the top bar", () => {
  assert.match(app, /id="primus-masthead-slot"/);
  assert.match(form, /createPortal\(textSizeControl, headerSlot\)/);
  assert.match(form, /getElementById\("primus-masthead-slot"\)/);
});

console.log(`PASS Part 151 idea upload (${n} checks)`);
process.exit(0);
