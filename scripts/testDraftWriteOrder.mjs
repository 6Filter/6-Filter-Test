/**
 * A slower older autosave must not wipe a newer draft.
 * The same inputs scored twice must be the same percent.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-draft-order-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { scoreAdvisoryChecks } = await import("../lib/goNoGo.js");

const created = await createProposition({ submitterDepartment: "R&D" });
const newer = await updateProposition(
  created.id,
  {
    name: "Newer oil",
    category: "Hair oils",
    ideaDescription: "Cooling hair oil kept by the newer write.",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    clientWriteAt: 200,
    f2: { cogsAtScale: "40", netMarginAtScale: "30", gstRatePct: "18", grammage: "100 ml" },
  },
  { bumpVersion: false, handler: "autosave" }
);
assert.equal(newer.name, "Newer oil");
assert.equal(newer.f2.mrpInr, 67.43);

const older = await updateProposition(
  created.id,
  {
    name: "Older oil",
    category: "",
    ideaDescription: "",
    submitterName: "",
    submitterDepartment: "",
    clientWriteAt: 100,
    f2: { cogsAtScale: "", netMarginAtScale: "", gstRatePct: "", grammage: "" },
  },
  { bumpVersion: false, handler: "autosave" }
);
assert.equal(older.staleWrite, true, "older autosave is refused");

const stored = await getPropositionById(created.id);
assert.equal(stored.name, "Newer oil");
assert.equal(stored.ideaDescription, "Cooling hair oil kept by the newer write.");
assert.equal(stored.submitterName, "Live Tester");
assert.equal(stored.submitterDepartment, "R&D");
assert.equal(String(stored.f2.cogsAtScale), "40");
assert.equal(stored.f2.mrpInr, 67.43);
assert.equal(stored.clientWriteAt, 200);

const scored = {
  ...stored,
  division: "Personal Care",
  f1: {
    declaredAttribute: "cooling feel",
    benchmark: "Parachute Advansed",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "More summer occasions in humid states.",
  },
};
const first = scoreAdvisoryChecks(await computeAllAdvisoryChecks(scored));
const second = scoreAdvisoryChecks(await computeAllAdvisoryChecks(scored));
assert.deepEqual(second, first, "the same values must score the same percent twice");

console.log(`PASS draft write order — newer idea kept, score ${first.pct} stable`);
