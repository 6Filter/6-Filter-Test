/**
 * A concept-card upload keeps its file name when extraction has no API key.
 * Typed fields and an evidence file already on the row stay put.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-concept-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const evidence = Buffer.from("nielsen public note,cooling,hair oil\n").toString("base64");
const csv = Buffer.from(
  "Category,Hair oils\nIdea,Herbal cooling hair oil\nAttribute,cooling\nBenchmark,Indulekha\n"
).toString("base64");

const created = await createProposition({ submitterDepartment: "R&D" });
await updateProposition(
  created.id,
  {
    name: "Concept card keep name",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil.",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    f1: {
      declaredAttribute: "cooling",
      evidenceSourceFile: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
    },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, mrpInr: 105.9 },
  },
  { writer: "server" }
);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "Open", role: "BM" },
    body: {
      attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: csv },
      provider: "claude",
    },
  },
  res,
  created.id,
  { sendJson, redactSecrets: (message) => String(message || "") }
);

assert.equal(res.statusCode, 500);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError || "", /API key missing/i);
assert.match(body.error || "", /API key missing/i);

const row = await getPropositionById(created.id);
assert.equal(row.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(row.name, "Concept card keep name");
assert.equal(row.category, "Hair oils");
assert.equal(row.ideaDescription, "A herbal cooling hair oil.");
assert.equal(row.f1.declaredAttribute, "cooling");
assert.equal(row.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(String(row.f1.evidenceSourceFile.data || "").length, evidence.length);
assert.equal(row.f2.cogsAtScale, 70);
assert.equal(row.f2.mrpInr, 105.9);

console.log("PASS concept card keeps the file name when extraction fails");
