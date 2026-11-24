/**
 * Part 140 B (D64) draft-save behaviour + Part 140 C (D63) Filter 4 userInputs.
 * Covers what can be proved without the owner's attached file: pure helpers, the draft API,
 * and source-level wiring of the banner, the "Why can't I submit?" panel and the two F4 blocks.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-p140bc-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

// The LLM stub must be registered before any lib module that imports callLlm is loaded.
const { setCallLlmStub } = await import("./installCallLlmStub.mjs");

const { omitServerOwnedForSave, plainDraftSaveError, SERVER_OWNED_SAVE_KEYS } = await import(
  "../lib/clientSavePayload.js"
);
const { SERVER_OWNED_KEYS } = await import("../lib/fieldOwnership.js");
const {
  TECH_SHIFT_DIMENSIONS,
  normalizeF4UserInputs,
  patchF4UserInput,
  userInputFor,
} = await import("../lib/techShiftRisk.js");
const { f4WebCheckRelation, buildF4Assessment, failedF4Assessment } = await import("../lib/f4Assessment.js");
const { emptyFilterState, mergeProposition, SIX_FILTERS_FORM } = await import("../lib/propositionFields.js");
const { assertEveryFormFieldHasRole } = await import("../lib/fieldRoles.js");

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

const [DIM_A, DIM_B] = TECH_SHIFT_DIMENSIONS;
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ============================================================ B — omitServerOwnedForSave
await check("save payload keys match the server-owned set", () => {
  assert.deepEqual([...SERVER_OWNED_SAVE_KEYS].sort(), [...SERVER_OWNED_KEYS].sort());
});

await check("omitServerOwnedForSave strips every server-owned key from the top and from f1–f6", () => {
  const doc = { name: "Keep", id: "x", baseVersion: 3 };
  for (const k of SERVER_OWNED_SAVE_KEYS) doc[k] = { forged: true };
  for (const f of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
    doc[f] = { note: `${f}-kept` };
    for (const k of SERVER_OWNED_SAVE_KEYS) doc[f][k] = { forged: true };
  }
  const snapshot = JSON.parse(JSON.stringify(doc));
  const out = omitServerOwnedForSave(doc);
  assert.deepEqual(doc, snapshot, "input is not mutated");
  assert.notEqual(out, doc, "a clone is returned");
  for (const k of SERVER_OWNED_SAVE_KEYS) {
    assert.equal(k in out, false, `top ${k}`);
    for (const f of ["f1", "f2", "f3", "f4", "f5", "f6"]) assert.equal(k in out[f], false, `${f}.${k}`);
  }
  assert.equal(out.name, "Keep");
  assert.equal(out.baseVersion, 3);
  for (const f of ["f1", "f2", "f3", "f4", "f5", "f6"]) assert.equal(out[f].note, `${f}-kept`);
  const named = ["marginElasticity", "techShiftRisk", "computedRevenue", "researchFindings", "advisoryChecks", "suggestions", "goNoGo"];
  for (const k of named) assert.ok(SERVER_OWNED_SAVE_KEYS.includes(k), k);
});

await check("omitServerOwnedForSave keeps person-owned f4 keys, including userInputs", () => {
  const out = omitServerOwnedForSave({
    f4: {
      techShiftRisk: { dimensions: {} },
      f4MitigationResponses: { [DIM_A]: "signed contract 2026" },
      userInputs: { [DIM_A]: { rating: "High", pov: "mine", at: "2026-11-13T00:00:00.000Z" } },
    },
  });
  assert.equal(out.f4.techShiftRisk, undefined);
  assert.equal(out.f4.userInputs[DIM_A].rating, "High");
  assert.equal(out.f4.f4MitigationResponses[DIM_A], "signed contract 2026");
});

await check("omitServerOwnedForSave is safe on null / non-objects / missing filters", () => {
  assert.equal(omitServerOwnedForSave(null), null);
  assert.equal(omitServerOwnedForSave(undefined), undefined);
  assert.deepEqual(omitServerOwnedForSave({ name: "x" }), { name: "x" });
  assert.deepEqual(omitServerOwnedForSave({ f4: null, f2: "oops" }), { f4: null, f2: "oops" });
});

await check("plainDraftSaveError speaks plain words", () => {
  assert.match(plainDraftSaveError(new TypeError("Failed to fetch")), /could not reach the server/);
  assert.equal(plainDraftSaveError(new Error("Could not save draft.")), "Could not save draft");
  assert.match(plainDraftSaveError(null), /could not reach the server/);
});

// ============================================================ C — userInputs shape
await check("userInputs round-trip shape: { rating, pov, at } per dimension, nothing else", () => {
  const at = "2026-11-13T04:00:00.000Z";
  const set = patchF4UserInput({}, DIM_A, { rating: "high", pov: "Pouch format is fading" }, at);
  assert.deepEqual(set, { [DIM_A]: { rating: "High", pov: "Pouch format is fading", at } });
  assert.deepEqual(Object.keys(set[DIM_A]).sort(), ["at", "pov", "rating"]);
  const both = patchF4UserInput(set, DIM_B, { pov: "just a view" }, at);
  assert.deepEqual(userInputFor(both, DIM_B), { rating: "", pov: "just a view", at });
  assert.equal(userInputFor(both, DIM_A).rating, "High", "other dimension untouched");
  // JSON round trip (what the draft API stores) keeps the shape.
  assert.deepEqual(normalizeF4UserInputs(JSON.parse(JSON.stringify(both))), both);
  // Emptying a dimension removes it; unknown keys are dropped.
  assert.deepEqual(patchF4UserInput(set, DIM_A, { rating: "", pov: "  " }, at), {});
  assert.deepEqual(normalizeF4UserInputs({ notADimension: { rating: "Low", pov: "x" } }), {});
  assert.deepEqual(normalizeF4UserInputs(null), {});
  assert.deepEqual(normalizeF4UserInputs([]), {});
});

await check("userInputs sit beside techShiftRisk — editing them never touches techShiftRisk", () => {
  const f4 = {
    techShiftRisk: { dimensions: { [DIM_A]: { risk: "Low", reason: "research says stable" } } },
    userInputs: {},
  };
  const before = JSON.stringify(f4.techShiftRisk);
  const nextInputs = patchF4UserInput(f4.userInputs, DIM_A, { rating: "High", pov: "I disagree" });
  const next = { ...f4, userInputs: nextInputs };
  assert.equal(JSON.stringify(next.techShiftRisk), before);
  assert.equal(next.techShiftRisk.dimensions[DIM_A].risk, "Low");
  assert.equal(next.userInputs[DIM_A].rating, "High");
  assert.equal("userInputs" in next.techShiftRisk, false);
  assert.equal("rating" in next.techShiftRisk.dimensions[DIM_A], false);
});

await check("mergeProposition / emptyFilterState preserve f4.userInputs", () => {
  const f4Spec = SIX_FILTERS_FORM.find((s) => s.key === "f4");
  const fresh = emptyFilterState(f4Spec);
  assert.ok(!("userInputs" in fresh) || Object.keys(fresh.userInputs).length === 0);
  const raw = {
    id: "p1",
    f4: { userInputs: { [DIM_A]: { rating: "Medium", pov: "watch it", at: "2026-11-13T00:00:00.000Z" } } },
  };
  const merged = mergeProposition(raw);
  assert.deepEqual(merged.f4.userInputs[DIM_A], { rating: "Medium", pov: "watch it", at: "2026-11-13T00:00:00.000Z" });
  assert.equal(merged.f4.techShiftRisk, null, "a person's view is not turned into a techShiftRisk");
  // Merge twice (form re-open after Submit) — still there.
  assert.deepEqual(mergeProposition(merged).f4.userInputs, merged.f4.userInputs);
  // No userInputs → nothing invented.
  assert.equal("userInputs" in mergeProposition({ id: "p2" }).f4, false);
});

await check("fieldRoles still covers every form box (userInputs is not a form field key)", () => {
  assert.ok(assertEveryFormFieldHasRole() > 0);
  const f4Spec = SIX_FILTERS_FORM.find((s) => s.key === "f4");
  assert.equal(f4Spec.fields.some((f) => f.key === "userInputs"), false);
});

// ============================================================ C — web check vs your rating
const SRC = "https://part140.example/f4";
await check("web check reads 'supports' / 'contradicts' against the person's own rating", () => {
  const ok = (rating, supported) =>
    buildF4Assessment({ rating, supported, source_url: SRC, quote: "q", returnedSources: [SRC], webSearchEnabled: true });
  assert.equal(f4WebCheckRelation("High", ok("High", true)), "supports");
  assert.equal(f4WebCheckRelation("High", ok("High", false)), "contradicts");
  assert.equal(f4WebCheckRelation("Low", ok("High", true)), "contradicts", "web backs a different rating");
  assert.equal(f4WebCheckRelation("Low", ok("High", false)), "", "stale check says nothing");
  assert.equal(f4WebCheckRelation("", ok("High", true)), "", "no rating from the person");
  assert.equal(f4WebCheckRelation("High", null), "");
  assert.equal(f4WebCheckRelation("High", failedF4Assessment("down", { webSearchEnabled: true })), "");
  const noSearch = { ...ok("High", true), searchUsed: false };
  assert.equal(f4WebCheckRelation("High", noSearch), "");
});

// ============================================================ draft API (file store)
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionDraft } = await import("../lib/propositionsApi.js");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
const redactSecrets = (s) => String(s || "");
const user = { department: "R&D", role: "ADMIN" };

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, {
  name: "P140 BC",
  submitterName: "Tester",
  submitterDepartment: "R&D",
  ideaDescription: "A described idea for Part 140 B and C.",
  f2: { cogsAtScale: 40, netMarginAtScale: 20 },
});

await check("draft POST with techShiftRisk in the body → 200 (server-owned key ignored, never a failure)", async () => {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionDraft(
    {
      method: "POST",
      user,
      body: {
        proposition: {
          name: "P140 BC",
          f2: { cogsAtScale: 41, netMarginAtScale: 20 },
          f4: {
            techShiftRisk: { dimensions: { [DIM_A]: { risk: "High", reason: "stale client copy" } } },
          },
        },
      },
    },
    res,
    created.id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body?.error || "");
  assert.ok(res.body.ignoredKeys.includes("f4.techShiftRisk"));
});

await check("draft POST of the clean client payload stores f4.userInputs and ignores no server-owned key", async () => {
  const at = "2026-11-13T05:00:00.000Z";
  const clientDoc = omitServerOwnedForSave({
    ...mergeProposition({ id: created.id, name: "P140 BC" }),
    f4: {
      techShiftRisk: { dimensions: { [DIM_A]: { risk: "Low", reason: "AI draft" } } },
      userInputs: { [DIM_A]: { rating: "High", pov: "My own view", at } },
    },
  });
  assert.equal(clientDoc.f4.techShiftRisk, undefined);
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionDraft({ method: "POST", user, body: { proposition: clientDoc } }, res, created.id, {
    sendJson,
    redactSecrets,
  });
  assert.equal(res.statusCode, 200, res.body?.error || "");
  assert.ok(
    !res.body.ignoredKeys.some((k) => k.startsWith("f4.") || SERVER_OWNED_KEYS.has(k)),
    `a clean payload has no server-owned key to ignore: ${res.body.ignoredKeys}`
  );
  const stored = await getPropositionById(created.id);
  assert.deepEqual(stored.f4.userInputs[DIM_A], { rating: "High", pov: "My own view", at });
  assert.notEqual(stored.f4.techShiftRisk?.dimensions?.[DIM_A]?.risk, "High", "client rating never became research output");
  // Re-open (what reload does): both blocks have their data.
  const reopened = mergeProposition(stored);
  assert.equal(reopened.f4.userInputs[DIM_A].pov, "My own view");
});

// ============================================================ verify-f4 / reassess keep userInputs
const { handlePropositionVerifyF4, reassessF4WithResponses } = await import("../lib/filters/reassessTechShift.js");
await check("verify-f4 checks the person's rating, sends their view as context, writes assessments only", async () => {
  const at = "2026-11-13T06:00:00.000Z";
  const idea = await createProposition({ submitterDepartment: "R&D" });
  await updateProposition(
    idea.id,
    {
      name: "P140 verify",
      submitterName: "Tester",
      submitterDepartment: "R&D",
      category: "Buttermilk",
      ideaDescription: "A probiotic buttermilk pouch.",
      f4: { techShiftRisk: { dimensions: { [DIM_A]: { risk: "Low", reason: "AI says stable" } }, aiSourced: true } },
    },
    { writer: "server" }
  );
  const before = await getPropositionById(idea.id);
  let prompt = "";
  setCallLlmStub(async (opts) => {
    prompt = String(opts.userText || "");
    return { text: JSON.stringify({ supported: true, source_url: SRC, quote: "pouch trend" }), sources: [SRC], webSearchRequests: 1 };
  });
  const res = { statusCode: 0, body: "", end(v) { this.body = v; } };
  await handlePropositionVerifyF4(
    {
      method: "POST",
      user,
      body: { dimensionKey: DIM_A, userInputs: { [DIM_A]: { rating: "High", pov: "Pouches are being replaced by sachets", at } } },
    },
    res,
    idea.id,
    { sendJson: (r, status, body) => { r.statusCode = status; r.end(JSON.stringify(body)); }, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body);
  assert.match(prompt, /RATING THE PERSON TYPED: High/);
  assert.match(prompt, /Pouches are being replaced by sachets/);
  const saved = await getPropositionById(idea.id);
  assert.equal(saved.researchFindings.f4.assessments[DIM_A].raw.rating, "High");
  assert.equal(
    saved.f4.techShiftRisk.dimensions[DIM_A].risk,
    before.f4.techShiftRisk.dimensions[DIM_A].risk,
    "techShiftRisk is not overwritten by the person's rating"
  );
  assert.equal(saved.f4.userInputs, undefined, "research does not write userInputs");
});

await check("reassess gives the judge the person's view and never returns or writes userInputs", async () => {
  const seen = [];
  const out = await reassessF4WithResponses({
    techShiftRisk: {
      dimensions: { [DIM_A]: { risk: "High", reason: "format declining", userResponse: "Signed supplier contract Q1 2026 covering the new pouch line." } },
    },
    userInputs: { [DIM_A]: { rating: "Low", pov: "I think the pouch is safe", at: "2026-11-13T00:00:00.000Z" } },
    callJudgment: async (prompt) => {
      seen.push(prompt);
      return JSON.stringify({ reassessedRisk: "Medium", reassessedReason: "contract helps", verified: true });
    },
  });
  assert.match(seen[0], /I think the pouch is safe/);
  assert.equal("userInputs" in out, false);
  assert.equal("rating" in out.dimensions[DIM_A], false);
});

// ============================================================ source wiring
const form = read("../src/PropositionForm.jsx");
const app = read("../src/App.jsx");

await check("App builds every save body without server-owned keys and returns { ok, error }", () => {
  assert.match(app, /import \{[^}]*omitServerOwnedForSave[^}]*\} from "\.\.\/lib\/clientSavePayload\.js"/);
  const uses = app.match(/omitServerOwnedForSave\(payload\)/g) || [];
  assert.ok(uses.length >= 2, "draft and submit bodies both use it");
  assert.match(app, /return \{ ok: true, proposition: saved \}/);
  assert.match(app, /return \{ ok: false, error: plainDraftSaveError\(e\) \}/);
  assert.match(app, /formUnsavedRef/);
  assert.match(app, /Your changes are NOT saved yet/);
});

await check("PropositionForm: NOT saved banner, Retry, Not saved + last good save", () => {
  assert.match(form, /Your changes are NOT saved: \{draftError\}/);
  assert.match(form, /data-testid="draft-save-banner"/);
  assert.match(form, /data-testid="draft-save-retry"/);
  assert.match(form, />\s*\{draftRetrying \? "Retrying…" : "Retry"\}/);
  assert.match(form, /data-testid="sidebar-not-saved"/);
  assert.match(form, /Last good save/);
  assert.doesNotMatch(form, /prop-sidebar/);
  assert.match(form, /setDraftSaveState\("Not saved"\)/);
  assert.doesNotMatch(form, /setDraftSaveState\("Draft not saved"\)/);
});

await check("PropositionForm: auto-retry 10 s × 3 and beforeunload wired to draftDirtyRef", () => {
  assert.match(form, /DRAFT_AUTO_RETRY_MS = 10000/);
  assert.match(form, /DRAFT_AUTO_RETRY_MAX = 3/);
  assert.match(form, /beforeunload/);
  assert.match(form, /draftDirtyRef\.current/);
  assert.match(form, /onUnsavedChange/);
});

await check("PropositionForm: Submit bar error, Why can't I submit?, button stays full colour", () => {
  assert.match(form, /data-testid="submit-bar-error"/);
  assert.match(form, /Why can't I submit\?/);
  assert.match(form, /data-testid="why-cant-submit"/);
  assert.match(form, /data-testid="why-blocked-panel"/);
  assert.match(form, /submit-blocked/);
  assert.match(form, /text: `Fill \$\{progress\.missingFieldLabels\.length === 1/);
  assert.match(form, /id: "save-failed"/);
  assert.match(form, /id: `invalid-\$\{f\.field\}`/);
});

await check("PropositionForm: one box per Filter 4 point, no web-check panel and no second response list", () => {
  assert.match(form, /Your rating and view/);
  assert.match(form, /data-f4-block="your-view"/);
  assert.doesNotMatch(form, /data-f4-block="web-check"/);
  assert.doesNotMatch(form, /Web check rating/);
  assert.doesNotMatch(form, /Respond on Medium/);
  assert.match(form, /onUserInputChange/);
  assert.match(form, /ideaDoc\?\.f4\?\.userInputs/);
  assert.match(form, /setFilter\("f4", "userInputs", nextInputs\)/);
  assert.match(form, /userInputs: normalizeF4UserInputs\(/);
  assert.doesNotMatch(form, /patchDimension\(key, \{ risk:/);
  assert.doesNotMatch(form, /patchDimension\(key, \{ reason:/);
  assert.match(form, /className="f4-dimension-editor"/);
  assert.match(form, /Select risk/);
  assert.match(form, /onMitigationChange\(key, patch\.pov\)/);
});

console.log(`PASS testPart140DraftSaveAndFilter4 (${checks} checks)`);
process.exit(0);
