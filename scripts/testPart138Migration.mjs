/**
 * Part 138 I (D52) — GST default-18 cleanup migration.
 * A stored 18% that nobody entered (placeholder / AI / default) is cleared and flagged "GST needed";
 * a person's 18%, a confirmed 18% and a Finance-table rate are never touched. Pure function first,
 * then the real file-store migration (idempotent, no score/verdict fields touched).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "primus-p138-mig-"));
delete process.env.DATABASE_URL;
process.env.GEMINI_API_KEY ||= "test-key";

const { clearPlaceholderGst } = await import("../lib/gstRate.js");
const db = await import("../lib/db.js");

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

// ------------------------------------------------------------------ pure function
await check("placeholder 18 (system note still set) is cleared and flagged GST needed", () => {
  const f2 = { cogsAtScale: 10, gstRatePct: 18, gstBasis: "Default 18% — no Finance rate for this category" };
  const findings = { score: { total: 70 }, f2: { assessments: {} } };
  const out = clearPlaceholderGst(f2, findings);
  assert.equal(out.changed, true);
  assert.equal(out.f2.gstRatePct, "");
  assert.equal(out.f2.gstBasis, "");
  assert.equal(out.f2.cogsAtScale, 10, "other F2 inputs untouched");
  assert.equal(out.researchFindings.gstNeeded, true);
  const gst = out.researchFindings.f2.assessments.gst;
  assert.equal(gst.needed, true);
  assert.equal(gst.gstRatePct, null);
  assert.equal(gst.needsConfirmation, true);
  assert.equal(gst.searchUsed, false, "the cleanup never claims a web check");
});

await check("autofill says the system filled it and nobody confirmed → cleared, entry dropped", () => {
  const f2 = { gstRatePct: "18", gstBasis: "" };
  const findings = {
    autofillStatus: { "f2.gstRatePct": { status: "filled" }, "f2.cogsAtScale": { status: "filled" } },
    autofillReport: { fields: { "f2.gstRatePct": { status: "filled" }, "f2.pack": { status: "filled" } } },
  };
  const out = clearPlaceholderGst(f2, findings);
  assert.equal(out.changed, true);
  assert.equal("f2.gstRatePct" in out.researchFindings.autofillStatus, false);
  assert.equal("f2.gstRatePct" in out.researchFindings.autofillReport.fields, false);
  assert.ok(out.researchFindings.autofillStatus["f2.cogsAtScale"], "other autofill entries kept");
  assert.ok(out.researchFindings.autofillReport.fields["f2.pack"]);
});

await check("a person's 18 (no system note, no autofill entry) is kept", () => {
  const f2 = { gstRatePct: 18, gstBasis: "" };
  const out = clearPlaceholderGst(f2, { autofillStatus: {} });
  assert.equal(out.changed, false);
  assert.equal(out.f2, f2);
  assert.equal(clearPlaceholderGst(f2, null).changed, false);
});

await check("a confirmed 18 is kept even when the system note is set", () => {
  const f2 = { gstRatePct: 18, gstBasis: "AI proposal" };
  const findings = { autofillStatus: { "f2.gstRatePct": { status: "filled", confirmed: true } } };
  assert.equal(clearPlaceholderGst(f2, findings).changed, false);
});

await check("a Finance-table 18 is kept", () => {
  const f2 = { gstRatePct: 18, gstBasis: "Finance rate table — Hair oils" };
  assert.equal(clearPlaceholderGst(f2, { autofillStatus: { "f2.gstRatePct": { status: "filled" } } }).changed, false);
});

await check("a rate other than 18 is never touched", () => {
  for (const rate of [0, 5, 12, 28, "", null, undefined]) {
    const out = clearPlaceholderGst({ gstRatePct: rate, gstBasis: "AI proposal" }, { autofillStatus: { "f2.gstRatePct": { status: "filled" } } });
    assert.equal(out.changed, false, `rate ${rate}`);
  }
});

await check("pure: non-mutating, idempotent, tolerates missing input", () => {
  const f2 = Object.freeze({ gstRatePct: 18, gstBasis: "Default 18%" });
  const findings = Object.freeze({ f2: Object.freeze({ assessments: Object.freeze({}) }) });
  const once = clearPlaceholderGst(f2, findings);
  assert.equal(f2.gstRatePct, 18, "input not mutated");
  const twice = clearPlaceholderGst(once.f2, once.researchFindings);
  assert.equal(twice.changed, false, "second pass is a no-op");
  assert.doesNotThrow(() => clearPlaceholderGst());
  assert.equal(clearPlaceholderGst(undefined, undefined).changed, false);
});

await check("findings with no object: f2 still cleared, no findings invented", () => {
  const out = clearPlaceholderGst({ gstRatePct: 18, gstBasis: "Default 18%" }, null);
  assert.equal(out.changed, true);
  assert.equal(out.researchFindings, null);
});

await check("a prior web-checked flag is carried, not forged", () => {
  const out = clearPlaceholderGst(
    { gstRatePct: 18, gstBasis: "AI proposal" },
    { f2: { assessments: { gst: { searchUsed: true, gstRatePct: 18 } } } }
  );
  assert.equal(out.researchFindings.f2.assessments.gst.searchUsed, true);
  assert.equal(out.researchFindings.f2.assessments.gst.gstRatePct, null, "the placeholder rate is gone");
});

// -------------------------------------------------- real migration over the file store
await db.initDb();
const server = { writer: "server" };

async function seed(name, f2, findings) {
  const created = await db.createProposition({ submitterDepartment: "R&D" });
  await db.updateProposition(created.id, { name, f2: { cogsAtScale: 10, netMarginAtScale: 20, ...f2 } }, server);
  if (findings) await db.updatePropositionResearchFindingsOnly(created.id, findings);
  return created.id;
}

const placeholderId = await seed("placeholder 18", { gstRatePct: 18, gstBasis: "Default 18% — no rate" }, {
  score: { total: 64 },
  f2: { assessments: {} },
});
const humanId = await seed("human 18", { gstRatePct: 18, gstBasis: "" }, { score: { total: 55 } });
const financeId = await seed("finance 18", { gstRatePct: 18, gstBasis: "Finance rate table — Hair oils" }, null);
const otherId = await seed("12 percent", { gstRatePct: 12, gstBasis: "AI proposal" }, null);

const before = await db.getPropositionById(placeholderId);
// the save path may normalise the stored rate; the premise of the test is that it is stored as 18
assert.equal(Number(before.f2.gstRatePct), 18, "seed stored an 18%");

await check("migration (file store) clears only the placeholder 18", async () => {
  const run = await db.migratePart138GstDefault({ postgres: false });
  assert.equal(run.cleared, 1);

  const placeholder = await db.getPropositionById(placeholderId);
  assert.equal(String(placeholder.f2.gstRatePct ?? ""), "");
  assert.equal(placeholder.researchFindings.gstNeeded, true);
  assert.equal(placeholder.researchFindings.f2.assessments.gst.needed, true);

  assert.equal(Number((await db.getPropositionById(humanId)).f2.gstRatePct), 18, "human 18 kept");
  assert.equal(Number((await db.getPropositionById(financeId)).f2.gstRatePct), 18, "Finance 18 kept");
  assert.equal(Number((await db.getPropositionById(otherId)).f2.gstRatePct), 12, "12% kept");
});

await check("migration never touches score or verdict fields", async () => {
  const placeholder = await db.getPropositionById(placeholderId);
  assert.equal(placeholder.researchFindings.score.total, 64);
  const human = await db.getPropositionById(humanId);
  assert.equal(human.researchFindings.score.total, 55);
  assert.equal(human.researchFindings.gstNeeded, undefined, "kept ideas are not flagged");
});

await check("migration is idempotent", async () => {
  const run = await db.migratePart138GstDefault({ postgres: false });
  assert.equal(run.cleared, 0);
  assert.equal(String((await db.getPropositionById(placeholderId)).f2.gstRatePct ?? ""), "");
});

await check("migration is wired into both boot paths", () => {
  const src = fs.readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(src, /await migratePart138GstDefault\(\{ postgres: false \}\)/);
  assert.match(src, /await migratePart138GstDefault\(\{ postgres: true \}\)/);
});

console.log(`PASS testPart138Migration (${checks} checks)`);
process.exit(0);
