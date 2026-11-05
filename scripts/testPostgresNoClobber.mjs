/**
 * Postgres no-clobber proof. Uses TEST_DATABASE_URL only.
 * A missing URL prints POSTGRES SUITE SKIPPED and does not touch DATABASE_URL.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const SKIP = "POSTGRES SUITE SKIPPED — TEST_DATABASE_URL is not set. Postgres no-clobber tests did not run.";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.error(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
// Draft/ownership paths assume parked auth unless a case opts in.
if (!String(process.env.REQUIRE_AUTH || "").trim()) process.env.REQUIRE_AUTH = "false";
// Draft/ownership paths assume parked auth unless a case opts in.
if (!String(process.env.REQUIRE_AUTH || "").trim()) process.env.REQUIRE_AUTH = "false";

function hostAllowed(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

if (!hostAllowed(testUrl)) {
  console.error("Refusing TEST_DATABASE_URL: host is not local or a private scratch database.");
  process.exit(1);
}
if (/render\.com|neon\.tech|supabase\.co/i.test(testUrl)) {
  console.error("Refusing TEST_DATABASE_URL: host is not a private scratch database.");
  process.exit(1);
}
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-pg-${process.pid}`);

try {
const { query, initDb, createProposition, getPropositionById, updateProposition, setPropositionDivision, setPropositionManagerReview, setPropositionFinalSummary, deleteProposition, restoreDeletedProposition, markResearchRun } = await import("../lib/db.js");
const { handlePropositionDraft, handlePropositionById, handlePropositionRefreshField, handlePropositionRetryStep, handlePropositionConceptCard } = await import("../lib/propositionsApi.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM, emptyPropositionDoc } = await import("../lib/propositionFields.js");

await initDb();

function sample(field) {
  if (field.type === "checkbox") return true;
  if (field.key === "declaredGap") return 3;
  if (field.key === "netMarginAtScale") return 55;
  if (field.key === "gstRatePct") return 18;
  if (field.key === "mrpInr") return 299;
  if (field.key === "cogsAtScale") return 80;
  if (field.type === "number") return 18;
  if (field.key === "growthRoute") return "penetration";
  if (field.key === "forumVerdict") return "pass";
  if (field.key === "submitterDepartment") return "R&D";
  if (field.key === "grammage") return "50 ml";
  if (field.key === "benchmark") return "Dove Scalp Serum 100 ml";
  if (field.key === "declaredAttribute") return "hair growth";
  if (field.key === "growthArgument") return "households growing in hair care with CMI numbers";
  if (field.key === "plannedAnnualIncreasePct" || field.type === "price-resilience") return 5;
  if (field.key === "priceResilienceNote" || field.type === "readonly-note") return null;
  if (field.key === "marginElasticity" || field.type === "computed-range") return { minMrpInr: 40, maxMrpInr: 90 };
  if (field.key === "techShiftRisk" || field.type === "computed-risk") {
    return { dimensions: { functionalCoreStability: { risk: "Low" } } };
  }
  if (field.type === "computed") return 12;
  if (field.key === "ideaDescription") return "A leave-in hair growth serum for Indian women with thinning hair.";
  return "field-ok";
}

const roundFields = [
  ...PROPOSITION_TOP_FIELDS.map((field) => ({ ...field, filterKey: "" })),
  ...SIX_FILTERS_FORM.flatMap((spec) => [
    { key: "forumVerdict", type: "select", filterKey: spec.key },
    { key: "verdictNote", type: "text", filterKey: spec.key },
    ...spec.fields.map((field) => ({ ...field, filterKey: spec.key })),
  ]),
];
const broken = [];
let roundTrip = 0;
const created = await createProposition({ submitterDepartment: "R&D" });
for (const field of roundFields) {
  const value = sample(field);
  const input = emptyPropositionDoc(created.id);
  if (field.filterKey) input[field.filterKey] = { [field.key]: value };
  else input[field.key] = value;
  // Part 134 — MRP without override is always recomputed; pin override (+ COGS/GST) for the typed shelf price.
  if (field.key === "mrpInr" || field.type === "derived-mrp") {
    input.f2 = {
      ...(input.f2 || {}),
      mrpOverride: true,
      mrpInr: value,
      cogsAtScale: 80,
      gstRatePct: 18,
    };
  }
  const saved = await updateProposition(created.id, input, { handler: "round-trip", allowFilterReset: true });
  const got = field.filterKey ? saved?.[field.filterKey]?.[field.key] : saved?.[field.key];
  const kept =
    field.key === "plannedAnnualIncreasePct" || field.type === "price-resilience"
      ? Number(got) === 5
      : field.key === "priceResilienceNote" || field.type === "readonly-note"
      ? got == null
      : field.key === "marginElasticity" || field.type === "computed-range"
      ? Number(got?.minMrpInr) === 40 && Number(got?.maxMrpInr) === 90
      : field.key === "techShiftRisk" || field.type === "computed-risk"
        ? got?.dimensions?.functionalCoreStability?.risk === "Low"
        : field.type === "checkbox"
          ? got === true
          : field.type === "computed"
            ? got === 12 || got == null || Number.isFinite(Number(got))
            : field.key === "mrpInr" || field.type === "derived-mrp"
              ? Number(got) === Number(value)
              : got === value;
  if (kept) roundTrip += 1;
  else broken.push(`${field.filterKey || "top"}.${field.key}`);
}
assert.deepEqual(broken, [], `round-trip lost ${broken.join(" ")}`);
assert.ok(roundTrip >= 50, `round-trip fields ${roundTrip}`);
const input = emptyPropositionDoc(created.id);
input.submitterName = "Postgres Tester";
input.submitterDepartment = "R&D";
input.name = "Round trip";
input.category = "Hair oils";
input.ideaDescription = "Scratch row for the postgres no-clobber proof.";
for (const spec of SIX_FILTERS_FORM) {
  for (const field of spec.fields) input[spec.key][field.key] = sample(field);
}
await updateProposition(created.id, input, { handler: "round-trip", allowFilterReset: true });

async function snapshot(id) {
  const rows = await query(`SELECT * FROM propositions WHERE id = $1`, [id]);
  return rows[0];
}

function changedColumns(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed.sort();
}

function assertOnly(before, after, allowed) {
  const changed = changedColumns(before, after);
  const extra = changed.filter((key) => !allowed.includes(key) && key !== "updated_at" && key !== "version");
  assert.deepEqual(extra, [], `unexpected columns changed: ${extra.join(",")}`);
}

await markResearchRun(created.id, {
  stepsExpected: ["F1", "noCompetitor", "F2", "F3", "F4", "F5"],
  stepsDone: ["F1", "noCompetitor", "F2", "F3", "F4", "F5"],
  stepsFailed: [],
});
const user = { department: "R&D", role: "ADMIN" };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}
const redactSecrets = (message) => String(message || "");
const doc = await getPropositionById(created.id);

let before = await snapshot(created.id);
await handlePropositionDraft(
  { method: "POST", user, body: { proposition: { ...doc, name: "Round trip saved" } } },
  { statusCode: 0, end() {} },
  created.id,
  { sendJson, redactSecrets }
);
assertOnly(before, await snapshot(created.id), ["name"]);

before = await snapshot(created.id);
await handlePropositionGoNogo(
  { method: "POST", user, body: { proposition: { ...doc, f1: { forumVerdict: "", verdictNote: "" }, f3: { forumVerdict: "", verdictNote: "" } } } },
  { statusCode: 0, end() {} },
  created.id,
  { sendJson, redactSecrets }
);
assertOnly(before, await snapshot(created.id), ["go_nogo_json"]);

before = await snapshot(created.id);
await updateProposition(created.id, {
  f1: { ...doc.f1, forumVerdict: "pass", verdictNote: "noted" },
}, { handler: "forum" });
assertOnly(before, await snapshot(created.id), ["f1_json"]);

before = await snapshot(created.id);
await updateProposition(created.id, {
  marketResearchProof: { name: "proof.pdf", mediaType: "application/pdf", data: "abc" },
}, { handler: "proof" });
assertOnly(before, await snapshot(created.id), ["proof_json"]);

before = await snapshot(created.id);
await setPropositionManagerReview(created.id, { comment: "Looks fine", requestedAt: new Date().toISOString() });
assertOnly(before, await snapshot(created.id), ["manager_review_json"]);

before = await snapshot(created.id);
await setPropositionManagerReview(created.id, { comment: "Approved", approvedAt: new Date().toISOString(), status: "approved" });
assertOnly(before, await snapshot(created.id), ["manager_review_json"]);

before = await snapshot(created.id);
await setPropositionFinalSummary(created.id, { summaryText: "Closed.", expectedBusinessImpact: "Small" });
assertOnly(before, await snapshot(created.id), ["final_summary_json"]);

before = await snapshot(created.id);
await setPropositionDivision(created.id, "Personal Care");
assertOnly(before, await snapshot(created.id), ["division"]);

before = await snapshot(created.id);
try {
  await handlePropositionRefreshField(
    { method: "POST", user, body: { field: "grammage", proposition: doc } },
    { statusCode: 0, end() {} },
    created.id,
    { sendJson, redactSecrets }
  );
} catch {
  /* refresh may stop before a model call; it must not write filters */
}
assertOnly(before, await snapshot(created.id), []);

