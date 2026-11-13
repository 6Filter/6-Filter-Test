/**
 * Part 140 A (D62) — a save never fails because of a server-owned field.
 * Server-owned keys are stripped, reported in ignoredKeys, audited when they differ; never a 403.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-p140-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { SERVER_OWNED_KEYS, stripServerOwnedFields, canEditIdeaInputs } = await import(
  "../lib/fieldOwnership.js"
);
const { firstForbiddenField } = await import("../lib/fieldOwnershipGate.js");

// --- stripServerOwnedFields -------------------------------------------------
for (const key of [
  "marginElasticity",
  "techShiftRisk",
  "computedRevenue",
  "researchFindings",
  "advisoryChecks",
  "suggestions",
  "goNoGo",
]) {
  assert.ok(SERVER_OWNED_KEYS.has(key), `${key} is server-owned`);
}

const risk = { dimensions: { functionalCoreStability: { risk: "High", reason: "client forged" } } };
const original = {
  name: "Keep me",
  goNoGo: { verdict: "GO" },
  suggestions: { f4: {} },
  f2: { cogsAtScale: 40, computedRevenue: 123 },
  f4: { techShiftRisk: risk, marginElasticity: { x: 1 }, note: "kept" },
};
const snapshot = JSON.parse(JSON.stringify(original));
const stripped = stripServerOwnedFields(original, { f4: { techShiftRisk: null } });
assert.deepEqual(original, snapshot, "original payload is not mutated");
assert.equal(stripped.cleaned.name, "Keep me");
assert.equal(stripped.cleaned.goNoGo, undefined);
assert.equal(stripped.cleaned.suggestions, undefined);
assert.equal(stripped.cleaned.f4.techShiftRisk, undefined);
assert.equal(stripped.cleaned.f4.marginElasticity, undefined);
assert.equal(stripped.cleaned.f4.note, "kept");
assert.equal(stripped.cleaned.f2.cogsAtScale, 40);
assert.equal(stripped.cleaned.f2.computedRevenue, undefined);
for (const p of ["goNoGo", "suggestions", "f4.techShiftRisk", "f4.marginElasticity", "f2.computedRevenue"]) {
  assert.ok(stripped.ignoredKeys.includes(p), `ignoredKeys includes ${p}`);
}
assert.ok(stripped.attemptedDiffs.some((d) => d.path === "f4.techShiftRisk"), "differing value is an attempted diff");

// Equal to stored → still ignored, but not an audit diff.
const same = stripServerOwnedFields({ f4: { techShiftRisk: risk } }, { f4: { techShiftRisk: risk } });
assert.deepEqual(same.ignoredKeys, ["f4.techShiftRisk"]);
assert.deepEqual(same.attemptedDiffs, []);

// Non-objects pass through safely.
assert.deepEqual(stripServerOwnedFields(null).ignoredKeys, []);

// --- firstForbiddenField ----------------------------------------------------
const owner = { id: "u1", email: "owner@cavinkare.com", role: "BM", team: "R&D" };
const other = { id: "u2", email: "other@cavinkare.com", role: "BM", team: "CC" };
const idea = { createdByUserId: "u1", createdByEmail: "owner@cavinkare.com", submitterDepartment: "R&D" };
assert.equal(canEditIdeaInputs(owner, idea), true);
const emptyIdea = { f2: {}, f4: {} };

assert.equal(
  await firstForbiddenField(owner, idea, emptyIdea, { f4: { techShiftRisk: risk }, goNoGo: { verdict: "GO" } }),
  null,
  "owner is not forbidden for server-owned keys"
);
assert.equal(
  await firstForbiddenField(other, idea, emptyIdea, { f4: { techShiftRisk: risk } }),
  null,
  "server-owned keys alone never produce a 403, even for a non-owner"
);
// Role / ownership forbidden stays.
assert.equal(
  await firstForbiddenField(other, idea, emptyIdea, { f2: { cogsAtScale: 99 } }),
  "cogsAtScale",
  "non-owner still forbidden for an input field"
);
assert.equal(
  await firstForbiddenField(owner, idea, emptyIdea, { f2: { cogsAtScale: 99 } }),
  null,
  "owner may edit inputs"
);

// --- draft POST end to end (file store, auth parked) -------------------------
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { fileListAudit } = await import("../lib/propositionRetention.js");
const { handlePropositionDraft } = await import("../lib/propositionsApi.js");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
const redactSecrets = (s) => String(s || "");

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, {
  name: "P140",
  submitterName: "Tester",
  submitterDepartment: "R&D",
  ideaDescription: "A described idea for Part 140.",
  f2: { cogsAtScale: 40, netMarginAtScale: 20 },
});

const res = { statusCode: 0, body: null, end() {} };
await handlePropositionDraft(
  {
    method: "POST",
    user: { department: "R&D", role: "ADMIN" },
    body: {
      proposition: {
        name: "P140",
        goNoGo: { verdict: "GO" },
        f2: { cogsAtScale: 41, netMarginAtScale: 20 },
        f4: { techShiftRisk: risk },
      },
    },
  },
  res,
  created.id,
  { sendJson, redactSecrets }
);
assert.equal(res.statusCode, 200, `draft with server-owned keys: ${res.body?.error || ""}`);
assert.ok(res.body.ignoredKeys.includes("f4.techShiftRisk"), `ignoredKeys: ${res.body.ignoredKeys}`);
assert.ok(res.body.ignoredKeys.includes("goNoGo"));
assert.equal(Number(res.body.proposition.f2.cogsAtScale), 41, "the rest of the payload is saved");

const stored = await getPropositionById(created.id);
assert.notDeepEqual(stored.f4?.techShiftRisk, risk, "client techShiftRisk was not persisted");
assert.notEqual(stored.goNoGo?.verdict, "GO");

const audit = (await fileListAudit()).filter((row) => row.action === "server-owned-write-ignored");
assert.ok(audit.length >= 1, "server-owned write attempt audited");
// File audit keeps ids only (no values); Postgres audit also stores the ignored paths.
assert.match(JSON.stringify(audit[audit.length - 1]), new RegExp(created.id));

console.log("PASS testPart140ServerOwnedIgnore");
process.exit(0);
