import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planResearch, refuseModelCall, submitWithRunners } from "../lib/researchProgress.js";
import { backupDir, formatPlan, loadRestoredRows, readCallLedger } from "./planResubmit.mjs";

const rootEarly = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function hasBackupExport() {
  const dir = path.join(rootEarly, "data", "backups");
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((name) => /^\d{8}T\d{6}Z$/.test(name));
  } catch {
    return false;
  }
}

await assert.rejects(refuseModelCall(), /does not call the model/);

const incomplete = {
  id: "fixture-incomplete",
  researchRunAt: "2026-10-04T02:53:14.075Z",
  f1: { declaredAttribute: "a", benchmark: "b", declaredGap: 3, growthRoute: "penetration", growthArgument: "c" },
  f2: { cogsAtScale: 40, netMarginAtScale: 20, grammage: "100g" },
  f3: {},
  f4: {},
  f5: {
    householdsReachedY3Mn: 1,
    trialRatePct: 1,
    repeatConversionPct: 1,
    purchaseFrequencyYr: 1,
    avgPackValueInr: 1,
  },
  researchFindings: { f3: { researchFailed: false }, f4: { researchFailed: false } },
};
const plan = planResearch(incomplete);
assert.equal(plan.researchState, "incomplete");
assert.deepEqual(plan.steps, ["F1", "F3", "F4"], "typed F1 fields still need web verify");

const calls = { F3: 0, F4: 0, F1: 0, F2: 0 };
const declined = await submitWithRunners(incomplete, {
  F3: async () => { throw new Error("declined must not call"); },
}, { confirm: async () => false });
assert.equal(declined.declined, true);
assert.deepEqual(declined.calls, []);
assert.equal(declined.doc.researchFindings, incomplete.researchFindings);

const first = await submitWithRunners(incomplete, {
  F3: async () => { calls.F3 += 1; },
  F4: async () => { calls.F4 += 1; },
  F1: async () => { calls.F1 += 1; },
  F2: async () => { calls.F2 += 1; },
});
assert.deepEqual(first.calls, ["F1", "F3", "F4"]);
assert.equal(planResearch(first.doc).researchState, "complete");
const second = await submitWithRunners(first.doc, {
  F3: async () => { calls.F3 += 1; },
  F4: async () => { calls.F4 += 1; },
  F1: async () => { calls.F1 += 1; },
});
assert.deepEqual(second.calls, []);
assert.equal(calls.F1, 1);
assert.equal(calls.F2, 0);
assert.equal(calls.F3, 1);
assert.equal(calls.F4, 1);

assert.equal(planResearch({ researchRunAt: null, f1: {}, f2: {}, f3: {}, f4: {} }).researchState, "draft");
assert.equal(
  planResearch({
    researchRunAt: "2026-10-01T00:00:00.000Z",
    f1: { declaredAttribute: "a" },
    f2: { cogsAtScale: 1 },
    f3: {},
    f4: { techShiftRisk: { dimensions: { pack: { rating: "low" } } } },
    researchFindings: { f3: { researchFailed: true } },
  }).researchState,
  "failed"
);

if (!hasBackupExport()) {
  console.log("SKIP Part 105 backup-backed checks — data/backups is not present");
  console.log("PASS research progress planner (unit only)");
  process.exit(0);
}

const file = path.join(backupDir(), "propositions.jsonl");
const hash = () => createHash("sha256").update(readFileSync(file)).digest("hex");
const before = hash();
const { rows } = await loadRestoredRows();
const text = formatPlan(rows, readCallLedger());
assert.match(text, /planned 870271a6-d242-4f20-8b20-47302da8cf5f steps=\S*F3,F4\S* state=incomplete/);
assert.equal(hash(), before);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!String(process.env.TEST_DATABASE_URL || "").trim()) {
  console.log("SKIP Part 105 planResubmit spawn — TEST_DATABASE_URL is not set");
  console.log("PASS research progress planner");
  process.exit(0);
}
const run = () => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(root, "scripts", "planResubmit.mjs")], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "", POSTGRES_URL: "" },
  });
  let out = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.on("exit", (code) => resolve({ code, out }));
});
const a = await run();
const b = await run();
assert.equal(a.code, 0);
assert.equal(a.out, b.out);
assert.equal(hash(), before);
assert.match(a.out, /cost source: (measured-fresh-idea|per-label ledger)/);

console.log("PASS research progress planner");
