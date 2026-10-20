/**
 * A concept card with no model key still stores the file name and leaves
 * the typed idea on the row. The error comes back as extractError.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const created = await createProposition({ submitterDepartment: "NPD" });
const evidence = Buffer.from("source,date\nnote,2026-10-20\n").toString("base64");
await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "NPD",
    f1: { evidenceSourceFile: { name: "qa-evidence.csv", mimeType: "text/csv", data: evidence } },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, grammage: "10g" },
  },
  { writer: "server" }
);

const csv = Buffer.from("field,value\ncategory,Hair oils\n").toString("base64");
const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
function sendJson(target, status, body) {
  target.statusCode = status;
  target.end(JSON.stringify(body));
}

await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "NPD" },
    body: {
      attachment: { name: "qa-concept-card.csv", mimeType: "text/csv", data: csv },
      provider: "claude",
    },
  },
  res,
  created.id,
  { sendJson, redactSecrets: (message) => String(message || "") }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.match(body.extractError, /API key/i);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.equal(body.proposition.name, "Live Check herbal cooling hair oil");
assert.equal(body.proposition.ideaDescription, "A herbal cooling hair oil for daily scalp comfort.");
assert.equal(body.proposition.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(body.proposition.f1.evidenceSourceFile.data, evidence);

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f1.evidenceSourceFile.data, evidence);

console.log("PASS concept card keeps the file name when extraction has no model key");
