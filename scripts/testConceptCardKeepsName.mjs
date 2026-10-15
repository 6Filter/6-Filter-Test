/**
 * A concept card with no model key still stores the file name and leaves
 * the typed row alone.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-concept-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const evidence = Buffer.from("source,date\npublic cite,2024\n").toString("base64");
const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  created.id,
  {
    name: "Concept card keep name",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil.",
    submitterName: "Tester",
    submitterDepartment: "NPD",
    f1: {
      declaredAttribute: "cooling feel",
      evidenceSourceFile: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
    },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: 105.9, grammage: "10g" },
  },
  { writer: "server" }
);

const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "NPD", role: "ADMIN" },
    body: {
      provider: "claude",
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("category,Hair oils\nidea,herbal cooling hair oil\n").toString("base64"),
      },
    },
  },
  res,
  created.id,
  { sendJson: (response, status, body) => { response.statusCode = status; response.body = body; response.end(JSON.stringify(body)); }, redactSecrets: (message) => String(message || "") }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError, /API key/i);
assert.equal(body.proposition.name, "Concept card keep name");
assert.equal(body.proposition.f2.mrpInr, 105.9);
assert.equal(body.proposition.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(body.proposition.f1.evidenceSourceFile.data, evidence);

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f1.declaredAttribute, "cooling feel");
assert.equal(stored.f1.evidenceSourceFile.data, evidence);
assert.equal(stored.f2.gstRatePct, 18);
assert.equal(stored.name, "Concept card keep name");

console.log("PASS concept card keeps the file name when extraction has no key");
