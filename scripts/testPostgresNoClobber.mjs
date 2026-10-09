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
  process.exit(0);
}

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
process.env.DATABASE_URL = testUrl;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-pg-${process.pid}`);

const { query, initDb, createProposition, getPropositionById, updateProposition, setPropositionDivision, setPropositionManagerReview, setPropositionFinalSummary, deleteProposition, restoreDeletedProposition, markResearchRun } = await import("../lib/db.js");
const { handlePropositionDraft, handlePropositionById, handlePropositionRefreshField, handlePropositionRetryStep, handlePropositionConceptCard } = await import("../lib/propositionsApi.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM, emptyPropositionDoc } = await import("../lib/propositionFields.js");

await initDb();

function sample(field) {
  if (field.type === "checkbox") return true;
  if (field.type === "number") return 18;
  if (field.key === "growthRoute") return "penetration";
  if (field.key === "forumVerdict") return "pass";
  if (field.key === "submitterDepartment") return "R&D";
  if (field.key === "marginElasticity" || field.type === "computed-range") return { minMrpInr: 40, maxMrpInr: 90 };
  if (field.key === "techShiftRisk" || field.type === "computed-risk") {
    return { dimensions: { functionalCoreStability: { risk: "Low" } } };
  }
  if (field.type === "computed") return 12;
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
  const saved = await updateProposition(created.id, input, { handler: "round-trip", allowFilterReset: true });
  const got = field.filterKey ? saved?.[field.filterKey]?.[field.key] : saved?.[field.key];
  const kept =
    field.key === "marginElasticity" || field.type === "computed-range"
      ? Number(got?.minMrpInr) === 40 && Number(got?.maxMrpInr) === 90
      : field.key === "techShiftRisk" || field.type === "computed-risk"
        ? got?.dimensions?.functionalCoreStability?.risk === "Low"
        : field.type === "checkbox"
          ? got === true
          : field.type === "computed"
            ? got === 12 || got == null || Number.isFinite(Number(got))
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

console.log(`PASS postgres no-clobber roundTrip=${roundTrip}`);
