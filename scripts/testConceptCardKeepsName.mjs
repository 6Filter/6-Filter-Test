/**
 * A concept card with no NPD key still stores the file name and leaves typed fields alone.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const evidence = Buffer.from("evidence-bytes-concept-card").toString("base64");
const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for daily scalp use.",
    submitterName: "Live Tester",
    submitterDepartment: "NPD",
    f1: {
      evidenceSourceFile: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
    },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, grammage: "10g", mrpInr: 105.9 },
  },
  { writer: "server" }
);

const csv = Buffer.from("category,idea\nHair oils,herbal cooling hair oil\n").toString("base64");
const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "NPD" },
    body: {
      attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: csv },
      provider: "claude",
    },
  },
  res,
  created.id,
  {
    readBody: async (req) => req.body,
    sendJson: (response, status, body) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    },
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(String(body.extractError || ""), /API key/i);

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(Buffer.from(stored.f1.evidenceSourceFile.data, "base64").length, Buffer.from(evidence, "base64").length);
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "A herbal cooling hair oil for daily scalp use.");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.mrpInr, 105.9);
assert.equal(stored.submitterName, "Live Tester");

console.log("PASS concept card keeps the file name when the read fails");
