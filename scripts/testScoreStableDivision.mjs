/**
 * The same hair-oil numbers score once, whether division is still blank
 * or already stored as the keyword match Submit uses.
 * A go-nogo read must not write that division.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-div-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { previewAdvisoryChecks, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { scoreInputKey } = await import("../lib/analysisStability.js");
const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");

const idea = {
  name: "Score stable herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for daily use.",
  division: "",
  f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, grammage: "10g" },
};

const blankChecks = await computeAllAdvisoryChecks(idea);
const namedChecks = await computeAllAdvisoryChecks({ ...idea, division: "Personal Care" });
assert.equal(blankChecks.f2.checkLabel, namedChecks.f2.checkLabel);
assert.equal(blankChecks.f2.checkLabel, "Marked down");
assert.equal(scoreAdvisoryChecks(blankChecks).pct, scoreAdvisoryChecks(namedChecks).pct);
assert.equal(previewAdvisoryChecks(idea).f2.checkLabel, blankChecks.f2.checkLabel);
assert.equal(scoreInputKey(idea), scoreInputKey({ ...idea, division: "Personal Care" }));

const explicitCold = await computeAllAdvisoryChecks({ ...idea, division: "Cold Chain Business" });
assert.equal(explicitCold.f2.checkLabel, "Cleared");
assert.notEqual(scoreInputKey(idea), scoreInputKey({ ...idea, division: "Cold Chain Business" }));

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(created.id, idea, { writer: "server" });
const before = await getPropositionById(created.id);
assert.equal(String(before.division || ""), "");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
const res = { statusCode: 0, body: null };
await handlePropositionGoNogo(
  { method: "POST", user: { department: "R&D" }, body: { proposition: { ...idea, division: "" } } },
  res,
  created.id,
  { readBody: async (req) => req.body, sendJson, redactSecrets: (m) => m }
);
const after = await getPropositionById(created.id);
assert.equal(String(after.division || ""), "", "a go-nogo read must not write the division");
assert.equal(after.name, idea.name);
assert.equal(after.f2.cogsAtScale, 70);
assert.equal(after.f2.netMarginAtScale, 22);

console.log("PASS score stays stable when division is blank or Personal Care");
