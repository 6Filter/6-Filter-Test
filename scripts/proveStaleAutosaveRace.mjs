/**
 * Stale-autosave race. Asserts server-written F3 and F4 survive.
 * On the commit before key-level merge this exits non-zero for the partial
 * and older-value variants. Scratch Postgres only (TEST_DATABASE_URL).
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.error("TEST_DATABASE_URL is not set.");
  process.exit(1);
}
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.DATABASE_URL = testUrl;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-race-${process.pid}`);

const { initDb, createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionDraft } = await import("../lib/propositionsApi.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");

await initDb();

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}

async function seedTeam(label) {
  const row = await createProposition({ submitterDepartment: "NPD" });
  const doc = emptyPropositionDoc(row.id);
  doc.submitterName = "Tester";
  doc.submitterDepartment = "NPD";
  doc.name = label;
  doc.category = "Hair oils";
  doc.ideaDescription = `Race ${label} ${process.pid}`;
  doc.f1 = { declaredAttribute: "strength", benchmark: "Brand", declaredGap: 3 };
  doc.f2 = { cogsAtScale: 40, netMarginAtScale: 20 };
  const seeded = await updateProposition(row.id, doc, { handler: "seed", allowFilterReset: true });
  const stale = JSON.parse(JSON.stringify(seeded));
  await updateProposition(
    row.id,
    {
      f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 } },
      f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } },
    },
    { handler: "research-fill", writer: "server", bumpVersion: true }
  );
  return { id: row.id, stale };
}

async function autosave(id, proposition) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionDraft(
    { method: "POST", user: { department: "NPD", role: "NPD" } },
    res,
    id,
    { readBody: async () => ({ proposition }), sendJson, redactSecrets: (e) => e }
  );
  assert.equal(res.statusCode, 200, `${id} draft status ${res.statusCode}`);
  return getPropositionById(id);
}

function lost(after) {
  const f3 = Number(after?.f3?.marginElasticity?.minMrpInr) !== 40;
  const f4 = after?.f4?.techShiftRisk?.dimensions?.functionalCoreStability?.risk !== "Low";
  return f3 || f4;
}

const cases = [];

{
  const { id, stale } = await seedTeam("part109");
  stale.f1 = { ...stale.f1, declaredAttribute: "strength-edited" };
  stale.f2 = { ...stale.f2, cogsAtScale: 41 };
  const after = await autosave(id, stale);
  cases.push(["part109", lost(after)]);
}

{
  const { id, stale } = await seedTeam("empty");
  stale.f3 = { forumVerdict: "", verdictNote: "", marginElasticity: null };
  stale.f4 = { forumVerdict: "", verdictNote: "", techShiftRisk: null };
  const after = await autosave(id, stale);
  cases.push(["empty", lost(after)]);
}

{
  const { id, stale } = await seedTeam("partial");
  stale.f3 = { forumVerdict: "watch" };
  stale.f4 = { verdictNote: "noted" };
  const after = await autosave(id, stale);
  cases.push(["partial", lost(after)]);
}

{
  const { id, stale } = await seedTeam("older");
  stale.f3 = { marginElasticity: { minMrpInr: 1, maxMrpInr: 2 }, forumVerdict: "watch" };
  stale.f4 = { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "High" } } } };
  const after = await autosave(id, stale);
  cases.push(["older", lost(after)]);
}

for (const [name, didLose] of cases) {
  console.log(`race ${name} ${didLose ? "LOST" : "KEPT"}`);
}
for (const [name, didLose] of cases) {
  assert.equal(didLose, false, `${name} lost server-written F3 or F4`);
}
console.log("PASS stale autosave race");
