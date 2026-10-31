/**
 * A concept card keeps its file name when reading fails, and does not clear typed fields.
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

const created = await createProposition({ submitterDepartment: "R&D" });
const evidence = Buffer.from("source,date\nNielsen,2024\n").toString("base64");
await updateProposition(
  created.id,
  {
    name: "Keep this name",
    category: "Hair oils",
    ideaDescription: "Typed herbal cooling hair oil.",
    f1: {
      declaredAttribute: "cooling feel",
      evidenceSourceFile: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
    },
    f2: { cogsAtScale: 70, netMarginAtScale: 22 },
  },
  { writer: "server" }
);

const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "Open", role: "ADMIN" },
    body: {
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("category,Hair oils\n").toString("base64"),
      },
    },
  },
  res,
  created.id,
  { sendJson: (response, status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); }, redactSecrets: (message) => String(message || "") }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError, /API key missing/i);

const stored = await getPropositionById(created.id);
assert.equal(stored.name, "Keep this name");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "Typed herbal cooling hair oil.");
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f1.declaredAttribute, "cooling feel");
assert.equal(stored.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(stored.f1.evidenceSourceFile.data, evidence);
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.netMarginAtScale, 22);

console.log("PASS concept card keeps the file name and the typed fields");