before = await snapshot(created.id);
try {
  await handlePropositionRetryStep(
    { method: "POST", user, body: { missing: true } },
    { statusCode: 0, end() {} },
    created.id,
    { readBody: async () => ({ missing: true }), sendJson, redactSecrets }
  );
} catch {
  /* no model spend in this proof */
}
assertOnly(before, await snapshot(created.id), ["research_findings_json", "research_run_at"]);

before = await snapshot(created.id);
try {
  await handlePropositionRetryStep(
    { method: "POST", user, body: { step: "F3" } },
    { statusCode: 0, end() {} },
    created.id,
    { readBody: async () => ({ step: "F3" }), sendJson, redactSecrets }
  );
} catch {
  /* retry stops before a model call */
}
assertOnly(before, await snapshot(created.id), ["research_findings_json", "research_run_at"]);

before = await snapshot(created.id);
try {
  await handlePropositionConceptCard(
    { method: "POST", user },
    { statusCode: 0, end() {} },
    created.id,
    {
      readBody: async () => ({ attachment: { name: "card.pdf", mediaType: "application/pdf", data: "abc" } }),
      sendJson,
      redactSecrets,
    }
  );
} catch {
  /* concept-card extraction stops before a model call */
}
assertOnly(before, await snapshot(created.id), ["f1_json"]);

