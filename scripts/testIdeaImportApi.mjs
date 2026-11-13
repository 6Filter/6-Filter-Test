/**
 * Part 140 D — the import routes: registered before the `:id` matcher (source), served by the real
 * dispatcher with REQUIRE_AUTH=false, the template downloads, an import creates drafts.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

process.env.REQUIRE_AUTH = "false";
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-import-api-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
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

// ───────────────────────────── source: order and files ─────────────────────────────
await check("router registers import routes before the :id matcher", () => {
  const src = read("../lib/apiRouter.js");
  const tpl = src.indexOf('url === "/api/propositions/import-template"');
  const imp = src.indexOf('url === "/api/propositions/import"');
  const byId = src.indexOf("const propositionMatch = url.match(");
  assert.ok(tpl > 0 && imp > 0 && byId > 0, "all three found");
  assert.ok(tpl < byId && imp < byId, "import routes come before the :id route");
  assert.match(src, /bucket: "prop-import"/, "import is rate limited");
  assert.match(src, /handleIdeaImport/);
  assert.match(src, /handleImportTemplate/);
});

await check("Vercel function files exist for both routes", () => {
  for (const f of ["../api/propositions/import.js", "../api/propositions/import-template.js"]) {
    assert.ok(existsSync(new URL(f, import.meta.url)), f);
  }
  assert.match(read("../api/propositions/import.js"), /handleIdeaImport/);
  assert.match(read("../api/propositions/import-template.js"), /handleImportTemplate/);
});

// ───────────────────────────── live: real dispatcher over http ─────────────────────────────
const { handleApiRequest } = await import("../lib/apiRouter.js");
const { initDb } = await import("../lib/db.js");
const { clearRateLimits } = await import("../lib/rateLimit.js");
const { IMPORT_FIELDS, buildImportTemplateBuffer } = await import("../lib/ideaImport.js");
await initDb();

const server = createServer(async (req, res) => {
  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end("no");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function api(pathname, init = {}) {
  const res = await fetch(`${base}${pathname}`, init);
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    /* binary */
  }
  return { res, buf, json };
}

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
const attach = (buf, name = "ideas.xlsx") => ({
  attachment: {
    name,
    data: buf.toString("base64"),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
const post = (body) =>
  api("/api/propositions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

try {
  await check("GET import-template is a 200 xlsx download (not read as an id)", async () => {
    const { res, buf } = await api("/api/propositions/import-template");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /spreadsheetml\.sheet/);
    assert.match(res.headers.get("content-disposition"), /attachment; filename="Primus-idea-import-template\.xlsx"/);
    assert.equal(buf[0], 0x50, "zip magic");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Ideas", "Guide"]);
  });

  await check("POST import no longer falls into :id (was 405)", async () => {
    const { res, json } = await api("/api/propositions/import", { method: "GET" });
    assert.equal(res.status, 405);
    assert.equal(json.error, "POST only.", "answered by the import handler, not the :id handler");
    const bad = await post({});
    assert.equal(bad.res.status, 400);
    assert.match(bad.json.error, /Choose an Excel, Word or PDF file/);
  });

  let created;
  await check("import creates drafts and answers { created, rejected }", async () => {
    clearRateLimits();
    const buf = await filledTemplate([
      {
        name: "Cooling hair oil",
        category: "Hair oils",
        ideaDescription: "A menthol hair oil for summer.",
        "f1.benchmark": "Parachute Cooling 100 ml",
        "f1.declaredGap": 3,
        "f2.gstRatePct": 18,
        "f2.grammage": "100 ml",
      },
      { name: "Protein bar", "f2.cogsAtScale": 22 },
    ]);
    const { res, json } = await post(attach(buf));
    assert.equal(res.status, 201, JSON.stringify(json));
    assert.equal(json.created.length, 2);
    assert.deepEqual(json.rejected, []);
    created = json.created;
    const [a, b] = created;
    assert.ok(a.id && b.id && a.id !== b.id);
    assert.equal(a.name, "Cooling hair oil");
    assert.deepEqual(a.filled.sort(), [
      "category", "f1.benchmark", "f1.declaredGap", "f2.gstRatePct", "f2.grammage", "ideaDescription", "name",
    ].sort());
    for (const key of ["warnings", "ignoredColumns", "missingRequired", "dropped"]) {
      assert.ok(Array.isArray(a[key]), `${key} is a list`);
    }
    assert.ok(b.missingRequired.includes("Category") && b.missingRequired.includes("Idea description"), "required boxes still empty are named");
    assert.ok(!b.missingRequired.includes("Proposition name"));
  });

  await check("the draft holds the values, is unscored, and remembers where each value came from", async () => {
    const { res, json } = await api(`/api/propositions/${created[0].id}`);
    assert.equal(res.status, 200);
    const p = json.proposition || json;
    assert.equal(p.name, "Cooling hair oil");
    assert.equal(p.category, "Hair oils");
    assert.equal(p.ideaDescription, "A menthol hair oil for summer.");
    assert.equal(p.f1.benchmark, "Parachute Cooling 100 ml");
    assert.equal(Number(p.f1.declaredGap), 3);
    assert.equal(Number(p.f2.gstRatePct), 18);
    assert.equal(p.f2.grammage, "100 ml");
    assert.equal(p.researchRunAt, null, "nothing was researched");
    assert.ok(!p.goNoGo, "nothing was scored");
    assert.deepEqual(p.researchFindings?.fieldSources?.name, { source: "upload", cell: "A3" });
    assert.equal(p.researchFindings.fieldSources["f1.benchmark"].source, "upload");
    assert.match(p.researchFindings.fieldSources["f1.benchmark"].cell, /^[A-Z]+3$/);
    const second = await api(`/api/propositions/${created[1].id}`);
    assert.equal((second.json.proposition || second.json).name, "Protein bar");
    assert.equal(Number((second.json.proposition || second.json).f2.cogsAtScale), 22);
  });

  await check("drafts appear in the list; the upload is not a duplicate-per-call", async () => {
    const { json } = await api("/api/propositions?limit=50");
    const ids = new Set((json.propositions || []).map((p) => p.id));
    assert.ok(ids.has(created[0].id) && ids.has(created[1].id));
  });

  await check("more than 200 ideas: plain 400, nothing created", async () => {
    clearRateLimits();
    const before = (await api("/api/propositions?limit=500")).json.propositions.length;
    const rows = Array.from({ length: 201 }, (_, i) => ({ name: `Idea ${i + 1}` }));
    const { res, json } = await post(attach(await filledTemplate(rows)));
    assert.equal(res.status, 400);
    assert.match(json.error, /201 ideas.*limit is 200/);
    const after = (await api("/api/propositions?limit=500")).json.propositions.length;
    assert.equal(after, before, "no drafts were made");
  });

  await check("wrong file kinds and empty uploads are plain 400s", async () => {
    clearRateLimits();
    const img = await post({ attachment: { name: "x.png", data: Buffer.from("hi").toString("base64"), mediaType: "image/png" } });
    assert.equal(img.res.status, 400);
    assert.match(img.json.error, /Excel, Word or PDF/);
    const old = await post({ attachment: { name: "x.xls", data: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]).toString("base64") } });
    assert.equal(old.res.status, 400);
    assert.match(old.json.error, /\.xlsx/);
    const empty = await post({ attachment: { name: "x.xlsx", data: "" } });
    assert.equal(empty.res.status, 400);
  });

  await check("the import route is rate limited", async () => {
    clearRateLimits();
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await post({})).res.status);
    assert.ok(statuses.includes(429), `got ${statuses.join(",")}`);
    clearRateLimits();
  });
} finally {
  await new Promise((r) => server.close(r));
}

console.log(`testIdeaImportApi: ${checks} checks passed`);
process.exit(0);
