/**
 * End-to-end verification on the file store (no Postgres, no real model, no live data):
 *  1. Every form input saves and reads back unchanged (draft save + reload).
 *  2. Submit sends the typed values to the AI, and research calls carry the web_search tool.
 *  3. Output lock: the same entries give the same score and verdict every time,
 *     even when the AI answers differently on each call; changing a scoring input moves it.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-verify-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";
for (const key of Object.keys(process.env)) {
  if (key === "ANTHROPIC_API_KEY" || key.startsWith("DEPT_API_KEY")) delete process.env[key];
}
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;

const { initDb, createProposition, getPropositionById } = await import("../lib/db.js");
const { handlePropositionDraft, handlePropositionById } = await import("../lib/propositionsApi.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { SIX_FILTERS_FORM, emptyPropositionDoc } = await import("../lib/propositionFields.js");
await initDb();

const user = { department: "R&D", role: "NPD" };
const dep = { readBody: null, sendJson, redactSecrets: (m) => m };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
async function call(handler, method, id, body) {
  const res = { statusCode: 0, body: null, end() {} };
  await handler({ method, user, headers: {} }, res, id, { ...dep, readBody: async () => body });
  return res;
}

let checks = 0;
function ok(name, cond, detail = "") {
  assert.ok(cond, `${name} ${detail}`);
  checks += 1;
  console.log(`  ok ${checks} — ${name}`);
}

// ---------- 1. Every input saves and reads back ----------
const TYPED = {
  "f1.declaredAttribute": "softness",
  "f1.benchmark": "Brand Soft Serum 100 ml",
  "f1.declaredGap": 3,
  "f1.gapDerivation": "lasts longer than the benchmark",
  "f1.parityExceptions": "none material",
  "f1.growthRoute": "penetration",
  "f1.growthArgument": "category still adding households",
  "f2.grammage": "100 ml",
  "f2.netMarginAtScale": 55,
  "f2.cogsAtScale": 80,
  "f2.gstRatePct": 18,
  "f3.plannedAnnualIncreasePct": 5,
};
function buildDoc(id, label, overrides = {}) {
  const doc = emptyPropositionDoc(id);
  doc.submitterName = "Verify Tester";
  doc.submitterDepartment = "R&D";
  doc.name = `Verify ${label}`;
  doc.category = "Hair oils";
  doc.division = "Personal Care";
  doc.ideaDescription = "Cooling herbal scalp serum for daily use";
  for (const [k, v] of Object.entries({ ...TYPED, ...overrides })) {
    const [f, key] = k.split(".");
    doc[f][key] = v;
  }
  return doc;
}

const row = await createProposition({ submitterDepartment: "R&D" });
const doc = buildDoc(row.id, "roundtrip");
const saved = await call(handlePropositionDraft, "POST", row.id, { proposition: doc });
ok("draft save accepted", saved.statusCode === 200, `status ${saved.statusCode} ${saved.body?.error || ""}`);
const reread = await getPropositionById(row.id);
for (const [k, v] of Object.entries(TYPED)) {
  const [f, key] = k.split(".");
  ok(`${k} saved and read back`, String(reread[f][key]) === String(v), `got ${JSON.stringify(reread[f][key])}`);
}
for (const k of ["name", "category", "division", "ideaDescription"]) {
  ok(`${k} saved and read back`, String(reread[k]) === String(doc[k]), `got ${JSON.stringify(reread[k])}`);
}
ok("MRP is derived from COGS, margin and GST when not overridden", Math.abs(Number(reread.f2.mrpInr) - 209.78) < 0.01, `got ${reread.f2.mrpInr}`);
{
  const r = await createProposition({ submitterDepartment: "R&D" });
  const d = buildDoc(r.id, "override", { "f2.mrpOverride": true, "f2.mrpInr": 299 });
  await call(handlePropositionDraft, "POST", r.id, { proposition: d });
  const back = await getPropositionById(r.id);
  ok("typed MRP is kept when the override box is ticked", Number(back.f2.mrpInr) === 299 && back.f2.mrpOverride === true, `got ${back.f2.mrpInr}`);
}

// ---------- 2. AI receives the entries; research uses web search ----------
const realFetch = globalThis.fetch;
let calls = [];
let wobble = 0;
globalThis.fetch = async (url, options) => {
  if (!String(url).includes("api.anthropic.com")) return realFetch(url, options);
  const body = JSON.parse(options.body);
  calls.push(body);
  wobble += 1;
  // A different answer on every call: determinism must not depend on the model repeating itself.
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ status: "stub", wobble }) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

const submitRow = await createProposition({ submitterDepartment: "R&D" });
const submitDoc = buildDoc(submitRow.id, "submit");
await call(handlePropositionDraft, "POST", submitRow.id, { proposition: submitDoc });
const sub = await call(handlePropositionById, "PUT", submitRow.id, { proposition: submitDoc });
ok("submit accepted", sub.statusCode === 200, `status ${sub.statusCode} ${sub.body?.error || ""}`);
ok("submit called the AI", calls.length > 0, `calls=${calls.length}`);
const prompts = calls.map((c) => JSON.stringify(c.messages) + JSON.stringify(c.system || ""));
ok("AI prompts contain the benchmark you typed", prompts.some((p) => p.includes("Brand Soft Serum")));
ok("AI prompts contain the idea description you typed", prompts.some((p) => p.includes("Cooling herbal scalp serum")));
ok("AI prompts contain the declared attribute", prompts.some((p) => p.includes("softness")));
const searched = calls.filter((c) => (c.tools || []).some((t) => t.name === "web_search"));
ok("research calls carry the web_search tool", searched.length > 0, `${searched.length} of ${calls.length} calls`);
ok("all calls use temperature 0 (or the model's fixed sampling)", calls.every((c) => c.temperature === 0 || c.temperature === undefined));

// ---------- 3. Output lock ----------
// Ideas that need no further research (pure commodity, F4 dimensions on file) so the verdict can seal.
const { updateProposition, markResearchRun } = await import("../lib/db.js");
const F4 = {
  techShiftRisk: {
    dimensions: Object.fromEntries(
      ["functionalCoreStability", "consumptionContextStability", "manufacturingDisruptionRisk", "userHabitShiftPotential", "adjacentSubstitutionThreat", "regulatoryOrStandardsShift", "channelOrFormatDisplacement"].map((k) => [k, { risk: "Low", reason: "stable" }])
    ),
    overallRisk: "Low",
  },
};
async function seedIdea(label, overrides = {}) {
  const r = await createProposition({ submitterDepartment: "R&D" });
  const d = buildDoc(r.id, label, overrides);
  d.f4 = F4;
  d.researchFindings = {
    f1: {
      benchmarkCheck: { researchFailed: false },
      assessments: {
        benchmark: { status: "ok", raw: { relevance: "strong", source_url: "https://example.com/bench" } },
        derivation: { status: "ok", raw: { relevance: "adequate", source_url: "https://example.com/gap" } },
        argument: { status: "ok", raw: { relevance: "adequate", source_url: "https://example.com/growth" } },
        attributes: { status: "ok", raw: { relevance: "strong" } },
        route: { status: "ok", raw: { relevance: "strong" } },
      },
    },
    f3: { priceEventsFound: true, marginElasticityFound: true },
  };
  const findings = d.researchFindings;
  await updateProposition(r.id, d, { handler: "verify-seed", writer: "server", allowFilterReset: true });
  await markResearchRun(r.id, findings);
  return r.id;
}
async function verdictOf(id) {
  const res = await call(handlePropositionGoNogo, "POST", id, { proposition: await getPropositionById(id) });
  assert.equal(res.statusCode, 200, `gate ${id} status ${res.statusCode} ${res.body?.error || ""}`);
  const g = res.body?.goNoGo || {};
  return { state: res.body?.evaluationState, classification: g.classification || null, pct: g.score?.pct ?? null, key: g.scoreInputKey || g.output?.scoreInputKey || null };
}
const show = (v) => `${v.classification}/${v.pct}% state=${v.state}`;

const baseId = await seedIdea("lock-base");
{ const { evaluationStatus } = await import("../lib/evaluationStatus.js"); const st = evaluationStatus(await getPropositionById(baseId)); console.log("  eval status:", st.state, JSON.stringify(st.missing)); }
const first = await verdictOf(baseId);
console.log("  first verdict:", show(first));
ok("a fully-entered idea produces a sealed verdict and score", first.state === "evaluated" && first.classification && first.pct != null, show(first));

for (let i = 0; i < 3; i += 1) {
  const again = await verdictOf(baseId);
  ok(`same idea, evaluated again (${i + 2}): same score and verdict`, again.pct === first.pct && again.classification === first.classification, show(again));
}

// Submit again while the AI answers differently each time.
const before = calls.length;
await call(handlePropositionById, "PUT", baseId, { proposition: await getPropositionById(baseId) });
const afterSubmit = await verdictOf(baseId);
console.log(`  after re-submit (AI calls this round: ${calls.length - before}):`, show(afterSubmit));
ok("re-submit with a different AI answer: same score and verdict", afterSubmit.pct === first.pct && afterSubmit.classification === first.classification, show(afterSubmit));

// Twins: separate ideas with identical entries.
const twins = [];
for (const label of ["twin-a", "twin-b", "twin-c"]) {
  const id = await seedIdea(label);
  twins.push(await verdictOf(id));
}
console.log("  twins:", twins.map(show).join(" | "));
ok("three identical twins: same score", new Set(twins.map((v) => v.pct)).size === 1 && twins[0].pct === first.pct);
ok("three identical twins: same verdict", new Set(twins.map((v) => v.classification)).size === 1 && twins[0].classification === first.classification);

// Changing a scoring input moves the output (the lock is not a freeze).
const movedId = await seedIdea("moved", { "f2.netMarginAtScale": 5, "f2.cogsAtScale": 280, "f1.declaredGap": 0 });
const mv = await verdictOf(movedId);
console.log("  changed margin/COGS/gap:", show(mv));
ok("changing margin, COGS and gap changes the output", mv.pct !== first.pct || mv.classification !== first.classification, show(mv));

globalThis.fetch = realFetch;
console.log(`PASS verifyInputsAiAndLock (${checks} checks)`);
process.exit(0);