before = await snapshot(created.id);
const currentForSubmit = await getPropositionById(created.id);
await handlePropositionById(
  { method: "PUT", user },
  { statusCode: 0, end() {} },
  created.id,
  {
    readBody: async () => ({ proposition: currentForSubmit, confirmMissingSteps: false }),
    sendJson,
    redactSecrets,
  }
);
const afterSubmit = await snapshot(created.id);
const submitChanged = changedColumns(before, afterSubmit);
for (const key of ["f1_json", "f2_json", "f3_json", "f4_json", "f5_json", "f6_json"]) {
  assert.equal(JSON.stringify(before[key]), JSON.stringify(afterSubmit[key]), `${key} changed on submit`);
}
assert.ok(submitChanged.length >= 0);

const filters = {
  f1: before.f1_json,
  f2: before.f2_json,
  f3: before.f3_json,
  f4: before.f4_json,
};
await deleteProposition(created.id, "Master");
const gone = await getPropositionById(created.id);
assert.equal(gone, null);
await restoreDeletedProposition(created.id);
const restored = await snapshot(created.id);
assert.equal(JSON.stringify(restored.f1_json), JSON.stringify(filters.f1));
assert.equal(JSON.stringify(restored.f2_json), JSON.stringify(filters.f2));
assert.equal(JSON.stringify(restored.f3_json), JSON.stringify(filters.f3));
assert.equal(JSON.stringify(restored.f4_json), JSON.stringify(filters.f4));

