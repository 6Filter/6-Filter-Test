/**
 * A concept-card upload keeps the file name and the typed row when extraction fails.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const created = await createProposition({ submitterDepartment: "R&D" });
const evidence = Buffer.from("evidence row,cooling\n").toString("base64");
await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: 105.9, grammage: "10g" },
    attachment: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
  },
  { writer: "server" }
);

const csv = Buffer.from("category,idea\nHair oils,Herbal cooling hair oil\n").toString("base64");
const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "Open", role: "ADMIN" },
    body: {
      provider: "claude",
      attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: csv },
    },
  },
  res,
  created.id,
  {
    sendJson(response, status, body) {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    },
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 500);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError || body.error, /API key/i);
assert.equal(body.proposition.name, "Live Check herbal cooling hair oil");
assert.equal(body.proposition.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(body.proposition.f2.cogsAtScale, 70);

const stored = await getPropositionById(created.id);
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.match(stored.ideaDescription, /cooling hair oil/);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f2.mrpInr, 105.9);
assert.equal(stored.attachment.name, "qa-evidence.csv");
assert.equal(stored.attachment.data, evidence);

console.log("PASS concept card keeps the file name when extraction fails");
