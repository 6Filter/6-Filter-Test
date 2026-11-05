/**
 * Part 136 — owner test (do not edit). Real Postgres.
 * Evaluated returns sealed output only; incomplete/legacy show no cards; manager review refused.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const SKIP = "POSTGRES SUITE SKIPPED — TEST_DATABASE_URL is not set.";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.error(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { openSuiteDatabase } = await import("../pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-eval-${process.pid}`);

const { initDb, createProposition, updateProposition, getPropositionById } = await import("../../lib/db.js");
const { buildPropositionReadResponse, annotateEvaluationOnListRow } = await import(
  "../../lib/evaluationResponse.js"
);
const { propositionEvaluationState } = await import("../../lib/evaluationStatus.js");
const { canSealOutput, sealGoNoGoOutput, buildSealedOutput } = await import("../../lib/sealOutput.js");
const { assertEvaluatedForWrite } = await import("../../lib/evaluationResponse.js");

await initDb();

let checks = 0;
function check(name, fn) {
  const out = fn();
  if (out && typeof out.then === "function") {
    throw new Error(`use checkAsync for ${name}`);
  }
  checks += 1;
}
async function checkAsync(name, fn) {
  await fn();
  checks += 1;
}

const filledF4 = {
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: { risk: "Low", reason: "ok" },
      consumptionContextStability: { risk: "Low", reason: "ok" },
      manufacturingDisruptionRisk: { risk: "Low", reason: "ok" },
      userHabitShiftPotential: { risk: "Low", reason: "ok" },
      adjacentSubstitutionThreat: { risk: "Low", reason: "ok" },
      regulatoryOrStandardsShift: { risk: "Low", reason: "ok" },
      channelOrFormatDisplacement: { risk: "Low", reason: "ok" },
    },
    overallRisk: "Low",
  },
};

await checkAsync("not-evaluated idea has no goNoGo on read", async () => {
  const p = await createProposition({ submitterDepartment: "R&D", name: "E1" });
  const read = buildPropositionReadResponse(p);
  assert.equal(read.evaluationState, "not-evaluated");
  assert.equal(read.goNoGo, null);
  assert.equal(read.output, null);
  assert.equal(read.advisoryChecks, undefined);
});

await checkAsync("incomplete shows missing plain labels, no cards", async () => {
  let p = await createProposition({ submitterDepartment: "R&D", name: "E2" });
  p = await updateProposition(
    p.id,
    {
      f1: { benchmark: "Dove", declaredGap: 3, pureCommodity: false },
      f2: { cogsAtScale: 40, gstRatePct: 18 },
      researchFindings: { evidenceRead: { status: "none" } },
    },
    { handler: "seed", writer: "server" }
  );
  // Add evidence so evidence is done while benchmark missing → incomplete
  p = await updateProposition(
    p.id,
    {
      f1: { ...p.f1, evidenceSourceFile: { fileId: "f1" } },
      researchFindings: { evidenceRead: { status: "read", facts: [] } },
    },
    { handler: "seed", writer: "server" }
  );
  const read = buildPropositionReadResponse(p);
  assert.ok(["incomplete", "not-evaluated"].includes(read.evaluationState));
  assert.equal(read.output, null);
  assert.ok(Array.isArray(read.evaluationMissing));
  assert.ok(read.evaluationMissing.every((m) => m.label && !/^[A-Z0-9_]+$/.test(m.label)));
  assert.equal(read.advisoryChecks, undefined);
});

await checkAsync("legacy keeps stored verdict, no output, legacy:true", async () => {
  let p = await createProposition({ submitterDepartment: "R&D", name: "E3" });
  p = await updateProposition(
    p.id,
    {
      goNoGo: {
        classification: "WATCH",
        score: { pct: 40, done: 6, total: 15 },
        rationale: "legacy screen",
        at: "2024-01-01T00:00:00.000Z",
        rulesetVersion: "v4.4",
      },
    },
    { handler: "seed", writer: "server" }
  );
  const read = buildPropositionReadResponse(p);
  assert.equal(read.evaluationState, "legacy");
  assert.equal(read.legacy, true);
  assert.equal(read.output, null);
  assert.equal(read.goNoGo.classification, "WATCH");
  assert.equal(Number(read.goNoGo.score.pct), 40);
});

await checkAsync("evaluated returns exactly sealed output", async () => {
  let p = await createProposition({ submitterDepartment: "R&D", name: "E4" });
  const advisoryChecks = {
    f1: { checkLabel: "Cleared", items: [{ status: "done", text: "Gap clears floor", slot: "gap", credit: 1 }] },
    f2: { checkLabel: "Cleared", items: [{ status: "done", text: "Margin ok", slot: "margin", credit: 1 }] },
    f3: { checkLabel: "Cleared", items: [{ status: "done", text: "No cliff", slot: "resilience", credit: 1 }] },
    f4: { checkLabel: "Cleared", items: [{ status: "done", text: "Low risk", slot: "x", credit: 1 }] },
  };
  const go = sealGoNoGoOutput(
    {
      classification: "GO",
      score: { pct: 80, done: 12, total: 15 },
      rationale: "sealed",
      scoreInputKey: "abc",
    },
    {
      advisoryChecks,
      doc: {
        f1: { pureCommodity: true },
        f2: { cogsAtScale: 10, gstRatePct: 18 },
        f4: filledF4,
      },
    }
  );
  p = await updateProposition(
    p.id,
    {
      f1: { pureCommodity: true },
      f2: { cogsAtScale: 10, gstRatePct: 18 },
      f4: filledF4,
      goNoGo: go,
    },
    { handler: "seed", writer: "server" }
  );
  assert.equal(propositionEvaluationState(p), "evaluated");
  const read = buildPropositionReadResponse(p);
  assert.equal(read.evaluationState, "evaluated");
  assert.ok(read.output?.sealedAt);
  assert.equal(read.output.classification, "GO");
  assert.equal(read.output.filters.f1.label, "Cleared");
  assert.equal(read.advisoryChecks, undefined);
  assert.ok(read.sealedChecks?.f1);
});

await checkAsync("opening never changes sealed output", async () => {
  const raw = await getPropositionById(
    (
      await createProposition({ submitterDepartment: "R&D", name: "E5" })
    ).id
  );
  const sealedAt = "2026-01-02T00:00:00.000Z";
  const output = buildSealedOutput({
    advisoryChecks: {
      f1: { checkLabel: "Cleared", items: [] },
      f2: { checkLabel: "Cleared", items: [] },
      f3: { checkLabel: "Cleared", items: [] },
      f4: { checkLabel: "Cleared", items: [] },
    },
    goNoGo: { classification: "WATCH", score: { pct: 55, done: 8, total: 15 } },
    sealedAt,
  });
  let p = await updateProposition(
    raw.id,
    {
      f1: { pureCommodity: true },
      f2: { cogsAtScale: 10, gstRatePct: 18 },
      f4: filledF4,
      goNoGo: {
        classification: "WATCH",
        score: { pct: 55, done: 8, total: 15 },
        output,
      },
    },
    { handler: "seed", writer: "server" }
  );
  const a = buildPropositionReadResponse(p);
  const b = buildPropositionReadResponse(await getPropositionById(p.id));
  assert.equal(a.output.sealedAt, sealedAt);
  assert.equal(b.output.sealedAt, sealedAt);
  assert.deepEqual(a.output.score, b.output.score);
});

check("list row incomplete strips score", () => {
  const row = annotateEvaluationOnListRow({
    id: "x",
    name: "n",
    goNoGo: { classification: "GO", score: { pct: 90, done: 15, total: 15 } },
    // no output → legacy actually
  });
  assert.equal(row.evaluationState, "legacy");
  assert.equal(row.legacy, true);
  const incomplete = annotateEvaluationOnListRow({ id: "y", name: "n2", goNoGo: null });
  assert.ok(["not-evaluated", "incomplete"].includes(incomplete.evaluationState));
  assert.equal(incomplete.goNoGo, null);
});

check("manager review refused when not evaluated", () => {
  assert.throws(
    () => assertEvaluatedForWrite({ f1: {}, goNoGo: null }),
    (e) => e.status === 409 && /Evaluate this idea first/i.test(e.message)
  );
});

check("manager review allowed when evaluated", () => {
  assert.doesNotThrow(() =>
    assertEvaluatedForWrite({
      goNoGo: {
        classification: "WATCH",
        score: { pct: 40, done: 6, total: 15 },
        output: { sealedAt: "2026-01-01T00:00:00.000Z" },
      },
    })
  );
});

check("canSealOutput true only when steps complete", () => {
  assert.equal(canSealOutput({}), false);
  assert.equal(
    canSealOutput({
      f1: { pureCommodity: true },
      f2: { cogsAtScale: 10, gstRatePct: 18 },
      f4: filledF4,
    }),
    true
  );
});

check("sealed output has filters f1-f4", () => {
  const out = buildSealedOutput({
    advisoryChecks: {
      f1: { checkLabel: "Marked down", items: [{ status: "pending", text: "fix", credit: 0 }] },
      f2: { checkLabel: "Cleared", items: [] },
      f3: { checkLabel: "Cleared", items: [] },
      f4: { checkLabel: "Cleared", items: [] },
    },
    goNoGo: { classification: "WATCH", score: { pct: 50, done: 10, total: 15 } },
  });
  assert.ok(out.filters.f1.narrative);
  assert.equal(out.filters.f1.label, "Marked down");
  assert.ok(out.rulesetVersion);
});

await checkAsync("legacy score unchanged after annotate", async () => {
  let p = await createProposition({ submitterDepartment: "R&D", name: "E6" });
  p = await updateProposition(
    p.id,
    { goNoGo: { classification: "NO-GO", score: { pct: 12, done: 2, total: 15 }, rulesetVersion: "v5.0" } },
    { handler: "seed", writer: "server" }
  );
  const read = buildPropositionReadResponse(p);
  assert.equal(Number(read.goNoGo.score.pct), 12);
  assert.equal(read.evaluationState, "legacy");
});

await checkAsync("evaluationMissing lists failed with reason", async () => {
  const { evaluationMissingForApi } = await import("../../lib/evaluationStatus.js");
  const missing = evaluationMissingForApi({
    f1: { benchmark: "Dove", declaredGap: 3 },
    f2: { cogsAtScale: 1, gstRatePct: 18 },
    researchFindings: { f1: { benchmarkCheck: { researchFailed: true, error: "down" } } },
  });
  const b = missing.find((m) => m.step === "benchmark");
  assert.ok(b?.failed);
  assert.match(String(b.reason || ""), /down/);
});

await checkAsync("read response never carries advisoryChecks key with live data", async () => {
  const p = await createProposition({ submitterDepartment: "R&D", name: "E7" });
  const read = buildPropositionReadResponse(p);
  assert.ok(!("advisoryChecks" in read) || read.advisoryChecks == null);
});

await checkAsync("output survives round-trip through parseGoNogo", async () => {
  let p = await createProposition({ submitterDepartment: "R&D", name: "E8" });
  const go = sealGoNoGoOutput(
    { classification: "GO", score: { pct: 88, done: 13, total: 15 }, rationale: "rt" },
    {
      advisoryChecks: {
        f1: { checkLabel: "Cleared", items: [] },
        f2: { checkLabel: "Cleared", items: [] },
        f3: { checkLabel: "Cleared", items: [] },
        f4: { checkLabel: "Cleared", items: [] },
      },
      doc: { f1: { pureCommodity: true }, f2: { cogsAtScale: 10, gstRatePct: 18 }, f4: filledF4 },
      sealedAt: "2026-03-01T00:00:00.000Z",
    }
  );
  p = await updateProposition(
    p.id,
    {
      f1: { pureCommodity: true },
      f2: { cogsAtScale: 10, gstRatePct: 18 },
      f4: filledF4,
      goNoGo: go,
    },
    { handler: "seed", writer: "server" }
  );
  const again = await getPropositionById(p.id);
  assert.equal(again.goNoGo?.output?.sealedAt, "2026-03-01T00:00:00.000Z");
  assert.equal(propositionEvaluationState(again), "evaluated");
});

check("list evaluated row keeps score", () => {
  const row = annotateEvaluationOnListRow({
    id: "z",
    evaluationState: "evaluated",
    goNoGo: {
      classification: "GO",
      score: { pct: 80, done: 12, total: 15 },
      output: { sealedAt: "2026-01-01T00:00:00.000Z", score: { pct: 80 } },
    },
  });
  assert.equal(row.evaluationState, "evaluated");
  assert.ok(row.output?.sealedAt);
});

console.log(`PASS owner testOutputOnlyWhenEvaluated (${checks} checks)`);
await suite.close?.();
process.exit(0);