const e2e = await createProposition({ submitterDepartment: "R&D" });
const e2eDoc = emptyPropositionDoc(e2e.id);
e2eDoc.submitterName = "Postgres Tester";
e2eDoc.submitterDepartment = "R&D";
e2eDoc.name = "Scratch submit";
e2eDoc.category = "Hair oils";
e2eDoc.ideaDescription = `Scratch row ${process.pid}-${Date.now()}`;
for (const spec of SIX_FILTERS_FORM) {
  for (const field of spec.fields) e2eDoc[spec.key][field.key] = sample(field);
}
delete e2eDoc.f4.techShiftRisk;
await updateProposition(e2e.id, e2eDoc, { handler: "e2e-seed", allowFilterReset: true });
for (const key of Object.keys(process.env)) {
  if (key === "ANTHROPIC_API_KEY" || key.startsWith("DEPT_API_KEY")) delete process.env[key];
}
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;
const realFetch = globalThis.fetch;
let stubCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.anthropic.com")) {
    stubCalls += 1;
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "{\"status\":\"stub\"}" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(url, options);
};
const beforeE2e = await snapshot(e2e.id);
const e2eRes = { statusCode: 0, end() {} };
try {
  await handlePropositionById(
    { method: "PUT", user },
    e2eRes,
    e2e.id,
    {
      readBody: async () => ({ proposition: await getPropositionById(e2e.id) }),
      sendJson,
      redactSecrets,
    }
  );
} finally {
  globalThis.fetch = realFetch;
}
const afterE2e = await snapshot(e2e.id);
const e2eChanged = changedColumns(beforeE2e, afterE2e);
const e2eKeys = Object.keys(beforeE2e);
console.log(
  `e2e-submit status=${e2eRes.statusCode} stubCalls=${stubCalls} columns=${e2eKeys.length} changed=${e2eChanged.join(",") || "-"}`
);
assert.ok(stubCalls > 0, "stubbed model was not called");
// Part 136 — go_nogo_json is written only when every required evaluation step finishes
// (sealed output). Incomplete Submit still updates findings / F4 / version.
for (const col of ["f4_json", "research_findings_json", "updated_at", "version"]) {
  assert.ok(e2eChanged.includes(col), `e2e-submit must change ${col}`);
}
assert.ok(
  e2eChanged.every((c) =>
    [
      "division",
      "f2_json",
      "f3_json",
      "f4_json",
      "go_nogo_json",
      "research_findings_json",
      "research_run_at",
      "updated_at",
      "version",
    ].includes(c)
  ),
  `unexpected e2e columns: ${e2eChanged.join(",")}`
);

const partial = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(partial.id, {
  f1: { declaredAttribute: "strength", benchmark: "Brand", declaredGap: 3 },
  f2: { cogsAtScale: 40, netMarginAtScale: 20, grammage: "100g" },
  f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 } },
}, { handler: "seed", writer: "server" });
const partialSaved = await updateProposition(partial.id, {
  f1: { declaredAttribute: "strength" },
  f3: { marginElasticity: { minMrpInr: 1, maxMrpInr: 2 }, forumVerdict: "pass" },
}, { handler: "client-partial" });
assert.equal(partialSaved.f1.benchmark, "Brand");
assert.equal(partialSaved.f1.declaredAttribute, "strength");
assert.equal(Number(partialSaved.f2.cogsAtScale), 40);
// Part 135 — legacy marginElasticity is no longer a locked research form field; client may replace it.
assert.equal(Number(partialSaved.f3.marginElasticity.minMrpInr), 1);
assert.equal(partialSaved.f3.forumVerdict, "pass");
const cleared = await updateProposition(partial.id, {
  f3: { forumVerdict: "pass" },
  clearKeys: ["f3.marginElasticity"],
}, { handler: "client-clear" });
assert.equal(cleared.f3.marginElasticity, undefined);
const audits = await query(
  `SELECT action, actor, ids_json FROM proposition_audit WHERE action = 'blocked-key-removal' AND actor = 'client-partial'`
);
assert.ok(audits.length >= 1);
const auditIds = JSON.stringify(audits.map((row) => row.ids_json));
assert.match(auditIds, /f1\.benchmark/);
assert.doesNotMatch(auditIds, /Brand/);

