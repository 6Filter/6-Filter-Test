/**
 * A concept card keeps its file name when extraction cannot run.
 * Typed idea fields on the row stay put.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-concept-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const user = { department: "NPD", role: "ADMIN" };
const csv = "category,idea\nHair oils,herbal cooling hair oil\n";
const attachment = {
  name: "qa-concept-card.csv",
  mediaType: "text/csv",
  data: `data:text/csv;base64,${Buffer.from(csv).toString("base64")}`,
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "NPD",
    f1: { declaredAttribute: "cooling feel" },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: "105.90", grammage: "10g" },
  },
  { writer: "server" }
);

const res = { statusCode: 0, body: null, end() {} };
await handlePropositionConceptCard(
  { method: "POST", user },
  res,
  created.id,
  {
    readBody: async () => ({ attachment, provider: "claude" }),
    sendJson,
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 200);
assert.equal(res.body.conceptCardName, "qa-concept-card.csv");
assert.match(res.body.extractError, /API key/i);
assert.equal(res.body.proposition.name, "Live Check herbal cooling hair oil");
assert.equal(res.body.proposition.f1.declaredAttribute, "cooling feel");
assert.equal(res.body.proposition.f2.mrpInr, "105.90");

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "A herbal cooling hair oil for summer scalp comfort.");
assert.equal(stored.f1.declaredAttribute, "cooling feel");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.grammage, "10g");

console.log("PASS concept card keeps qa-concept-card.csv when extraction has no key");