for (const team of ["R&D", "NPD", "Marketing"]) {
  const row = await createProposition({ submitterDepartment: team });
  const doc = emptyPropositionDoc(row.id);
  doc.submitterName = "Tester";
  doc.submitterDepartment = team;
  doc.name = "Scratch";
  doc.category = "Hair oils";
  doc.ideaDescription = `Scratch ${team} ${process.pid}`;
  doc.f1 = { declaredAttribute: "strength", benchmark: "Brand", declaredGap: 3 };
  doc.f2 = { cogsAtScale: 40, netMarginAtScale: 20 };
  const seeded = await updateProposition(row.id, doc, { handler: "seed", writer: "server" });
  const stale = JSON.parse(JSON.stringify(seeded));
  await updateProposition(row.id, {
    f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 } },
    f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } },
  }, { handler: "research-fill", writer: "server" });
  stale.f1 = { ...stale.f1, declaredAttribute: "strength-edited" };
  stale.f2 = { ...stale.f2, cogsAtScale: 41 };
  await handlePropositionDraft(
    { method: "POST", user: { department: team, role: team } },
    { statusCode: 0, end() {} },
    row.id,
    { readBody: async () => ({ proposition: stale }), sendJson, redactSecrets }
  );
  const after = await getPropositionById(row.id);
  assert.equal(Number(after.f3?.marginElasticity?.minMrpInr), 40, `${team} lost F3`);
  assert.equal(after.f4?.techShiftRisk?.dimensions?.functionalCoreStability?.risk, "Low", `${team} lost F4`);
  assert.equal(after.f1.declaredAttribute, "strength-edited");
  assert.equal(Number(after.f2.cogsAtScale), 41);
  console.log(`team-save ${team} f3=kept f4=kept`);
}

const { isServerOwnedFilterKey } = await import("../lib/filterWriteGuard.js");
const clearRow = await createProposition({ submitterDepartment: "NPD" });
const humanFields = [];
for (const spec of SIX_FILTERS_FORM) {
  humanFields.push({ column: spec.key, key: "forumVerdict", type: "select" });
  humanFields.push({ column: spec.key, key: "verdictNote", type: "text" });
  for (const field of spec.fields) {
    if (!isServerOwnedFilterKey(field.key)) humanFields.push({ column: spec.key, key: field.key, type: field.type });
  }
}
function filled(type) {
  if (type === "checkbox") return true;
  if (type === "number") return 21;
  if (type === "range-override") return { minMrpInr: 55, maxMrpInr: 80 };
  if (type === "mitigation-map") return { functionalCoreStability: "Signed lab report Q1 2026" };
  if (type === "select") return "pass";
  return "typed";
}
function isCleared(got, blank) {
  if (blank === "") return got == null || got === "";
  return got == null;
}
for (const field of humanFields) {
  for (const blank of ["", null, undefined]) {
    if (field.type === "checkbox") continue;
    const seed = filled(field.type);
    await updateProposition(clearRow.id, { [field.column]: { [field.key]: seed } }, { handler: "clear-seed", writer: "server", allowFilterReset: true });
    const current = await getPropositionById(clearRow.id);
    const filter = { ...(current[field.column] || {}), [field.key]: blank };
    const res = { statusCode: 0, body: null, end() {} };
    await handlePropositionDraft(
      { method: "POST", user: { department: "NPD", role: "NPD" } },
      res,
      clearRow.id,
      { readBody: async () => ({ proposition: { ...current, [field.column]: filter, version: current.version } }), sendJson, redactSecrets }
    );
    assert.equal(res.statusCode, 200, `clear ${field.column}.${field.key}`);
    const after = await getPropositionById(clearRow.id);
    const got = after?.[field.column]?.[field.key];
    assert.ok(isCleared(got, blank), `${field.column}.${field.key} blank ${String(blank)} stayed ${JSON.stringify(got)}`);
  }
  if (field.type === "checkbox") {
    await updateProposition(clearRow.id, { [field.column]: { [field.key]: true } }, { handler: "clear-seed", writer: "server", allowFilterReset: true });
    const current = await getPropositionById(clearRow.id);
    const res = { statusCode: 0, body: null, end() {} };
    await handlePropositionDraft(
      { method: "POST", user: { department: "NPD", role: "NPD" } },
      res,
      clearRow.id,
      {
        readBody: async () => ({
          proposition: { ...current, [field.column]: { ...current[field.column], [field.key]: false }, version: current.version },
        }),
        sendJson,
        redactSecrets,
      }
    );
    const after = await getPropositionById(clearRow.id);
    const unchecked = after?.[field.column]?.[field.key];
    assert.ok(unchecked == null || unchecked === false, `${field.column}.${field.key} checkbox`);
  }
}
console.log(`human-clears fields=${humanFields.length}`);

const staleKeep = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(staleKeep.id, {
  f2: { cogsAtScale: 40, netMarginAtScale: 22, gstRatePct: 18, grammage: "100g", mrpInr: 80 },
  f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 }, f3RangeOverride: { minMrpInr: 55 } },
  f4: {
    techShiftRisk: { dimensions: { functionalCoreStability: { risk: "High", reason: "shift", userResponse: "Signed contract Q1" } } },
  },
  f1: { forumVerdict: "pass", verdictNote: "forum note" },
}, { handler: "prefill", writer: "server", allowFilterReset: true });
const loaded = await getPropositionById(staleKeep.id);
assert.equal(loaded.f4.f4MitigationResponses.functionalCoreStability, "Signed contract Q1");
await updateProposition(staleKeep.id, { name: "bumped" }, { handler: "bump", bumpVersion: true });
const staleDoc = JSON.parse(JSON.stringify(loaded));
delete staleDoc.f2.cogsAtScale;
staleDoc.f2.netMarginAtScale = "";
staleDoc.f2.gstRatePct = null;
staleDoc.f2.grammage = undefined;
staleDoc.f2.mrpInr = undefined;
const staleRes = { statusCode: 0, body: null, end() {} };
await handlePropositionDraft(
  { method: "POST", user: { department: "R&D", role: "R&D" } },
  staleRes,
  staleKeep.id,
  { readBody: async () => ({ proposition: staleDoc }), sendJson, redactSecrets }
);
const keptPrefill = await getPropositionById(staleKeep.id);
assert.equal(Number(keptPrefill.f2.cogsAtScale), 40);
assert.equal(Number(keptPrefill.f2.netMarginAtScale), 22);
assert.equal(Number(keptPrefill.f2.gstRatePct), 18);
assert.equal(keptPrefill.f2.grammage, "100g");
// Part 134 — MRP is re-derived on save from COGS/margin/GST (not a typed lock).
assert.equal(Number(keptPrefill.f2.mrpInr), 60.51);
assert.equal(Number(keptPrefill.f3.f3RangeOverride.minMrpInr), 55);
assert.equal(Number(keptPrefill.f3.marginElasticity.minMrpInr), 40);
assert.equal(keptPrefill.f4.f4MitigationResponses.functionalCoreStability, "Signed contract Q1");
assert.equal(keptPrefill.f1.forumVerdict, "pass");
assert.ok(Array.isArray(staleRes.body?.ignoredKeys) && staleRes.body.ignoredKeys.includes("f2.cogsAtScale"));
const teamAudit = await query(
  `SELECT actor FROM proposition_audit WHERE action = 'blocked-key-removal' AND actor LIKE '%|R&D' ORDER BY audit_id DESC LIMIT 5`
);
assert.ok(teamAudit.length >= 1, "audit row missing session team");
console.log("stale-prefill kept ignoredKeys=yes team=R&D");

console.log(`PASS postgres no-clobber roundTrip=${roundTrip}`);
} finally {
  const { closeDatabase } = await import("../lib/db.js");
  await closeDatabase();
  await suite.drop();
}
